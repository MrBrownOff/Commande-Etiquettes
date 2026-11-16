import type { DataService } from './DataService';

// Squelette de l'implémentation Dataverse / Entra ID (Power Apps code app).
// Rien n'est encore branché : voir migration/power-apps/ pour le schéma des tables
// et le plan. Chaque méthode de DataService devra y être implémentée avant de
// pouvoir sélectionner ce back-end avec VITE_BACKEND=dataverse.
export const createDataverseDataService = (): DataService => {
  throw new Error(
    "Le back-end Dataverse n'est pas encore implémenté. Utilisez VITE_BACKEND=firebase (valeur par défaut)."
  );
};
