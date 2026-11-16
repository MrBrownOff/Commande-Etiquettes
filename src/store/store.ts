// src/store/store.ts
import { create } from 'zustand';
import {
  dataService,
  CATALOG_KINDS,
  CatalogKind,
  AppUser,
  LabelItem,
  PrintHistoryEntry,
  PrintRunEntry,
  StoreItem,
  UserRole,
  RepSelections,
  inferRoleFromEmail,
} from '../data';

// Les types métier vivent dans src/data/types.ts (indépendants du back-end) ;
// ils restent importables depuis le store pour ne pas toucher aux composants.
export type { AppUser, LabelItem, PrintHistoryEntry, StoreItem, UserRole };
export { inferRoleFromEmail };

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
  // Magasins associés par ce représentant à chaque item (personnels, eux aussi :
  // n'affectent jamais item.stores du catalogue partagé).
  repStoresLabels: Record<string, string[]>;
  repStoresProPack: Record<string, string[]>;
  repStoresFanions: Record<string, string[]>;
  setRepStoresLabels: (itemIds: string[], storeIds: string[]) => void;
  setRepStoresProPack: (itemIds: string[], storeIds: string[]) => void;
  setRepStoresFanions: (itemIds: string[], storeIds: string[]) => void;

  // Rôle du compte connecté (voir inferRoleFromEmail ci-dessus) et, pour un
  // admin uniquement, la liste des comptes déjà connectés au moins une fois
  // (alimente le panneau « Accès »).
  userRole: UserRole | null;
  userName: string | null;
  users: AppUser[];
  updateUserRole: (uid: string, role: UserRole) => Promise<void>;
  updateUserName: (uid: string, name: string) => Promise<void>;

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
  clearPrintHistory: () => Promise<void>;

  // Actions Pro-Pack (catalogue indépendant des étiquettes, même structure)
  addProPackBatch: (items: LabelItem[]) => Promise<void>;
  updateProPackItem: (id: string, updatedFields: Partial<LabelItem>) => void;
  deleteProPackItem: (id: string) => Promise<void>;
  assignStoresToProPack: (itemIds: string[], storeIds: string[]) => Promise<void>;
  removeStoresFromProPack: (itemIds: string[], storeIds: string[]) => Promise<void>;
  clearProPack: () => Promise<void>;
  logProPackPrintRun: (entry: PrintRunEntry) => Promise<void>;
  clearProPackPrintHistory: () => Promise<void>;

  // Actions Fanions (catalogue indépendant des étiquettes et du Pro-Pack, même structure)
  addFanionsBatch: (items: LabelItem[]) => Promise<void>;
  updateFanionsItem: (id: string, updatedFields: Partial<LabelItem>) => void;
  deleteFanionsItem: (id: string) => Promise<void>;
  assignStoresToFanions: (itemIds: string[], storeIds: string[]) => Promise<void>;
  removeStoresFromFanions: (itemIds: string[], storeIds: string[]) => Promise<void>;
  clearFanions: () => Promise<void>;
  logFanionsPrintRun: (entry: PrintRunEntry) => Promise<void>;
  clearFanionsPrintHistory: () => Promise<void>;

  // Gestion de Projet (JSON)
  exportProject: () => void;
  importProject: (jsonData: { labels: LabelItem[]; proPack?: LabelItem[]; fanions?: LabelItem[]; stores: StoreItem[] }) => Promise<void>;
}


const PRINT_HISTORY_LIMIT = 200;
const LABEL_WRITE_DEBOUNCE_MS = 500;

// Tout accès aux données passe par `dataService` (src/data) : le store ne garde que
// l'état, les mises à jour optimistes et le débounce des écritures par frappe.

type StateKeys = {
  items: 'labels' | 'proPack' | 'fanions';
  history: 'printHistory' | 'proPackPrintHistory' | 'fanionsPrintHistory';
  repQuantities: 'repQuantitiesLabels' | 'repQuantitiesProPack' | 'repQuantitiesFanions';
  repStores: 'repStoresLabels' | 'repStoresProPack' | 'repStoresFanions';
};

const KEYS: Record<CatalogKind, StateKeys> = {
  labels: {
    items: 'labels',
    history: 'printHistory',
    repQuantities: 'repQuantitiesLabels',
    repStores: 'repStoresLabels',
  },
  propack: {
    items: 'proPack',
    history: 'proPackPrintHistory',
    repQuantities: 'repQuantitiesProPack',
    repStores: 'repStoresProPack',
  },
  fanions: {
    items: 'fanions',
    history: 'fanionsPrintHistory',
    repQuantities: 'repQuantitiesFanions',
    repStores: 'repStoresFanions',
  },
};

// Débounce des écritures par item (évite une requête réseau par frappe clavier sur
// les champs référence/quantité) tout en gardant l'UI réactive localement. Une Map
// indépendante par catalogue : une frappe sur un Pro-Pack ne retarde pas l'écriture
// en cours sur une étiquette, et vice-versa.
const pendingItemWrites: Record<CatalogKind, Map<string, ReturnType<typeof setTimeout>>> = {
  labels: new Map(),
  propack: new Map(),
  fanions: new Map(),
};
const pendingRepQuantityWrites = new Map<string, ReturnType<typeof setTimeout>>();

const updateItemIn = (kind: CatalogKind, id: string, updatedFields: Partial<LabelItem>) => {
  const key = KEYS[kind].items;
  // Mise à jour optimiste immédiate pour garder la saisie fluide...
  useAppStore.setState((state) => ({
    [key]: state[key].map((i) => (i.id === id ? { ...i, ...updatedFields } : i)),
  }));

  // ...écriture différée pour éviter une requête réseau par frappe.
  const pending = pendingItemWrites[kind];
  const existingTimeout = pending.get(id);
  if (existingTimeout) clearTimeout(existingTimeout);
  pending.set(
    id,
    setTimeout(() => {
      pending.delete(id);
      dataService.updateItem(kind, id, updatedFields).catch(() => {
        // L'item a probablement été supprimé entre-temps : rien à faire.
      });
    }, LABEL_WRITE_DEBOUNCE_MS)
  );
};

const deleteItemIn = async (kind: CatalogKind, id: string) => {
  const pending = pendingItemWrites[kind];
  const timeout = pending.get(id);
  if (timeout) {
    clearTimeout(timeout);
    pending.delete(id);
  }
  await dataService.deleteItem(kind, id);
};

const logRunIn = async (kind: CatalogKind, entry: PrintRunEntry) => {
  const uid = dataService.getCurrentUserId();
  const { userRole, userName } = useAppStore.getState();
  await dataService.logPrintRun(kind, entry, {
    ...(uid ? { uid } : {}),
    ...(userRole === 'representant' && userName ? { repName: userName } : {}),
  });
};

// Écrit la quantité personnelle d'un représentant pour un item donné : état local
// immédiat, écriture différée. Le filtrage par uid côté lecture garantit
// qu'aucun autre utilisateur ne voit ou n'écrase cette valeur.
const setRepQuantityIn = (kind: CatalogKind, itemId: string, quantity: number) => {
  const uid = dataService.getCurrentUserId();
  if (!uid) return;
  const key = KEYS[kind].repQuantities;

  useAppStore.setState((state) => ({
    [key]: { ...state[key], [itemId]: quantity },
  }));

  const debounceKey = `${kind}:${itemId}`;
  const existingTimeout = pendingRepQuantityWrites.get(debounceKey);
  if (existingTimeout) clearTimeout(existingTimeout);
  pendingRepQuantityWrites.set(
    debounceKey,
    setTimeout(() => {
      pendingRepQuantityWrites.delete(debounceKey);
      dataService.saveRepQuantity(kind, uid, itemId, quantity).catch(() => {});
    }, LABEL_WRITE_DEBOUNCE_MS)
  );
};

// Magasins associés par un représentant à un ou plusieurs items (personnels : ils
// n'affectent jamais item.stores du catalogue partagé).
const setRepStoresIn = (kind: CatalogKind, itemIds: string[], storeIds: string[]) => {
  const uid = dataService.getCurrentUserId();
  if (!uid || itemIds.length === 0) return;
  const key = KEYS[kind].repStores;

  useAppStore.setState((state) => {
    const next = { ...state[key] };
    itemIds.forEach((id) => {
      next[id] = storeIds;
    });
    return { [key]: next };
  });

  dataService.saveRepStores(kind, uid, itemIds, storeIds).catch(() => {});
};

// Retire des catalogues les magasins supprimés.
const unlinkStoresFromCatalogs = async (storeIds: string[]) => {
  const state = useAppStore.getState();
  for (const kind of CATALOG_KINDS) {
    const affected = state[KEYS[kind].items].filter((i) => i.stores.some((sId) => storeIds.includes(sId)));
    if (affected.length > 0) {
      await dataService.removeStores(
        kind,
        affected.map((i) => i.id),
        storeIds
      );
    }
  }
};

export const useAppStore = create<AppState>()((_set, get) => ({
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
  setRepQuantityLabels: (itemId, quantity) => setRepQuantityIn('labels', itemId, quantity),
  setRepQuantityProPack: (itemId, quantity) => setRepQuantityIn('propack', itemId, quantity),
  setRepQuantityFanions: (itemId, quantity) => setRepQuantityIn('fanions', itemId, quantity),

  repStoresLabels: {},
  repStoresProPack: {},
  repStoresFanions: {},
  setRepStoresLabels: (itemIds, storeIds) => setRepStoresIn('labels', itemIds, storeIds),
  setRepStoresProPack: (itemIds, storeIds) => setRepStoresIn('propack', itemIds, storeIds),
  setRepStoresFanions: (itemIds, storeIds) => setRepStoresIn('fanions', itemIds, storeIds),

  userRole: null,
  userName: null,
  users: [],
  updateUserRole: (uid, role) => dataService.updateUserRole(uid, role),
  updateUserName: (uid, name) => dataService.updateUserName(uid, name.trim()),

  addStore: (name, banner) =>
    dataService.addStores([{ id: crypto.randomUUID(), name: name.trim(), banner: detectBannerFromName(name, banner) }]),

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

    await dataService.addStores(newStores);
  },

  autoFixBanners: () =>
    dataService.updateStoreBanners(
      get().stores.map((s) => ({ id: s.id, banner: detectBannerFromName(s.name, s.banner) }))
    ),

  updateStoreBanner: (storeIds, banner) =>
    dataService.updateStoreBanners(storeIds.map((id) => ({ id, banner: banner.trim() }))),

  deleteStore: async (id) => {
    await dataService.deleteStores([id]);
    await unlinkStoresFromCatalogs([id]);
  },

  deleteStoresBatch: async (storeIds) => {
    await dataService.deleteStores(storeIds);
    await unlinkStoresFromCatalogs(storeIds);
  },

  addLabelsBatch: (items) => dataService.addItems('labels', items),
  updateLabel: (id, fields) => updateItemIn('labels', id, fields),
  deleteLabel: (id) => deleteItemIn('labels', id),
  assignStoresToLabels: (ids, storeIds) => dataService.assignStores('labels', ids, storeIds),
  removeStoresFromLabels: (ids, storeIds) => dataService.removeStores('labels', ids, storeIds),
  clearLabels: () => dataService.clearItems('labels', get().labels),
  logPrintRun: (entry) => logRunIn('labels', entry),
  clearPrintHistory: () => dataService.clearHistory('labels'),

  addProPackBatch: (items) => dataService.addItems('propack', items),
  updateProPackItem: (id, fields) => updateItemIn('propack', id, fields),
  deleteProPackItem: (id) => deleteItemIn('propack', id),
  assignStoresToProPack: (ids, storeIds) => dataService.assignStores('propack', ids, storeIds),
  removeStoresFromProPack: (ids, storeIds) => dataService.removeStores('propack', ids, storeIds),
  clearProPack: () => dataService.clearItems('propack', get().proPack),
  logProPackPrintRun: (entry) => logRunIn('propack', entry),
  clearProPackPrintHistory: () => dataService.clearHistory('propack'),

  addFanionsBatch: (items) => dataService.addItems('fanions', items),
  updateFanionsItem: (id, fields) => updateItemIn('fanions', id, fields),
  deleteFanionsItem: (id) => deleteItemIn('fanions', id),
  assignStoresToFanions: (ids, storeIds) => dataService.assignStores('fanions', ids, storeIds),
  removeStoresFromFanions: (ids, storeIds) => dataService.removeStores('fanions', ids, storeIds),
  clearFanions: () => dataService.clearItems('fanions', get().fanions),
  logFanionsPrintRun: (entry) => logRunIn('fanions', entry),
  clearFanionsPrintHistory: () => dataService.clearHistory('fanions'),

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

  // Importer un projet JSON existant (remplace les données partagées)
  importProject: async (jsonData) => {
    if (!jsonData.stores || !jsonData.labels) return;
    const { stores, labels, proPack, fanions } = get();
    await dataService.replaceProject({ stores, labels, proPack, fanions }, jsonData);
  },
}));

// --- Synchronisation ---

let storesLoaded = false;
let labelsLoaded = false;
let proPackLoaded = false;
let fanionsLoaded = false;
let userRoleLoaded = false;
let unsubscribers: (() => void)[] = [];
let unsubscribeOwnUserDoc: (() => void) | null = null;
let unsubscribeUsers: (() => void) | null = null;

const markLoadedIfReady = () => {
  if (storesLoaded && labelsLoaded && proPackLoaded && fanionsLoaded && userRoleLoaded) {
    useAppStore.setState({ isLoading: false });
  }
};

// Abonnement en continu au rôle du compte connecté (pris en compte sans
// re-login si un admin le modifie depuis le panneau « Accès »). Seul un admin
// a en plus besoin de la liste complète des comptes, donc on ne s'y abonne que
// dans ce cas pour ne jamais tenter une lecture refusée côté représentant.
const startRoleSync = (uid: string) => {
  userRoleLoaded = false;

  unsubscribeOwnUserDoc = dataService.subscribeOwnProfile(
    uid,
    (profile) => {
      if (!profile) return; // création en cours (voir ensureUserProfile)

      useAppStore.setState({ userRole: profile.role, userName: profile.name?.trim() || profile.email || null });
      userRoleLoaded = true;
      markLoadedIfReady();

      if (profile.role === 'admin' && !unsubscribeUsers) {
        unsubscribeUsers = dataService.subscribeUsers(
          (users) => useAppStore.setState({ users }),
          (error) => console.error('Erreur de synchronisation des comptes :', error)
        );
      }
    },
    (error) => console.error('Erreur de synchronisation du rôle :', error)
  );
};

const stopRoleSync = () => {
  unsubscribeOwnUserDoc?.();
  unsubscribeUsers?.();
  unsubscribeOwnUserDoc = null;
  unsubscribeUsers = null;
  userRoleLoaded = false;
  useAppStore.setState({ userRole: null, userName: null, users: [] });
};

const CATALOG_LABELS: Record<CatalogKind, string> = {
  labels: 'des étiquettes',
  propack: 'du Pro-Pack',
  fanions: 'des Fanions',
};
const HISTORY_LABELS: Record<CatalogKind, string> = {
  labels: '',
  propack: ' Pro-Pack',
  fanions: ' Fanions',
};
const REP_LABELS: Record<CatalogKind, string> = {
  labels: 'Étiquettes',
  propack: 'Pro-Pack',
  fanions: 'Fanions',
};

// La synchronisation ne démarre qu'une fois l'utilisateur authentifié et s'arrête
// à la déconnexion. `uid` sert à filtrer les sélections personnelles des
// représentants pour que chacun ne charge et ne voie jamais que les siennes.
const startDataSync = (uid: string) => {
  storesLoaded = false;
  labelsLoaded = false;
  proPackLoaded = false;
  fanionsLoaded = false;

  unsubscribers.push(
    dataService.subscribeStores(
      (stores) => {
        useAppStore.setState({ stores });
        storesLoaded = true;
        markLoadedIfReady();
      },
      (error) => console.error('Erreur de synchronisation des magasins :', error)
    )
  );

  CATALOG_KINDS.forEach((kind) => {
    const keys = KEYS[kind];

    unsubscribers.push(
      dataService.subscribeCatalog(
        kind,
        (items) => {
          useAppStore.setState({ [keys.items]: items } as Partial<AppState>);
          if (kind === 'labels') labelsLoaded = true;
          if (kind === 'propack') proPackLoaded = true;
          if (kind === 'fanions') fanionsLoaded = true;
          markLoadedIfReady();
        },
        (error) => console.error(`Erreur de synchronisation ${CATALOG_LABELS[kind]} :`, error)
      )
    );

    unsubscribers.push(
      dataService.subscribeHistory(
        kind,
        PRINT_HISTORY_LIMIT,
        (entries) => useAppStore.setState({ [keys.history]: entries } as Partial<AppState>),
        (error) => console.error(`Erreur de synchronisation de l'historique d'impression${HISTORY_LABELS[kind]} :`, error)
      )
    );

    unsubscribers.push(
      dataService.subscribeRepSelections(
        kind,
        uid,
        (selections: RepSelections) =>
          useAppStore.setState({
            [keys.repQuantities]: selections.quantities,
            [keys.repStores]: selections.stores,
          } as Partial<AppState>),
        (error) => console.error(`Erreur de synchronisation des quantités personnelles (${REP_LABELS[kind]}) :`, error)
      )
    );
  });
};

const stopDataSync = () => {
  unsubscribers.forEach((unsubscribe) => unsubscribe());
  unsubscribers = [];
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
    repStoresLabels: {},
    repStoresProPack: {},
    repStoresFanions: {},
    isLoading: true,
  });
};

dataService.onAuthStateChanged((user) => {
  if (user) {
    // Le profil (rôle) doit exister AVANT le démarrage de la synchronisation : à la
    // toute première connexion, l'amorçage des magasins par défaut est réservé aux
    // admins et serait refusé tant que le profil n'existe pas.
    dataService
      .ensureUserProfile(user)
      .catch((error) => console.error('Erreur de création du rôle :', error))
      .finally(() => {
        startDataSync(user.uid);
        startRoleSync(user.uid);
      });
  } else {
    stopDataSync();
    stopRoleSync();
  }
});
