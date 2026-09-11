// src/store/store.ts
import { create } from 'zustand';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  updateDoc,
  setDoc,
  onSnapshot,
  getDocs,
  writeBatch,
  arrayUnion,
  arrayRemove,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  WriteBatch,
} from 'firebase/firestore';
import { auth, db } from '../firebase';

export interface StoreItem {
  id: string;
  name: string;
  banner?: string;
}

// Représente un item imprimable (étiquette ou Pro-Pack) : même structure pour les deux
// catégories, qui vivent chacune dans leur propre collection Firestore indépendante.
export interface LabelItem {
  id: string;
  reference: string;
  filename: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  name: string;
  banner: string; // ex: "Canac", "BMR", "Rona", "Patrick Morin", "Indépendant"
  stores: string[]; // Liste des IDs de magasins assignés
  quantity?: number; // Quantité commandée (0-99)
}

// Trace historisée d'un PDF généré pour l'imprimeur : on ne conserve pas le fichier
// lui-même (ça demanderait Firebase Storage), seulement les informations qu'il contenait.
export interface PrintHistoryEntry {
  id: string;
  createdAt: Timestamp | null;
  totalReferences: number;
  totalQuantity: number;
  storeNames: string[];
  items: { reference: string; quantity: number; storeNames: string[] }[];
}

type PrintRunEntry = {
  totalReferences: number;
  totalQuantity: number;
  storeNames: string[];
  items: { reference: string; quantity: number; storeNames: string[] }[];
};

// Détection automatique de la bannière à partir du nom du magasin
export const detectBannerFromName = (name: string, explicitBanner?: string): string => {
  // Si une bannière valide a déjà été fournie manuellement, on la garde
  if (explicitBanner && explicitBanner !== 'Indépendant' && explicitBanner.trim() !== '') {
    return explicitBanner.trim();
  }

  const upper = name.toUpperCase();

  if (upper.includes('BMR')) return 'BMR';
  if (upper.includes('CANAC')) return 'Canac';
  if (upper.includes('RONA')) return 'Rona';
  if (upper.includes('PATRICK MORIN')) return 'Patrick Morin';
  return 'Indépendant';
};

interface AppState {
  labels: LabelItem[];
  proPack: LabelItem[];
  fanions: LabelItem[];
  stores: StoreItem[];
  printHistory: PrintHistoryEntry[];
  proPackPrintHistory: PrintHistoryEntry[];
  fanionsPrintHistory: PrintHistoryEntry[];
  isLoading: boolean;

  // Quantités personnelles des représentants : chaque représentant a ses propres
  // quantités par item, indépendantes de celles des autres représentants et de
  // celles utilisées côté équipe interne (voir REP_QUANTITIES_*_COLLECTION plus bas).
  repQuantitiesLabels: Record<string, number>;
  repQuantitiesProPack: Record<string, number>;
  repQuantitiesFanions: Record<string, number>;
  setRepQuantityLabels: (itemId: string, quantity: number) => void;
  setRepQuantityProPack: (itemId: string, quantity: number) => void;
  setRepQuantityFanions: (itemId: string, quantity: number) => void;

  // Actions Magasins
  addStore: (name: string, banner?: string) => Promise<void>;
  addStoresBatch: (stores: (string | { name: string; banner?: string })[]) => Promise<void>;
  updateStoreBanner: (storeIds: string[], banner: string) => Promise<void>;
  deleteStore: (id: string) => Promise<void>;
  deleteStoresBatch: (storeIds: string[]) => Promise<void>;
  autoFixBanners: () => Promise<void>;

  // Actions Étiquettes
  addLabelsBatch: (labels: LabelItem[]) => Promise<void>;
  updateLabel: (id: string, updatedFields: Partial<LabelItem>) => void;
  deleteLabel: (id: string) => Promise<void>;
  assignStoresToLabels: (labelIds: string[], storeIds: string[]) => Promise<void>;
  removeStoresFromLabels: (labelIds: string[], storeIds: string[]) => Promise<void>;
  clearLabels: () => Promise<void>;
  logPrintRun: (entry: PrintRunEntry) => Promise<void>;

  // Actions Pro-Pack (catalogue indépendant des étiquettes, même structure)
  addProPackBatch: (items: LabelItem[]) => Promise<void>;
  updateProPackItem: (id: string, updatedFields: Partial<LabelItem>) => void;
  deleteProPackItem: (id: string) => Promise<void>;
  assignStoresToProPack: (itemIds: string[], storeIds: string[]) => Promise<void>;
  removeStoresFromProPack: (itemIds: string[], storeIds: string[]) => Promise<void>;
  clearProPack: () => Promise<void>;
  logProPackPrintRun: (entry: PrintRunEntry) => Promise<void>;

  // Actions Fanions (catalogue indépendant des étiquettes et du Pro-Pack, même structure)
  addFanionsBatch: (items: LabelItem[]) => Promise<void>;
  updateFanionsItem: (id: string, updatedFields: Partial<LabelItem>) => void;
  deleteFanionsItem: (id: string) => Promise<void>;
  assignStoresToFanions: (itemIds: string[], storeIds: string[]) => Promise<void>;
  removeStoresFromFanions: (itemIds: string[], storeIds: string[]) => Promise<void>;
  clearFanions: () => Promise<void>;
  logFanionsPrintRun: (entry: PrintRunEntry) => Promise<void>;

  // Gestion de Projet (JSON)
  exportProject: () => void;
  importProject: (jsonData: { labels: LabelItem[]; proPack?: LabelItem[]; fanions?: LabelItem[]; stores: StoreItem[] }) => Promise<void>;
}

const STORES_COLLECTION = 'stores';
const LABELS_COLLECTION = 'labels';
const PROPACK_COLLECTION = 'proPack';
// Catalogue "Fanions" indépendant, distinct des anciennes collections "fanions" /
// "fanionPrintHistory" (celles-ci désignaient l'ancien nom du Pro-Pack avant son
// renommage — voir LEGACY_FANIONS_COLLECTION ci-dessous — et ne doivent surtout
// pas être réutilisées ici pour éviter de mélanger les deux catalogues).
const FANIONS_COLLECTION = 'fanionsItems';
const PRINT_HISTORY_COLLECTION = 'printHistory';
const PROPACK_PRINT_HISTORY_COLLECTION = 'proPackPrintHistory';
const FANIONS_PRINT_HISTORY_COLLECTION = 'fanionsItemsPrintHistory';
const PRINT_HISTORY_LIMIT = 50;

// Quantités personnelles des représentants, une collection par catégorie : chaque
// document est identifié par `${uid}_${itemId}` et ne contient que la quantité de
// CE représentant pour CET item — jamais lue ni écrite par un autre représentant
// ni par l'équipe interne, ce qui rend chaque commande de représentant totalement
// indépendante du catalogue partagé (item.quantity) et des autres représentants.
const REP_QUANTITIES_LABELS_COLLECTION = 'repQuantitiesLabels';
const REP_QUANTITIES_PROPACK_COLLECTION = 'repQuantitiesProPack';
const REP_QUANTITIES_FANIONS_COLLECTION = 'repQuantitiesFanions';

// Anciens noms de collection utilisés avant le renommage "Fanions" -> "Pro-Pack" :
// on y migre automatiquement une seule fois (voir startFirestoreSync) pour ne pas
// perdre les items déjà saisis, sans jamais supprimer les anciennes données.
const LEGACY_FANIONS_COLLECTION = 'fanions';
const LEGACY_FANION_PRINT_HISTORY_COLLECTION = 'fanionPrintHistory';

const DEFAULT_STORES: Omit<StoreItem, 'id'>[] = [
  { name: 'Canac Lévis', banner: 'Canac' },
  { name: 'Rona', banner: 'Rona' },
  { name: 'Home Depot', banner: 'Home Depot' },
];

// Firestore limite un batch à 500 opérations ; on découpe par prudence.
const BATCH_LIMIT = 400;

const commitInChunks = async <T>(items: T[], applyOp: (batch: WriteBatch, item: T) => void) => {
  for (let i = 0; i < items.length; i += BATCH_LIMIT) {
    const chunk = items.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    chunk.forEach((item) => applyOp(batch, item));
    await batch.commit();
  }
};

// --- Helpers génériques, paramétrés par le nom de collection Firestore, partagés
// entre les étiquettes et le Pro-Pack : chaque catégorie appelle ces mêmes fonctions
// avec sa propre collection, ce qui les rend indépendantes l'une de l'autre côté données.

const addItemsBatchTo = async (collectionName: string, newItems: LabelItem[]) => {
  await commitInChunks(newItems, (batch, item) => {
    const { id, ...rest } = item;
    batch.set(doc(db, collectionName, id), rest);
  });
};

const deleteItemFrom = async (
  collectionName: string,
  pendingWrites: Map<string, ReturnType<typeof setTimeout>>,
  id: string
) => {
  const pending = pendingWrites.get(id);
  if (pending) {
    clearTimeout(pending);
    pendingWrites.delete(id);
  }
  await deleteDoc(doc(db, collectionName, id));
};

const assignStoresTo = async (collectionName: string, itemIds: string[], storeIds: string[]) => {
  await commitInChunks(itemIds, (batch, id) => {
    batch.update(doc(db, collectionName, id), { stores: arrayUnion(...storeIds) });
  });
};

const removeStoresFrom = async (collectionName: string, itemIds: string[], storeIds: string[]) => {
  await commitInChunks(itemIds, (batch, id) => {
    batch.update(doc(db, collectionName, id), { stores: arrayRemove(...storeIds) });
  });
};

const clearItemsFrom = async (collectionName: string, currentItems: LabelItem[]) => {
  await commitInChunks(currentItems, (batch, item) => {
    batch.delete(doc(db, collectionName, item.id));
  });
};

const logRunTo = async (historyCollectionName: string, entry: PrintRunEntry) => {
  await addDoc(collection(db, historyCollectionName), {
    ...entry,
    createdAt: serverTimestamp(),
  });
};

// Copie tous les documents d'une ancienne collection vers la nouvelle, sans jamais
// supprimer l'ancienne (migration additive uniquement, sans risque de perte).
const migrateLegacyCollection = async (fromCollection: string, toCollection: string) => {
  const legacySnapshot = await getDocs(collection(db, fromCollection));
  if (legacySnapshot.empty) return false;
  const batch = writeBatch(db);
  legacySnapshot.docs.forEach((d) => {
    batch.set(doc(db, toCollection, d.id), d.data());
  });
  await batch.commit();
  return true;
};

// Débounce des écritures Firestore par item (évite une requête réseau par frappe
// clavier sur les champs référence/quantité) tout en gardant l'UI réactive localement.
// Une Map indépendante par catégorie : une frappe sur un item Pro-Pack ne retarde pas
// l'écriture en cours sur une étiquette, et vice-versa.
const pendingLabelWrites = new Map<string, ReturnType<typeof setTimeout>>();
const pendingProPackWrites = new Map<string, ReturnType<typeof setTimeout>>();
const pendingFanionsWrites = new Map<string, ReturnType<typeof setTimeout>>();
const pendingRepQuantityWrites = new Map<string, ReturnType<typeof setTimeout>>();
const LABEL_WRITE_DEBOUNCE_MS = 500;

// Écrit la quantité personnelle d'un représentant pour un item donné, dans la
// collection dédiée à la catégorie. Le document (identifié par `${uid}_${itemId}`)
// peut ne pas encore exister (setDoc + merge au lieu de updateDoc), et le filtrage
// par uid côté lecture (voir startFirestoreSync) garantit qu'aucun autre
// utilisateur ne voit ou n'écrase cette valeur.
const setRepQuantityTo = (
  collectionName: string,
  stateKey: 'repQuantitiesLabels' | 'repQuantitiesProPack' | 'repQuantitiesFanions',
  itemId: string,
  quantity: number
) => {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  useAppStore.setState((state) => ({
    [stateKey]: { ...state[stateKey], [itemId]: quantity },
  }));

  const debounceKey = `${collectionName}:${itemId}`;
  const existingTimeout = pendingRepQuantityWrites.get(debounceKey);
  if (existingTimeout) clearTimeout(existingTimeout);
  pendingRepQuantityWrites.set(
    debounceKey,
    setTimeout(() => {
      pendingRepQuantityWrites.delete(debounceKey);
      setDoc(doc(db, collectionName, `${uid}_${itemId}`), { uid, itemId, quantity }, { merge: true }).catch(() => {});
    }, LABEL_WRITE_DEBOUNCE_MS)
  );
};

export const useAppStore = create<AppState>()((set, get) => ({
  labels: [],
  proPack: [],
  fanions: [],
  stores: [],
  printHistory: [],
  proPackPrintHistory: [],
  fanionsPrintHistory: [],
  isLoading: true,

  repQuantitiesLabels: {},
  repQuantitiesProPack: {},
  repQuantitiesFanions: {},
  setRepQuantityLabels: (itemId, quantity) =>
    setRepQuantityTo(REP_QUANTITIES_LABELS_COLLECTION, 'repQuantitiesLabels', itemId, quantity),
  setRepQuantityProPack: (itemId, quantity) =>
    setRepQuantityTo(REP_QUANTITIES_PROPACK_COLLECTION, 'repQuantitiesProPack', itemId, quantity),
  setRepQuantityFanions: (itemId, quantity) =>
    setRepQuantityTo(REP_QUANTITIES_FANIONS_COLLECTION, 'repQuantitiesFanions', itemId, quantity),

  addStore: async (name, banner) => {
    const id = crypto.randomUUID();
    const batch = writeBatch(db);
    batch.set(doc(db, STORES_COLLECTION, id), {
      name: name.trim(),
      banner: detectBannerFromName(name, banner),
    });
    await batch.commit();
  },

  addStoresBatch: async (newStoresInput) => {
    const newStores = newStoresInput
      .map((s) => {
        if (typeof s === 'string') {
          return { name: s.trim(), banner: undefined as string | undefined };
        }
        return { name: s.name.trim(), banner: s.banner?.trim() };
      })
      .filter((s) => s.name.length > 0)
      .map((s) => ({
        id: crypto.randomUUID(),
        name: s.name,
        banner: detectBannerFromName(s.name, s.banner),
      }));

    await commitInChunks(newStores, (batch, s) => {
      batch.set(doc(db, STORES_COLLECTION, s.id), { name: s.name, banner: s.banner });
    });
  },

  autoFixBanners: async () => {
    await commitInChunks(get().stores, (batch, s) => {
      batch.update(doc(db, STORES_COLLECTION, s.id), { banner: detectBannerFromName(s.name, s.banner) });
    });
  },

  updateStoreBanner: async (storeIds, banner) => {
    await commitInChunks(storeIds, (batch, id) => {
      batch.update(doc(db, STORES_COLLECTION, id), { banner: banner.trim() });
    });
  },

  deleteStore: async (id) => {
    const affectedLabels = get().labels.filter((l) => l.stores.includes(id));
    const affectedProPack = get().proPack.filter((f) => f.stores.includes(id));
    const affectedFanions = get().fanions.filter((f) => f.stores.includes(id));
    const batch = writeBatch(db);
    batch.delete(doc(db, STORES_COLLECTION, id));
    await batch.commit();
    await commitInChunks(affectedLabels, (b, l) => {
      b.update(doc(db, LABELS_COLLECTION, l.id), { stores: arrayRemove(id) });
    });
    await commitInChunks(affectedProPack, (b, f) => {
      b.update(doc(db, PROPACK_COLLECTION, f.id), { stores: arrayRemove(id) });
    });
    await commitInChunks(affectedFanions, (b, f) => {
      b.update(doc(db, FANIONS_COLLECTION, f.id), { stores: arrayRemove(id) });
    });
  },

  deleteStoresBatch: async (storeIds) => {
    await commitInChunks(storeIds, (batch, id) => {
      batch.delete(doc(db, STORES_COLLECTION, id));
    });
    const affectedLabels = get().labels.filter((l) => l.stores.some((sId) => storeIds.includes(sId)));
    await commitInChunks(affectedLabels, (batch, l) => {
      batch.update(doc(db, LABELS_COLLECTION, l.id), {
        stores: l.stores.filter((sId) => !storeIds.includes(sId)),
      });
    });
    const affectedProPack = get().proPack.filter((f) => f.stores.some((sId) => storeIds.includes(sId)));
    await commitInChunks(affectedProPack, (batch, f) => {
      batch.update(doc(db, PROPACK_COLLECTION, f.id), {
        stores: f.stores.filter((sId) => !storeIds.includes(sId)),
      });
    });
    const affectedFanions = get().fanions.filter((f) => f.stores.some((sId) => storeIds.includes(sId)));
    await commitInChunks(affectedFanions, (batch, f) => {
      batch.update(doc(db, FANIONS_COLLECTION, f.id), {
        stores: f.stores.filter((sId) => !storeIds.includes(sId)),
      });
    });
  },

  addLabelsBatch: (newLabels) => addItemsBatchTo(LABELS_COLLECTION, newLabels),

  updateLabel: (id, updatedFields) => {
    // Mise à jour optimiste immédiate pour garder la saisie fluide...
    set((state) => ({
      labels: state.labels.map((l) => (l.id === id ? { ...l, ...updatedFields } : l)),
    }));

    // ...écriture Firestore différée pour éviter une requête réseau par frappe.
    const existingTimeout = pendingLabelWrites.get(id);
    if (existingTimeout) clearTimeout(existingTimeout);
    pendingLabelWrites.set(
      id,
      setTimeout(() => {
        pendingLabelWrites.delete(id);
        updateDoc(doc(db, LABELS_COLLECTION, id), updatedFields).catch(() => {
          // L'étiquette a probablement été supprimée entre-temps : rien à faire.
        });
      }, LABEL_WRITE_DEBOUNCE_MS)
    );
  },

  deleteLabel: (id) => deleteItemFrom(LABELS_COLLECTION, pendingLabelWrites, id),
  assignStoresToLabels: (labelIds, storeIds) => assignStoresTo(LABELS_COLLECTION, labelIds, storeIds),
  removeStoresFromLabels: (labelIds, storeIds) => removeStoresFrom(LABELS_COLLECTION, labelIds, storeIds),
  clearLabels: () => clearItemsFrom(LABELS_COLLECTION, get().labels),
  logPrintRun: (entry) => logRunTo(PRINT_HISTORY_COLLECTION, entry),

  addProPackBatch: (newItems) => addItemsBatchTo(PROPACK_COLLECTION, newItems),

  updateProPackItem: (id, updatedFields) => {
    set((state) => ({
      proPack: state.proPack.map((f) => (f.id === id ? { ...f, ...updatedFields } : f)),
    }));

    const existingTimeout = pendingProPackWrites.get(id);
    if (existingTimeout) clearTimeout(existingTimeout);
    pendingProPackWrites.set(
      id,
      setTimeout(() => {
        pendingProPackWrites.delete(id);
        updateDoc(doc(db, PROPACK_COLLECTION, id), updatedFields).catch(() => {
          // L'item a probablement été supprimé entre-temps : rien à faire.
        });
      }, LABEL_WRITE_DEBOUNCE_MS)
    );
  },

  deleteProPackItem: (id) => deleteItemFrom(PROPACK_COLLECTION, pendingProPackWrites, id),
  assignStoresToProPack: (itemIds, storeIds) => assignStoresTo(PROPACK_COLLECTION, itemIds, storeIds),
  removeStoresFromProPack: (itemIds, storeIds) => removeStoresFrom(PROPACK_COLLECTION, itemIds, storeIds),
  clearProPack: () => clearItemsFrom(PROPACK_COLLECTION, get().proPack),
  logProPackPrintRun: (entry) => logRunTo(PROPACK_PRINT_HISTORY_COLLECTION, entry),

  addFanionsBatch: (newItems) => addItemsBatchTo(FANIONS_COLLECTION, newItems),

  updateFanionsItem: (id, updatedFields) => {
    set((state) => ({
      fanions: state.fanions.map((f) => (f.id === id ? { ...f, ...updatedFields } : f)),
    }));

    const existingTimeout = pendingFanionsWrites.get(id);
    if (existingTimeout) clearTimeout(existingTimeout);
    pendingFanionsWrites.set(
      id,
      setTimeout(() => {
        pendingFanionsWrites.delete(id);
        updateDoc(doc(db, FANIONS_COLLECTION, id), updatedFields).catch(() => {
          // L'item a probablement été supprimé entre-temps : rien à faire.
        });
      }, LABEL_WRITE_DEBOUNCE_MS)
    );
  },

  deleteFanionsItem: (id) => deleteItemFrom(FANIONS_COLLECTION, pendingFanionsWrites, id),
  assignStoresToFanions: (itemIds, storeIds) => assignStoresTo(FANIONS_COLLECTION, itemIds, storeIds),
  removeStoresFromFanions: (itemIds, storeIds) => removeStoresFrom(FANIONS_COLLECTION, itemIds, storeIds),
  clearFanions: () => clearItemsFrom(FANIONS_COLLECTION, get().fanions),
  logFanionsPrintRun: (entry) => logRunTo(FANIONS_PRINT_HISTORY_COLLECTION, entry),

  // Exporter tout le projet en JSON (étiquettes, Pro-Pack, Fanions et magasins)
  exportProject: () => {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      stores: get().stores,
      labels: get().labels,
      proPack: get().proPack,
      fanions: get().fanions,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `labelflow_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  },

  // Importer un projet JSON existant (remplace les données partagées Firestore)
  importProject: async (jsonData) => {
    if (!jsonData.stores || !jsonData.labels) return;

    await commitInChunks(get().labels, (batch, l) => {
      batch.delete(doc(db, LABELS_COLLECTION, l.id));
    });
    await commitInChunks(get().proPack, (batch, f) => {
      batch.delete(doc(db, PROPACK_COLLECTION, f.id));
    });
    await commitInChunks(get().fanions, (batch, f) => {
      batch.delete(doc(db, FANIONS_COLLECTION, f.id));
    });
    await commitInChunks(get().stores, (batch, s) => {
      batch.delete(doc(db, STORES_COLLECTION, s.id));
    });
    await commitInChunks(jsonData.stores, (batch, s) => {
      const { id, ...rest } = s;
      batch.set(doc(db, STORES_COLLECTION, id), rest);
    });
    await commitInChunks(jsonData.labels, (batch, l) => {
      const { id, ...rest } = l;
      batch.set(doc(db, LABELS_COLLECTION, id), rest);
    });
    if (jsonData.proPack) {
      await commitInChunks(jsonData.proPack, (batch, f) => {
        const { id, ...rest } = f;
        batch.set(doc(db, PROPACK_COLLECTION, id), rest);
      });
    }
    if (jsonData.fanions) {
      await commitInChunks(jsonData.fanions, (batch, f) => {
        const { id, ...rest } = f;
        batch.set(doc(db, FANIONS_COLLECTION, id), rest);
      });
    }
  },
}));

let storesLoaded = false;
let labelsLoaded = false;
let proPackLoaded = false;
let fanionsLoaded = false;
let defaultStoresSeeded = false;
let proPackMigrated = false;
let proPackHistoryMigrated = false;
let unsubscribeStores: (() => void) | null = null;
let unsubscribeLabels: (() => void) | null = null;
let unsubscribeProPack: (() => void) | null = null;
let unsubscribeFanions: (() => void) | null = null;
let unsubscribePrintHistory: (() => void) | null = null;
let unsubscribeProPackPrintHistory: (() => void) | null = null;
let unsubscribeFanionsPrintHistory: (() => void) | null = null;
let unsubscribeRepQuantitiesLabels: (() => void) | null = null;
let unsubscribeRepQuantitiesProPack: (() => void) | null = null;
let unsubscribeRepQuantitiesFanions: (() => void) | null = null;

const markLoadedIfReady = () => {
  if (storesLoaded && labelsLoaded && proPackLoaded && fanionsLoaded) {
    useAppStore.setState({ isLoading: false });
  }
};

// La synchronisation Firestore ne démarre qu'une fois l'utilisateur authentifié
// (les règles de sécurité exigent request.auth != null) et s'arrête à la déconnexion.
// `uid` sert à filtrer les quantités personnelles des représentants (voir plus bas)
// pour que chacun ne charge et ne voie jamais que les siennes.
const startFirestoreSync = (uid: string) => {
  storesLoaded = false;
  labelsLoaded = false;
  proPackLoaded = false;
  fanionsLoaded = false;

  unsubscribeStores = onSnapshot(
    collection(db, STORES_COLLECTION),
    async (snapshot) => {
      // Amorce les magasins par défaut si la collection est vide au tout premier chargement.
      if (snapshot.empty && !storesLoaded && !defaultStoresSeeded) {
        defaultStoresSeeded = true;
        const batch = writeBatch(db);
        for (const s of DEFAULT_STORES) {
          batch.set(doc(collection(db, STORES_COLLECTION)), s);
        }
        await batch.commit();
        return; // le prochain snapshot contiendra les magasins par défaut
      }

      const stores = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as StoreItem);
      useAppStore.setState({ stores });
      storesLoaded = true;
      markLoadedIfReady();
    },
    (error) => console.error('Erreur de synchronisation des magasins :', error)
  );

  unsubscribeLabels = onSnapshot(
    collection(db, LABELS_COLLECTION),
    (snapshot) => {
      const labels = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as LabelItem);
      useAppStore.setState({ labels });
      labelsLoaded = true;
      markLoadedIfReady();
    },
    (error) => console.error('Erreur de synchronisation des étiquettes :', error)
  );

  unsubscribeProPack = onSnapshot(
    collection(db, PROPACK_COLLECTION),
    async (snapshot) => {
      // Migre une seule fois les items de l'ancienne collection "fanions" (avant le
      // renommage en Pro-Pack) si la nouvelle collection est encore vide.
      if (snapshot.empty && !proPackLoaded && !proPackMigrated) {
        proPackMigrated = true;
        const migrated = await migrateLegacyCollection(LEGACY_FANIONS_COLLECTION, PROPACK_COLLECTION);
        if (migrated) return; // le prochain snapshot contiendra les items migrés
      }

      const proPack = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as LabelItem);
      useAppStore.setState({ proPack });
      proPackLoaded = true;
      markLoadedIfReady();
    },
    (error) => console.error('Erreur de synchronisation du Pro-Pack :', error)
  );

  unsubscribeFanions = onSnapshot(
    collection(db, FANIONS_COLLECTION),
    (snapshot) => {
      const fanions = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as LabelItem);
      useAppStore.setState({ fanions });
      fanionsLoaded = true;
      markLoadedIfReady();
    },
    (error) => console.error('Erreur de synchronisation des Fanions :', error)
  );

  unsubscribePrintHistory = onSnapshot(
    query(collection(db, PRINT_HISTORY_COLLECTION), orderBy('createdAt', 'desc'), limit(PRINT_HISTORY_LIMIT)),
    (snapshot) => {
      const printHistory = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as PrintHistoryEntry);
      useAppStore.setState({ printHistory });
    },
    (error) => console.error("Erreur de synchronisation de l'historique d'impression :", error)
  );

  unsubscribeProPackPrintHistory = onSnapshot(
    query(collection(db, PROPACK_PRINT_HISTORY_COLLECTION), orderBy('createdAt', 'desc'), limit(PRINT_HISTORY_LIMIT)),
    async (snapshot) => {
      if (snapshot.empty && !proPackHistoryMigrated) {
        proPackHistoryMigrated = true;
        const migrated = await migrateLegacyCollection(
          LEGACY_FANION_PRINT_HISTORY_COLLECTION,
          PROPACK_PRINT_HISTORY_COLLECTION
        );
        if (migrated) return;
      }

      const proPackPrintHistory = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as PrintHistoryEntry);
      useAppStore.setState({ proPackPrintHistory });
    },
    (error) => console.error("Erreur de synchronisation de l'historique d'impression Pro-Pack :", error)
  );

  unsubscribeFanionsPrintHistory = onSnapshot(
    query(collection(db, FANIONS_PRINT_HISTORY_COLLECTION), orderBy('createdAt', 'desc'), limit(PRINT_HISTORY_LIMIT)),
    (snapshot) => {
      const fanionsPrintHistory = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as PrintHistoryEntry);
      useAppStore.setState({ fanionsPrintHistory });
    },
    (error) => console.error("Erreur de synchronisation de l'historique d'impression Fanions :", error)
  );

  // Quantités personnelles des représentants : filtrées par uid dès la requête
  // Firestore (pas seulement côté affichage), pour que ce représentant ne
  // reçoive jamais les quantités d'un autre représentant.
  unsubscribeRepQuantitiesLabels = onSnapshot(
    query(collection(db, REP_QUANTITIES_LABELS_COLLECTION), where('uid', '==', uid)),
    (snapshot) => {
      const repQuantitiesLabels: Record<string, number> = {};
      snapshot.docs.forEach((d) => {
        const data = d.data() as { itemId: string; quantity: number };
        repQuantitiesLabels[data.itemId] = data.quantity;
      });
      useAppStore.setState({ repQuantitiesLabels });
    },
    (error) => console.error('Erreur de synchronisation des quantités personnelles (Étiquettes) :', error)
  );

  unsubscribeRepQuantitiesProPack = onSnapshot(
    query(collection(db, REP_QUANTITIES_PROPACK_COLLECTION), where('uid', '==', uid)),
    (snapshot) => {
      const repQuantitiesProPack: Record<string, number> = {};
      snapshot.docs.forEach((d) => {
        const data = d.data() as { itemId: string; quantity: number };
        repQuantitiesProPack[data.itemId] = data.quantity;
      });
      useAppStore.setState({ repQuantitiesProPack });
    },
    (error) => console.error('Erreur de synchronisation des quantités personnelles (Pro-Pack) :', error)
  );

  unsubscribeRepQuantitiesFanions = onSnapshot(
    query(collection(db, REP_QUANTITIES_FANIONS_COLLECTION), where('uid', '==', uid)),
    (snapshot) => {
      const repQuantitiesFanions: Record<string, number> = {};
      snapshot.docs.forEach((d) => {
        const data = d.data() as { itemId: string; quantity: number };
        repQuantitiesFanions[data.itemId] = data.quantity;
      });
      useAppStore.setState({ repQuantitiesFanions });
    },
    (error) => console.error('Erreur de synchronisation des quantités personnelles (Fanions) :', error)
  );
};

const stopFirestoreSync = () => {
  unsubscribeStores?.();
  unsubscribeLabels?.();
  unsubscribeProPack?.();
  unsubscribeFanions?.();
  unsubscribePrintHistory?.();
  unsubscribeProPackPrintHistory?.();
  unsubscribeFanionsPrintHistory?.();
  unsubscribeRepQuantitiesLabels?.();
  unsubscribeRepQuantitiesProPack?.();
  unsubscribeRepQuantitiesFanions?.();
  unsubscribeStores = null;
  unsubscribeLabels = null;
  unsubscribeProPack = null;
  unsubscribeFanions = null;
  unsubscribePrintHistory = null;
  unsubscribeProPackPrintHistory = null;
  unsubscribeFanionsPrintHistory = null;
  unsubscribeRepQuantitiesLabels = null;
  unsubscribeRepQuantitiesProPack = null;
  unsubscribeRepQuantitiesFanions = null;
  defaultStoresSeeded = false;
  useAppStore.setState({
    labels: [],
    proPack: [],
    fanions: [],
    stores: [],
    printHistory: [],
    proPackPrintHistory: [],
    fanionsPrintHistory: [],
    repQuantitiesLabels: {},
    repQuantitiesProPack: {},
    repQuantitiesFanions: {},
    isLoading: true,
  });
};

onAuthStateChanged(auth, (user) => {
  if (user) {
    startFirestoreSync(user.uid);
  } else {
    stopFirestoreSync();
  }
});
