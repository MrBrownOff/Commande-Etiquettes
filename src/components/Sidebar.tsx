// src/components/Sidebar.tsx
import React from 'react';
import { LayoutDashboard, Flag, Store, Save, Download, LogOut } from 'lucide-react';
import { useAppStore } from '../store/store';
import { signOutUser } from './AuthGate';

interface SidebarProps {
  currentTab: 'labels' | 'propack' | 'stores' | 'project';
  setCurrentTab: (tab: 'labels' | 'propack' | 'stores' | 'project') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, setCurrentTab }) => {
  const { labels, proPack, stores, exportProject } = useAppStore();

  return (
    <aside className="w-72 bg-slate-900 text-white flex flex-col shadow-lg select-none">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-800">
        <div className="flex items-center">
          <img
            src={`${import.meta.env.BASE_URL}Interbois-Logo-Blanc.png`}
            alt="Interbois"
            className="h-8 w-auto object-contain"
          />
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        <button
          onClick={() => setCurrentTab('labels')}
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg font-medium text-sm transition ${currentTab === 'labels'
            ? 'bg-orange-500 text-white shadow-sm'
            : 'text-slate-300 hover:bg-slate-800'
            }`}
        >
          <span className="flex items-center gap-3">
            <LayoutDashboard size={18} />
            Étiquettes
          </span>
          <span className="text-xs bg-slate-800 px-2 py-0.5 rounded-full text-slate-300">
            {labels.length}
          </span>
        </button>

        <button
          onClick={() => setCurrentTab('propack')}
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg font-medium text-sm transition ${currentTab === 'propack'
            ? 'bg-orange-500 text-white shadow-sm'
            : 'text-slate-300 hover:bg-slate-800'
            }`}
        >
          <span className="flex items-center gap-3">
            <Flag size={18} />
            Pro-Pack
          </span>
          <span className="text-xs bg-slate-800 px-2 py-0.5 rounded-full text-slate-300">
            {proPack.length}
          </span>
        </button>

        <button
          onClick={() => setCurrentTab('stores')}
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg font-medium text-sm transition ${currentTab === 'stores'
            ? 'bg-orange-500 text-white shadow-sm'
            : 'text-slate-300 hover:bg-slate-800'
            }`}
        >
          <span className="flex items-center gap-3">
            <Store size={18} />
            Magasins
          </span>
          <span className="text-xs bg-slate-800 px-2 py-0.5 rounded-full text-slate-300">
            {stores.length}
          </span>
        </button>

        <button
          onClick={() => setCurrentTab('project')}
          className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg font-medium text-sm transition ${currentTab === 'project'
            ? 'bg-orange-500 text-white shadow-sm'
            : 'text-slate-300 hover:bg-slate-800'
            }`}
        >
          <Save size={18} />
          Sauvegarde / Projet
        </button>
      </nav>

      {/* Action rapide d'export JSON de sauvegarde */}
      <div className="p-4 border-t border-slate-800 space-y-2">
        <button
          onClick={exportProject}
          className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 py-2.5 rounded-lg text-xs font-semibold transition"
        >
          <Download size={15} />
          Sauvegarder (.JSON)
        </button>
        <button
          onClick={signOutUser}
          className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 py-2 rounded-lg text-xs font-medium transition"
        >
          <LogOut size={14} />
          Se déconnecter
        </button>
      </div>
    </aside>
  );
};