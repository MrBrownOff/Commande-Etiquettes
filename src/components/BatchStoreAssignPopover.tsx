// src/components/BatchStoreAssignPopover.tsx
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAppStore, StoreItem } from '../store/store';
import { Search, ChevronDown, Tag, X, Trash2 } from 'lucide-react';

const getBannerName = (store: StoreItem): string => {
  if (store.banner && store.banner !== 'Indépendant' && store.banner.trim() !== '') {
    return store.banner.trim();
  }
  const parts = store.name.split(/[-–:]/);
  if (parts.length > 1 && parts[0].trim().length > 0) {
    return parts[0].trim();
  }
  const upper = store.name.toUpperCase();
  if (upper.includes('BMR')) return 'BMR';
  if (upper.includes('CANAC')) return 'Canac';
  if (upper.includes('RONA')) return 'Rona';
  if (upper.includes('PATRICK MORIN')) return 'Patrick Morin';
  if (upper.includes('HOME DEPOT')) return 'Home Depot';
  if (upper.includes('KENT')) return 'Kent';
  return 'Indépendant';
};

interface BatchStoreAssignPopoverProps {
  selectedLabelIds: string[];
  onAssign: (itemIds: string[], storeIds: string[]) => void;
  onRemove: (itemIds: string[], storeIds: string[]) => void;
}

export const BatchStoreAssignPopover: React.FC<BatchStoreAssignPopoverProps> = ({ selectedLabelIds, onAssign, onRemove }) => {
  const { stores } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedTargetStoreIds, setSelectedTargetStoreIds] = useState<string[]>([]);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fermer le menu si clic à l'extérieur
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const storesWithBanner = useMemo(() => {
    return stores.map(s => ({
      ...s,
      computedBanner: getBannerName(s)
    }));
  }, [stores]);

  const uniqueBanners = useMemo(() => {
    const set = new Set(storesWithBanner.map(s => s.computedBanner));
    return Array.from(set).sort();
  }, [storesWithBanner]);

  const filteredStores = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (!query) return storesWithBanner;
    return storesWithBanner.filter(s =>
      s.name.toLowerCase().includes(query) || s.computedBanner.toLowerCase().includes(query)
    );
  }, [storesWithBanner, search]);

  const toggleStore = (storeId: string) => {
    setSelectedTargetStoreIds(prev =>
      prev.includes(storeId) ? prev.filter(id => id !== storeId) : [...prev, storeId]
    );
  };

  const toggleBanner = (bannerName: string) => {
    const bannerStoreIds = storesWithBanner
      .filter(s => s.computedBanner === bannerName)
      .map(s => s.id);

    const allSelected = bannerStoreIds.every(id => selectedTargetStoreIds.includes(id));

    if (allSelected) {
      setSelectedTargetStoreIds(prev => prev.filter(id => !bannerStoreIds.includes(id)));
    } else {
      setSelectedTargetStoreIds(prev => Array.from(new Set([...prev, ...bannerStoreIds])));
    }
  };

  const handleApplyBatch = () => {
    if (selectedTargetStoreIds.length === 0 || selectedLabelIds.length === 0) return;
    onAssign(selectedLabelIds, selectedTargetStoreIds);
    setSelectedTargetStoreIds([]);
    setIsOpen(false);
  };

  const handleRemoveBatch = () => {
    if (selectedTargetStoreIds.length === 0 || selectedLabelIds.length === 0) return;
    onRemove(selectedLabelIds, selectedTargetStoreIds);
    setSelectedTargetStoreIds([]);
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block" ref={popoverRef}>
      <div className="flex items-center gap-2">
        {/* Bouton pour ouvrir le sélecteur */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="bg-gray-50 border border-gray-200 hover:border-orange-400 text-gray-700 text-sm px-3.5 py-1.5 rounded-lg transition flex items-center justify-between gap-2 min-w-[240px]"
        >
          <span className="truncate">
            {selectedTargetStoreIds.length === 0
              ? 'Choisir magasins ou bannières...'
              : `${selectedTargetStoreIds.length} magasin(s) choisi(s)`}
          </span>
          <ChevronDown size={16} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Bouton d'application */}
        <button
          onClick={handleApplyBatch}
          disabled={selectedTargetStoreIds.length === 0 || selectedLabelIds.length === 0}
          className="bg-slate-900 hover:bg-slate-800 disabled:bg-gray-200 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition shadow-xs whitespace-nowrap"
        >
          Affecter la sélection
        </button>

        {/* Bouton de retrait */}
        <button
          onClick={handleRemoveBatch}
          disabled={selectedTargetStoreIds.length === 0 || selectedLabelIds.length === 0}
          className="bg-red-50 hover:bg-red-100 disabled:bg-gray-100 disabled:text-gray-400 text-red-600 px-4 py-1.5 rounded-lg text-sm font-medium transition shadow-xs whitespace-nowrap flex items-center gap-1.5"
        >
          <Trash2 size={15} /> Retirer la sélection
        </button>
      </div>

      {/* Menu déroulant Popover */}
      {isOpen && (
        <div className="absolute z-50 right-0 top-full mt-1 bg-white rounded-xl shadow-2xl border border-gray-200 p-3 space-y-3 w-80 max-w-[90vw]">
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

          <div className="max-h-64 overflow-y-auto space-y-4 pr-1 divide-y divide-gray-100">
            {/* SECTION 1 : BANNIÈRES */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block px-1 mb-1">
                Bannières
              </span>
              {uniqueBanners.map((banner) => {
                const bannerStores = storesWithBanner.filter(s => s.computedBanner === banner);
                const bannerStoreIds = bannerStores.map(s => s.id);
                const isAllChecked = bannerStoreIds.length > 0 && bannerStoreIds.every(id => selectedTargetStoreIds.includes(id));
                const isSomeChecked = !isAllChecked && bannerStoreIds.some(id => selectedTargetStoreIds.includes(id));

                return (
                  <label
                    key={banner}
                    className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer text-xs font-semibold transition ${
                      isAllChecked || isSomeChecked ? 'bg-orange-50 text-orange-900' : 'hover:bg-gray-50 text-gray-800'
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
                        Toute la bannière {banner}
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
              {filteredStores.map((store) => {
                const isChecked = selectedTargetStoreIds.includes(store.id);

                return (
                  <label
                    key={store.id}
                    className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs transition ${
                      isChecked ? 'bg-orange-50/60 font-medium text-orange-900' : 'hover:bg-gray-50 text-gray-700'
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
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};