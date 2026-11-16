# Changements de code prévus

Principe : ne pas toucher aux écrans, remplacer la couche données.

1. **Couche d'accès (FAIT)** : `src/data/` contient l'interface `DataService`, l'implémentation Firebase (`firebaseDataService.ts`, comportement inchangé) et un squelette Dataverse (`dataverseDataService.ts`). Le store n'importe plus Firebase ; seul `src/data/firebaseDataService.ts` (et `src/firebase.ts`) le fait. Reste à écrire l'implémentation Dataverse. Description initiale : extraire de `src/store/store.ts` une interface `DataService`
   (stores, catalogues, historiques, sélections de représentant, utilisateurs) avec deux
   implémentations : `FirebaseDataService` (existante) et `DataverseDataService`.
   Sélection par variable de build `VITE_BACKEND=firebase|dataverse`.
2. **Authentification** : `AuthGate.tsx` (email/mot de passe Firebase) remplacé par le
   contexte utilisateur fourni par la code app (compte Entra). Le rôle vient du rôle de
   sécurité / groupe, plus de `inferRoleFromEmail`.
3. **Temps réel** : les `onSnapshot` deviennent des chargements + rafraîchissements
   (Dataverse n'a pas d'équivalent direct).
4. **Build** : ajouter `@microsoft/power-apps`, le plugin Vite et `power.config.json`
   (à générer avec la CLI sur l'environnement cible) ; `base` Vite à adapter.
5. **PDF / OCR / CSV** : inchangés (exécutés côté navigateur).
