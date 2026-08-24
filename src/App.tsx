import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { StoresView } from './components/StoresView';
import { ProjectView } from './components/ProjectView';
import { LabelsView } from './components/LabelsView';
import { RepresentantView } from './components/RepresentantView';
import { AuthGate } from './components/AuthGate';
import { useAppStore } from './store/store';
import { auth } from './firebase';

// Convention de compte : tout email de connexion contenant "representant" bascule
// automatiquement sur la vue allégée (sélection d'étiquettes à imprimer, sans
// gestion des magasins). Aucune règle Firestore distincte n'est nécessaire : les
// deux profils partagent le même accès en lecture/écriture, seule l'interface change.
const isRepresentantAccount = (email?: string | null) =>
  (email ?? '').toLowerCase().includes('representant');

function AppContent() {
  const [currentTab, setCurrentTab] = useState<'labels' | 'stores' | 'project'>('labels');
  const isLoading = useAppStore((state) => state.isLoading);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-orange-500" size={32} />
      </div>
    );
  }

  if (isRepresentantAccount(auth.currentUser?.email)) {
    return <RepresentantView />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Barre latérale commune */}
      <Sidebar currentTab={currentTab} setCurrentTab={setCurrentTab} />

      {/* Rendu dynamique de la vue sélectionnée */}
      <main className="flex-1 overflow-auto">
        {currentTab === 'labels' && <LabelsView />}
        {currentTab === 'stores' && <StoresView />}
        {currentTab === 'project' && <ProjectView />}
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthGate>
      <AppContent />
    </AuthGate>
  );
}

export default App;
