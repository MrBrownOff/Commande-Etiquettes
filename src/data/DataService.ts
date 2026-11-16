import type { AppUser, LabelItem, PrintHistoryEntry, PrintRunEntry, StoreItem, UserRole } from './types';

// Contrat d'accès aux données : tout ce que l'application lit ou écrit passe par
// cette interface. Le store (Zustand) garde l'état, l'optimisme et le débounce ;
// l'implémentation choisie (Firebase aujourd'hui, Dataverse pour Power Apps)
// ne s'occupe que du stockage, de l'authentification et des abonnements.

export type CatalogKind = 'labels' | 'propack' | 'fanions';
export const CATALOG_KINDS: CatalogKind[] = ['labels', 'propack', 'fanions'];

export type Unsubscribe = () => void;
export type ErrorHandler = (error: unknown) => void;

export interface SessionUser {
  uid: string;
  email: string | null;
}

export interface UserProfile {
  role: UserRole;
  email?: string;
  name?: string;
}

// Sélection personnelle d'un représentant pour un catalogue.
export interface RepSelections {
  quantities: Record<string, number>;
  stores: Record<string, string[]>;
}

export interface ProjectData {
  stores: StoreItem[];
  labels: LabelItem[];
  proPack?: LabelItem[];
  fanions?: LabelItem[];
}

export interface DataService {
  readonly backend: 'firebase' | 'dataverse';

  // --- Authentification ---
  onAuthStateChanged(callback: (user: SessionUser | null) => void): Unsubscribe;
  getCurrentUserId(): string | null;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;

  // --- Comptes et rôles ---
  // Crée le profil du compte à sa première connexion (rôle déduit de l'email).
  ensureUserProfile(user: SessionUser): Promise<void>;
  subscribeOwnProfile(uid: string, onData: (profile: UserProfile | null) => void, onError: ErrorHandler): Unsubscribe;
  subscribeUsers(onData: (users: AppUser[]) => void, onError: ErrorHandler): Unsubscribe;
  updateUserRole(uid: string, role: UserRole): Promise<void>;
  updateUserName(uid: string, name: string): Promise<void>;

  // --- Magasins ---
  // Amorce les magasins par défaut si la base est vide au premier chargement.
  subscribeStores(onData: (stores: StoreItem[]) => void, onError: ErrorHandler): Unsubscribe;
  addStores(stores: StoreItem[]): Promise<void>;
  updateStoreBanners(updates: { id: string; banner: string }[]): Promise<void>;
  deleteStores(storeIds: string[]): Promise<void>;

  // --- Catalogues (étiquettes, Pro-Pack, fanions) ---
  subscribeCatalog(kind: CatalogKind, onData: (items: LabelItem[]) => void, onError: ErrorHandler): Unsubscribe;
  addItems(kind: CatalogKind, items: LabelItem[]): Promise<void>;
  updateItem(kind: CatalogKind, id: string, fields: Partial<LabelItem>): Promise<void>;
  deleteItem(kind: CatalogKind, id: string): Promise<void>;
  assignStores(kind: CatalogKind, itemIds: string[], storeIds: string[]): Promise<void>;
  removeStores(kind: CatalogKind, itemIds: string[], storeIds: string[]): Promise<void>;
  clearItems(kind: CatalogKind, items: LabelItem[]): Promise<void>;

  // --- Historique des impressions ---
  subscribeHistory(
    kind: CatalogKind,
    limit: number,
    onData: (entries: PrintHistoryEntry[]) => void,
    onError: ErrorHandler
  ): Unsubscribe;
  logPrintRun(kind: CatalogKind, entry: PrintRunEntry, author: { uid?: string; repName?: string }): Promise<void>;
  clearHistory(kind: CatalogKind): Promise<void>;

  // --- Sélections personnelles des représentants ---
  subscribeRepSelections(
    kind: CatalogKind,
    uid: string,
    onData: (selections: RepSelections) => void,
    onError: ErrorHandler
  ): Unsubscribe;
  saveRepQuantity(kind: CatalogKind, uid: string, itemId: string, quantity: number): Promise<void>;
  saveRepStores(kind: CatalogKind, uid: string, itemIds: string[], storeIds: string[]): Promise<void>;

  // --- Projet (import JSON) : remplace les données partagées ---
  replaceProject(
    current: { stores: StoreItem[]; labels: LabelItem[]; proPack: LabelItem[]; fanions: LabelItem[] },
    next: ProjectData
  ): Promise<void>;
}
