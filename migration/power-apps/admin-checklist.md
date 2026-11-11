# Demandes à adresser à l'administrateur Power Platform / Microsoft 365

## Environnement
- [ ] Environnement Power Platform **avec Dataverse** (Développement puis Production)
- [ ] Option **« Enable code apps »** activée sur cet environnement (centre d'administration Power Platform)
- [ ] Rôle de **créateur d'environnement / System Customizer** pour la personne qui publie
- [ ] Solution Dataverse dédiée (ex. `Interbois`) et éditeur (préfixe, ex. `ibs_`)

## Licences
- [ ] Licences Power Apps (Premium / per app) pour **chaque utilisateur** : équipe interne **et représentants**
- [ ] Confirmer le statut (aperçu / disponibilité générale) des code apps pour le tenant

## Identité
- [ ] Les représentants ont-ils un compte Entra ID ? Sinon : invitations **B2B** (et licences associées)
- [ ] Deux groupes Entra : `Interbois-Admins`, `Interbois-Representants`
- [ ] Rôles de sécurité Dataverse mappés sur ces groupes (voir `dataverse-schema.md`)

## Réseau / gouvernance
- [ ] Politique DLP autorisant Dataverse (et le connecteur utilisé pour les images si SharePoint)
- [ ] Domaines à autoriser s'il faut garder des appels externes pendant la transition

## Outils (poste de la personne qui publie)
- [ ] Node.js 18+ / 20+, Power Platform CLI (`pac` ou `pa` selon la version installée)
- [ ] Accès au dépôt GitHub

## Questions à poser à l'admin
1. Quelle est la limite de taille d'une code app dans votre tenant ?
2. Les appels HTTP sortants depuis une code app sont-ils restreints ?
3. Qui administre les rôles de sécurité après la mise en production ?
