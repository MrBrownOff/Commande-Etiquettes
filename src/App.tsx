import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { StoresView } from './components/StoresView';
import { ProjectView } from './components/ProjectView';
import { LabelsView } from './components/LabelsView';
import { RepresentantView } from './components/RepresentantView';
import { AccessView } from './components/AccessView';
import { AuthGate } from './components/AuthGate';
import { useAppStore } from './store/store';

function AppContent() {
  const [currentTab, setCurrentTab] = useState<
    'labels' | 'propack' | 'fanions' | 'stores' | 'access' | 'project'
  >('labels');
  const isLoading = useAppStore((state) => state.isLoading);
  // Le rôle (voir store.ts / firestore.rules) détermine la vue affichée — plus
  // fiable qu'une convention sur l'email : modifiable depuis le panneau « Accès »
  // sans devoir recréer le compte, et vérifié indépendamment côté serveur.
  const userRole = useAppStore((state) => state.userRole);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-orange-500" size={32} />
      </div>
    );
  }

  if (userRole === 'representant') {
    return <RepresentantView />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Barre latérale commune */}
      <Sidebar currentTab={currentTab} setCurrentTab={setCurrentTab} />

      {/* Rendu dynamique de la vue sélectionnée */}
      <main className="flex-1 overflow-auto">
        {currentTab === 'labels' && <LabelsView itemType="labels" />}
        {currentTab === 'propack' && <LabelsView itemType="propack" />}
        {currentTab === 'fanions' && <LabelsView itemType="fanions" />}
        {currentTab === 'stores' && <StoresView />}
        {currentTab === 'access' && <AccessView />}
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
