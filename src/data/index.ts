import type { DataService } from './DataService';
import { createFirebaseDataService } from './firebaseDataService';
import { createDataverseDataService } from './dataverseDataService';

// Back-end sélectionné à la compilation : VITE_BACKEND=firebase (défaut) ou dataverse.
const backend = import.meta.env.VITE_BACKEND === 'dataverse' ? 'dataverse' : 'firebase';

export const dataService: DataService =
  backend === 'dataverse' ? createDataverseDataService() : createFirebaseDataService();

export * from './DataService';
export * from './types';
