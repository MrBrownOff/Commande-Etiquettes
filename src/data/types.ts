// Types métier partagés, indépendants de toute technologie de stockage
// (Firebase aujourd'hui, Dataverse demain). Réexportés par store/store.ts.

export interface StoreItem {
  id: string;
  name: string;
  banner?: string;
}

export type UserRole = 'admin' | 'representant';

export interface AppUser {
  id: string; // identifiant du compte (uid Firebase, id utilisateur Entra/Dataverse…)
  email: string;
  role: UserRole;
  // Nom affiché (ex : « Jean Dupont ») : renseigné par un admin depuis le
  // panneau « Accès », repris sur la page de garde des PDF d'un représentant.
  name?: string;
}

// Représente un item imprimable (étiquette, Pro-Pack ou fanion) : même structure
// pour les trois catalogues, qui sont indépendants les uns des autres.
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
  category?: string; // Sous-catégorie optionnelle (ex: "Produits en peuplier")
}

// Date d'une entrée d'historique : structurellement compatible avec le Timestamp
// Firestore, mais n'importe quel back-end peut fournir un objet équivalent.
export interface DateLike {
  toDate(): Date;
  toMillis(): number;
}

// Trace historisée d'un PDF généré pour l'imprimeur : on ne conserve pas le fichier
// lui-même, seulement les informations qu'il contenait.
export interface PrintHistoryEntry {
  id: string;
  createdAt: DateLike | null;
  totalReferences: number;
  totalQuantity: number;
  storeNames: string[];
  items: { reference: string; quantity: number; storeNames: string[] }[];
  // Compte à l'origine de l'impression (renseigné pour les représentants).
  uid?: string;
  repName?: string;
}

export type PrintRunEntry = {
  totalReferences: number;
  totalQuantity: number;
  storeNames: string[];
  items: { reference: string; quantity: number; storeNames: string[] }[];
};

// Règle d'inférence utilisée UNIQUEMENT lors de la toute première connexion d'un
// compte, pour créer automatiquement son document de rôle sans intervention
// manuelle : reprend la même convention que l'ancien routage par email. Les
// règles Firestore recalculent indépendamment ce même résultat côté serveur
// (voir firestore.rules) — un compte ne peut donc jamais s'auto-attribuer un
// rôle différent de celui-ci. Un admin peut ensuite corriger le rôle à tout
// moment depuis le panneau « Accès ».
export const inferRoleFromEmail = (email?: string | null): UserRole =>
  (email ?? '').toLowerCase().includes('representant') ? 'representant' : 'admin';
