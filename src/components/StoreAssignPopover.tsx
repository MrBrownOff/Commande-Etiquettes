// src/components/StoreAssignPopover.tsx
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { StoreItem, useAppStore } from '../store/store';
import { Search, ChevronDown, Store, Tag, X } from 'lucide-react';

// Extraction automatique intelligente de la bannière depuis le nom du magasin
const getBannerName = (store: StoreItem): string => {
  if (store.banner && store.banner !== 'Indépendant' && store.banner.trim() !== '') {
    return store.banner.trim();
  }

  // Si le nom contient un séparateur comme "BMR - Laval" ou "Canac - Lévis"
  const parts = store.name.split(/[-–:]/);
  if (parts.length > 1 && parts[0].trim().length > 0) {
    return parts[0].trim();
  }

  // Détection par mots-clés
  const upper = store.name.toUpperCase();
  if (upper.includes('BMR')) return 'BMR';
  if (upper.includes('CANAC')) return 'Canac';
  if (upper.includes('RONA')) return 'Rona';
  if (upper.includes('PATRICK MORIN')) return 'Patrick Morin';
  if (upper.includes('HOME DEPOT')) return 'Home Depot';
  if (upper.includes('KENT')) return 'Kent';

  return 'Indépendant';
};

interface StoreAssignPopoverProps {
  assignedStoreIds: string[];
  onChangeStores: (newStoreIds: string[]) => void;
}

export const StoreAssignPopover: React.FC<StoreAssignPopoverProps> = ({ assignedStoreIds, onChangeStores }) => {
  const { stores } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fermer si clic à l'extérieur
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Association de chaque magasin avec sa bannière calculée
  const storesWithBanner = useMemo(() => {
    return stores.map(s => ({
      ...s,
      computedBanner: getBannerName(s)
    }));
  }, [stores]);

  // Liste des Bannières uniques
  const uniqueBanners = useMemo(() => {
    const set = new Set(storesWithBanner.map(s => s.computedBanner));
    return Array.from(set).sort();
  }, [storesWithBanner]);

  // Filtrage des magasins avec le moteur de recherche
  const filteredStores = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (!query) return storesWithBanner;
    return storesWithBanner.filter(s =>
      s.name.toLowerCase().includes(query) || s.computedBanner.toLowerCase().includes(query)
    );
  }, [storesWithBanner, search]);

  // Action : Basculer un magasin individuel
  const toggleStore = (storeId: string) => {
    const newStores = assignedStoreIds.includes(storeId)
      ? assignedStoreIds.filter(id => id !== storeId)
      : [...assignedStoreIds, storeId];

    onChangeStores(newStores);
  };

  // Action : Basculer toute une bannière (Cocher/Décocher tous les magasins de cette bannière)
  const toggleBanner = (bannerName: string) => {
    const bannerStoreIds = storesWithBanner
      .filter(s => s.computedBanner === bannerName)
      .map(s => s.id);

    const allAssigned = bannerStoreIds.every(id => assignedStoreIds.includes(id));

    let newStores: string[];
    if (allAssigned) {
      newStores = assignedStoreIds.filter(id => !bannerStoreIds.includes(id));
    } else {
      newStores = Array.from(new Set([...assignedStoreIds, ...bannerStoreIds]));
    }

    onChangeStores(newStores);
  };

  return (
    <div className="relative w-full" ref={popoverRef}>
      {/* Bouton déclencheur sur la carte */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between bg-white border border-gray-200 hover:border-orange-400 text-gray-700 text-xs px-3 py-1.5 rounded-lg transition font-medium"
      >
        <span className="flex items-center gap-1.5">
          <Store size={14} className="text-orange-500" />
          + Affecter des magasins / bannières...
        </span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Menu déroulant Popover */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 bottom-full mb-1 bg-white rounded-xl shadow-2xl border border-gray-200 p-3 space-y-3 w-80 max-w-[90vw]">
          {/* Moteur de recherche */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher magasin ou bannière..."
              className="w-full pl-8 pr-7 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-orange-500"
              autoFocus
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={12} />
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto space-y-4 pr-1 divide-y divide-gray-100">

            {/* SECTION 1 : BANNIÈRES */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block px-1 mb-1">
                Bannières
              </span>
              {uniqueBanners.map((banner) => {
                const bannerStores = storesWithBanner.filter(s => s.computedBanner === banner);
                const bannerStoreIds = bannerStores.map(s => s.id);
                const isAllChecked = bannerStoreIds.length > 0 && bannerStoreIds.every(id => assignedStoreIds.includes(id));
                const isSomeChecked = !isAllChecked && bannerStoreIds.some(id => assignedStoreIds.includes(id));

                return (
                  <label
                    key={banner}
                    className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer text-xs font-semibold transition ${isAllChecked || isSomeChecked ? 'bg-orange-50 text-orange-900' : 'hover:bg-gray-50 text-gray-800'
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isAllChecked}
                        ref={el => { if (el) el.indeterminate = isSomeChecked; }}
                        onChange={() => toggleBanner(banner)}
                        className="rounded text-orange-500 focus:ring-orange-400 h-3.5 w-3.5"
                      />
                      <span className="flex items-center gap-1">
                        <Tag size={12} className="text-orange-500" />
                        {banner}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-mono">
                      ({bannerStores.length})
                    </span>
                  </label>
                );
              })}
            </div>

            {/* SECTION 2 : MAGASINS INDIVIDUELS */}
            <div className="pt-2 space-y-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block px-1 mb-1">
                Magasins ({filteredStores.length})
              </span>
              {filteredStores.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">Aucun magasin trouvé</p>
              ) : (
                filteredStores.map((store) => {
                  const isChecked = assignedStoreIds.includes(store.id);

                  return (
                    <label
                      key={store.id}
                      className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs transition ${isChecked ? 'bg-orange-50/60 font-medium text-orange-900' : 'hover:bg-gray-50 text-gray-700'
                        }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleStore(store.id)}
                        className="rounded text-orange-500 focus:ring-orange-400 h-3.5 w-3.5"
                      />
                      <span className="truncate">{store.name}</span>
                    </label>
                  );
                })
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
};