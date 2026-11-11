# Migration vers Power Apps (code app + Dataverse + Entra ID)

> L'application actuelle (GitHub Pages + Firebase) reste **inchangée et en production**
> tant que la migration n'est pas validée. Ce dossier ne contient que la préparation.

## Décisions retenues
| Sujet | Choix |
|---|---|
| Hébergement | Power Apps **code app** (React/Vite publié dans l'environnement Power Platform) |
| Données | **Dataverse** (voir `dataverse-schema.md`) |
| Identité | **Microsoft Entra ID** (remplace Firebase Auth) |
| Données existantes | **Migrées** depuis Firestore (voir `scripts/`) |

## Étapes
1. **Administrateur** : traiter `admin-checklist.md` (activation des code apps, licences, environnement, tables).
2. **Données** : créer les tables selon `dataverse-schema.md`.
3. **Export** Firestore → JSON/CSV : `scripts/export-firestore.mjs` (clé de service requise, jamais commitée).
4. **Code** : introduire une couche d'accès aux données (interface) pour remplacer Firebase par Dataverse sans toucher aux écrans (`code-changes.md`).
5. **Import** dans Dataverse, recette, bascule, puis arrêt de Firebase.

## Points d'attention déjà identifiés
- **Poids des visuels** : `public/` pèse ~72 Mo (28 Mo de JPEG d'étiquettes + 39 Mo de PDF). À vérifier avec la limite de taille d'une code app ; sinon stocker les images dans Dataverse (colonnes image/fichier) ou SharePoint.
- **Règles de sécurité** : `firestore.rules` doit être traduit en rôles de sécurité Dataverse (voir schéma). Sans cela, un représentant pourrait lire tous les historiques.
- **Rôles** : aujourd'hui déduits de l'email (« representant »). Cible : rôles de sécurité Dataverse / groupes Entra.
- **Représentants externes** : comptes invités (B2B) dans Entra, ou comptes dédiés.
- **Statut des code apps** : fonctionnalité récente, la CLI évolue (`pac code push` / `pa app push`). Confirmer sur learn.microsoft.com avant de démarrer.
