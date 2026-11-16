import {
  onAuthStateChanged as fbOnAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  updateDoc,
  setDoc,
  getDoc,
  onSnapshot,
  getDocs,
  writeBatch,
  arrayUnion,
  arrayRemove,
  query,
  where,
  orderBy,
  limit as fbLimit,
  serverTimestamp,
  WriteBatch,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { inferRoleFromEmail } from './types';
import type { AppUser, LabelItem, PrintHistoryEntry, StoreItem } from './types';
import type { CatalogKind, DataService, RepSelections, UserProfile } from './DataService';

// Implémentation Firebase (Auth + Firestore) : reprend à l'identique le
// comportement historique du store, noms de collections compris.

const STORES_COLLECTION = 'stores';
const USERS_COLLECTION = 'users';

const CATALOG_COLLECTIONS: Record<CatalogKind, string> = {
  labels: 'labels',
  propack: 'proPack',
  // Catalogue "Fanions" indépendant, distinct des anciennes collections "fanions" /
  // "fanionPrintHistory" (anciens noms du Pro-Pack, voir LEGACY_* plus bas).
  fanions: 'fanionsItems',
};
const HISTORY_COLLECTIONS: Record<CatalogKind, string> = {
  labels: 'printHistory',
  propack: 'proPackPrintHistory',
  fanions: 'fanionsItemsPrintHistory',
};
// Sélections personnelles des représentants : un document `${uid}_${itemId}` par item.
const REP_COLLECTIONS: Record<CatalogKind, string> = {
  labels: 'repQuantitiesLabels',
  propack: 'repQuantitiesProPack',
  fanions: 'repQuantitiesFanions',
};

// Anciens noms utilisés avant le renommage "Fanions" -> "Pro-Pack" : migration
// additive unique (jamais de suppression des anciennes données).
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

export const createFirebaseDataService = (): DataService => {
  // État interne des migrations/amorçages "une seule fois".
  let proPackMigrated = false;
  let proPackHistoryMigrated = false;

  return {
    backend: 'firebase',

    // --- Authentification ---
    onAuthStateChanged: (callback) =>
      fbOnAuthStateChanged(auth, (user) => callback(user ? { uid: user.uid, email: user.email } : null)),
    getCurrentUserId: () => auth.currentUser?.uid ?? null,
    signIn: async (email, password) => {
      await signInWithEmailAndPassword(auth, email, password);
    },
    signOut: () => fbSignOut(auth),

    // --- Comptes et rôles ---
    ensureUserProfile: async ({ uid, email }) => {
      const ref = doc(db, USERS_COLLECTION, uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, { email: email ?? '', role: inferRoleFromEmail(email) });
      }
    },
    subscribeOwnProfile: (uid, onData, onError) =>
      onSnapshot(
        doc(db, USERS_COLLECTION, uid),
        (snap) => onData(snap.exists() ? (snap.data() as UserProfile) : null),
        onError
      ),
    subscribeUsers: (onData, onError) =>
      onSnapshot(
        collection(db, USERS_COLLECTION),
        (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AppUser)),
        onError
      ),
    updateUserRole: async (uid, role) => {
      await updateDoc(doc(db, USERS_COLLECTION, uid), { role });
    },
    updateUserName: async (uid, name) => {
      await updateDoc(doc(db, USERS_COLLECTION, uid), { name });
    },

    // --- Magasins ---
    subscribeStores: (onData, onError) => {
      let received = false;
      let seeded = false;
      return onSnapshot(
        collection(db, STORES_COLLECTION),
        async (snapshot) => {
          // Amorce les magasins par défaut si la collection est vide au tout premier chargement.
          if (snapshot.empty && !received && !seeded) {
            seeded = true;
            const batch = writeBatch(db);
            for (const s of DEFAULT_STORES) {
              batch.set(doc(collection(db, STORES_COLLECTION)), s);
            }
            await batch.commit();
            return; // le prochain snapshot contiendra les magasins par défaut
          }
          received = true;
          onData(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as StoreItem));
        },
        onError
      );
    },
    addStores: (stores) =>
      commitInChunks(stores, (batch, s) => {
        batch.set(doc(db, STORES_COLLECTION, s.id), { name: s.name, banner: s.banner });
      }),
    updateStoreBanners: (updates) =>
      commitInChunks(updates, (batch, u) => {
        batch.update(doc(db, STORES_COLLECTION, u.id), { banner: u.banner });
      }),
    deleteStores: (storeIds) =>
      commitInChunks(storeIds, (batch, id) => {
        batch.delete(doc(db, STORES_COLLECTION, id));
      }),

    // --- Catalogues ---
    subscribeCatalog: (kind, onData, onError) => {
      const name = CATALOG_COLLECTIONS[kind];
      let received = false;
      return onSnapshot(
        collection(db, name),
        async (snapshot) => {
          // Migre une seule fois les items de l'ancienne collection "fanions" (avant le
          // renommage en Pro-Pack) si la nouvelle collection est encore vide.
          if (kind === 'propack' && snapshot.empty && !received && !proPackMigrated) {
            proPackMigrated = true;
            const migrated = await migrateLegacyCollection(LEGACY_FANIONS_COLLECTION, name);
            if (migrated) return; // le prochain snapshot contiendra les items migrés
          }
          received = true;
          onData(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as LabelItem));
        },
        onError
      );
    },
    addItems: (kind, items) =>
      commitInChunks(items, (batch, item) => {
        const { id, ...rest } = item;
        batch.set(doc(db, CATALOG_COLLECTIONS[kind], id), rest);
      }),
    updateItem: (kind, id, fields) => updateDoc(doc(db, CATALOG_COLLECTIONS[kind], id), fields),
    deleteItem: (kind, id) => deleteDoc(doc(db, CATALOG_COLLECTIONS[kind], id)),
    assignStores: (kind, itemIds, storeIds) =>
      commitInChunks(itemIds, (batch, id) => {
        batch.update(doc(db, CATALOG_COLLECTIONS[kind], id), { stores: arrayUnion(...storeIds) });
      }),
    removeStores: (kind, itemIds, storeIds) =>
      commitInChunks(itemIds, (batch, id) => {
        batch.update(doc(db, CATALOG_COLLECTIONS[kind], id), { stores: arrayRemove(...storeIds) });
      }),
    clearItems: (kind, items) =>
      commitInChunks(items, (batch, item) => {
        batch.delete(doc(db, CATALOG_COLLECTIONS[kind], item.id));
      }),

    // --- Historique ---
    subscribeHistory: (kind, max, onData, onError) => {
      const name = HISTORY_COLLECTIONS[kind];
      return onSnapshot(
        query(collection(db, name), orderBy('createdAt', 'desc'), fbLimit(max)),
        async (snapshot) => {
          if (kind === 'propack' && snapshot.empty && !proPackHistoryMigrated) {
            proPackHistoryMigrated = true;
            const migrated = await migrateLegacyCollection(LEGACY_FANION_PRINT_HISTORY_COLLECTION, name);
            if (migrated) return;
          }
          onData(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as PrintHistoryEntry));
        },
        onError
      );
    },
    logPrintRun: async (kind, entry, author) => {
      await addDoc(collection(db, HISTORY_COLLECTIONS[kind]), {
        ...entry,
        ...(author.uid ? { uid: author.uid } : {}),
        ...(author.repName ? { repName: author.repName } : {}),
        createdAt: serverTimestamp(),
      });
    },
    // Relit la collection entière (pas seulement les derniers lots affichés) ; ne
    // touche jamais aux catalogues ni aux assignations magasin/étiquette.
    clearHistory: async (kind) => {
      // Empêche la migration de l'ancien historique « fanionPrintHistory », qui se
      // déclenche sur un snapshot vide : sans ça, vider l'historique le ferait
      // ressusciter depuis l'ancienne collection.
      if (kind === 'propack') proPackHistoryMigrated = true;
      const snapshot = await getDocs(collection(db, HISTORY_COLLECTIONS[kind]));
      await commitInChunks(snapshot.docs, (batch, d) => {
        batch.delete(d.ref);
      });
    },

    // --- Sélections des représentants ---
    // Filtrées par uid dès la requête (pas seulement à l'affichage).
    subscribeRepSelections: (kind, uid, onData, onError) =>
      onSnapshot(
        query(collection(db, REP_COLLECTIONS[kind]), where('uid', '==', uid)),
        (snapshot) => {
          const selections: RepSelections = { quantities: {}, stores: {} };
          snapshot.docs.forEach((d) => {
            const data = d.data() as { itemId: string; quantity?: number; stores?: string[] };
            if (data.quantity !== undefined) selections.quantities[data.itemId] = data.quantity;
            if (data.stores) selections.stores[data.itemId] = data.stores;
          });
          onData(selections);
        },
        onError
      ),
    saveRepQuantity: (kind, uid, itemId, quantity) =>
      setDoc(doc(db, REP_COLLECTIONS[kind], `${uid}_${itemId}`), { uid, itemId, quantity }, { merge: true }),
    saveRepStores: async (kind, uid, itemIds, storeIds) => {
      await Promise.all(
        itemIds.map((itemId) =>
          setDoc(doc(db, REP_COLLECTIONS[kind], `${uid}_${itemId}`), { uid, itemId, stores: storeIds }, { merge: true })
        )
      );
    },

    // --- Projet ---
    replaceProject: async (current, next) => {
      const del = (name: string, items: { id: string }[]) =>
        commitInChunks(items, (batch, i) => {
          batch.delete(doc(db, name, i.id));
        });
      const put = (name: string, items: { id: string }[]) =>
        commitInChunks(items, (batch, i) => {
          const { id, ...rest } = i;
          batch.set(doc(db, name, id), rest);
        });

      await del(CATALOG_COLLECTIONS.labels, current.labels);
      await del(CATALOG_COLLECTIONS.propack, current.proPack);
      await del(CATALOG_COLLECTIONS.fanions, current.fanions);
      await del(STORES_COLLECTION, current.stores);
      await put(STORES_COLLECTION, next.stores);
      await put(CATALOG_COLLECTIONS.labels, next.labels);
      if (next.proPack) await put(CATALOG_COLLECTIONS.propack, next.proPack);
      if (next.fanions) await put(CATALOG_COLLECTIONS.fanions, next.fanions);
    },
  };
};
