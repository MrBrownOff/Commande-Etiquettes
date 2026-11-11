# Schéma Dataverse cible (préfixe `ibs_`)

Correspondance avec les collections Firestore actuelles. Chaque table garde un champ
`ibs_legacyid` (texte) = ancien id Firestore, pour la migration et le rapprochement.

| Firestore | Table Dataverse | Colonnes principales |
|---|---|---|
| `stores` | `ibs_store` | `ibs_name`, `ibs_banner` |
| `labels` | `ibs_label` | `ibs_reference`, `ibs_filename`, `ibs_name`, `ibs_banner`, `ibs_category`, `ibs_quantity` (0-99), `ibs_imageurl`, `ibs_thumbnailurl` |
| `proPack` | `ibs_propack` | idem `ibs_label` |
| `fanionsItems` | `ibs_fanion` | idem `ibs_label` |
| `labels.stores[]` etc. | tables de liaison `ibs_labelstore`, `ibs_propackstore`, `ibs_fanionstore` | lookup item + lookup `ibs_store` (relation N:N) |
| `users` | table **systemuser** (Entra) + `ibs_userprofile` | `ibs_displayname` (nom page de garde), lookup `systemuser` |
| `repQuantities*` | `ibs_repselection` | lookup `ibs_userprofile`, `ibs_kind` (label/propack/fanion), `ibs_itemid`, `ibs_quantity` ; stores via table de liaison |
| `printHistory`, `proPackPrintHistory`, `fanionsItemsPrintHistory` | `ibs_printrun` + `ibs_printrunitem` | `ibs_kind`, `createdon`, `ibs_totalreferences`, `ibs_totalquantity`, `ibs_storenames`, lookup `ibs_userprofile`, `ibs_repname` ; lignes : `ibs_reference`, `ibs_quantity`, `ibs_storenames` |

## Rôles de sécurité (remplacent `firestore.rules`)
| Rôle | Droits |
|---|---|
| **Interbois Admin** | Lecture/écriture/suppression : catalogues, magasins, profils, historiques (organisation) |
| **Interbois Représentant** | Lecture : catalogues et magasins. `ibs_repselection` et `ibs_printrun` : **utilisateur uniquement** (créer/lire/modifier les siens). Aucune lecture des historiques d'autrui |

L'étendue « Utilisateur » de Dataverse règle le point de sécurité resté ouvert aujourd'hui
(filtrage de l'historique côté client uniquement).

## Points à trancher
- Images des étiquettes : fichiers dans l'app, colonnes image Dataverse ou bibliothèque SharePoint.
- Quotas Dataverse (stockage fichiers) selon la licence.
