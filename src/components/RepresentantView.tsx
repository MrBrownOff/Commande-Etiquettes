import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useAppStore } from '../store/store';
import { Search, Loader2, CheckSquare, Square, Printer, LogOut, Tag, Flag, Bookmark, Store, X, ChevronDown } from 'lucide-react';
import { generatePrinterPDF, PrintableKind } from '../utils/printerExport';
import { signOutUser } from './AuthGate';

const TYPE_TABS: { type: PrintableKind; label: string; icon: typeof Tag }[] = [
  { type: 'labels', label: 'Étiquettes', icon: Tag },
  { type: 'propack', label: 'Pro-Pack', icon: Flag },
  { type: 'fanions', label: 'Fanions', icon: Bookmark },
];

const TYPE_META: Record<PrintableKind, { imgFolder: string; singular: string; elisionE: string }> = {
  labels: { imgFolder: 'labels', singular: 'étiquette', elisionE: 'e' },
  propack: { imgFolder: 'pro-pack', singular: 'Pro-Pack', elisionE: '' },
  fanions: { imgFolder: 'fanions', singular: 'fanion', elisionE: '' },
};

// Vue allégée destinée aux représentants : ils choisissent des étiquettes, des items
// Pro-Pack, ou des fanions à imprimer dans le même catalogue partagé que l'équipe
// interne, sans avoir accès à la gestion des magasins ni à l'import/suppression
// d'items (réservés à l'équipe interne). Les trois catégories fonctionnent
// indépendamment l'une de l'autre (données, sélection, recherche propres à chacune).
export const RepresentantView: React.FC = () => {
  const store = useAppStore();
  const [activeType, setActiveType] = useState<PrintableKind>('labels');

  const ITEMS_BY_TYPE = { labels: store.labels, propack: store.proPack, fanions: store.fanions };
  // Les quantités du représentant sont personnelles : elles ne modifient jamais
  // item.quantity (le champ partagé utilisé côté équipe interne), donc la
  // « commande » de chaque représentant reste indépendante des autres et de
  // marketing (voir REP_QUANTITIES_*_COLLECTION dans store.ts).
  const REP_QTY_BY_TYPE = {
    labels: store.repQuantitiesLabels,
    propack: store.repQuantitiesProPack,
    fanions: store.repQuantitiesFanions,
  };
  const SET_REP_QTY_BY_TYPE = {
    labels: store.setRepQuantityLabels,
    propack: store.setRepQuantityProPack,
    fanions: store.setRepQuantityFanions,
  };
  const LOG_RUN_BY_TYPE = { labels: store.logPrintRun, propack: store.logProPackPrintRun, fanions: store.logFanionsPrintRun };

  const { stores } = store;
  const items = ITEMS_BY_TYPE[activeType];
  const repQuantities = REP_QTY_BY_TYPE[activeType];
  const setRepQuantity = SET_REP_QTY_BY_TYPE[activeType];
  const logRun = LOG_RUN_BY_TYPE[activeType];
  const { imgFolder, singular, elisionE } = TYPE_META[activeType];

  const [searchQuery, setSearchQuery] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [isStoreDropdownOpen, setIsStoreDropdownOpen] = useState(false);
  const [storeDropdownSearch, setStoreDropdownSearch] = useState('');
  const storeDropdownRef = useRef<HTMLDivElement>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const switchType = (type: PrintableKind) => {
    setActiveType(type);
    setSearchQuery('');
    setStoreFilter('');
    setSelectedItemIds([]);
  };

  // Fermer le menu déroulant du filtre magasin si clic à l'extérieur
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (storeDropdownRef.current && !storeDropdownRef.current.contains(e.target as Node)) {
        setIsStoreDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredItems = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return items.filter((item) => {
      if (storeFilter && !item.stores.includes(storeFilter)) return false;
      if (query && !item.reference.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [items, searchQuery, storeFilter]);

  const storeFilterName = storeFilter ? stores.find((s) => s.id === storeFilter)?.name : null;

  const sortedStores = useMemo(
    () => [...stores].sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })),
    [stores]
  );
  const storeDropdownOptions = useMemo(() => {
    const query = storeDropdownSearch.toLowerCase().trim();
    if (!query) return sortedStores;
    return sortedStores.filter((s) => s.name.toLowerCase().includes(query));
  }, [sortedStores, storeDropdownSearch]);

  const selectStoreFilter = (id: string) => {
    setStoreFilter(id);
    setIsStoreDropdownOpen(false);
    setStoreDropdownSearch('');
  };

  const toggleSelectAll = () => {
    if (selectedItemIds.length === filteredItems.length) {
      setSelectedItemIds([]);
    } else {
      setSelectedItemIds(filteredItems.map((l) => l.id));
    }
  };

  const toggleSelectItem = (id: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleGenerateSelectionPDF = async () => {
    // On substitue la quantité personnelle du représentant à celle de l'item
    // partagé, sans jamais l'écrire dans le catalogue commun (voir updateItem
    // plus haut, qui n'existe plus ici : seule la quantité personnelle change).
    const selectedItems = items
      .filter((l) => selectedItemIds.includes(l.id))
      .map((l) => ({ ...l, quantity: repQuantities[l.id] }));
    setIsGeneratingPDF(true);
    try {
      const { missingLabels, summary } = await generatePrinterPDF(selectedItems, store.stores, activeType);
      await logRun(summary);
      if (missingLabels.length > 0) {
        alert(
          `Le PDF a été généré, mais l'image de ${missingLabels.length} ${singular}(s) était introuvable et a été omise : ${missingLabels.join(', ')}`
        );
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Impossible de générer le PDF.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
      {/* Barre supérieure */}
      <header className="bg-slate-900 text-white flex items-center justify-between px-6 py-4 shadow-lg flex-shrink-0">
        <img
          src={`${import.meta.env.BASE_URL}Interbois-Logo-Blanc.png`}
          alt="Interbois"
          className="h-8 w-auto object-contain"
        />
        <button
          onClick={signOutUser}
          className="flex items-center gap-2 text-slate-300 hover:text-white text-sm font-medium transition"
        >
          <LogOut size={16} />
          Se déconnecter
        </button>
      </header>

      {/* Onglets de catégorie */}
      <div className="bg-white border-b flex items-center gap-1 px-6 pt-3 flex-shrink-0">
        {TYPE_TABS.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            onClick={() => switchType(type)}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition border-b-2 ${
              activeType === type
                ? 'border-orange-500 text-orange-600 bg-orange-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* Barre de recherche + filtre magasin + actions */}
      <div className="bg-white border-b flex items-center justify-between px-6 py-3 shadow-xs flex-shrink-0 gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-1 min-w-0 flex-wrap">
          <div className="relative w-96 max-w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Recherche instantanée par référence..."
              className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 transition text-sm"
            />
          </div>

          <div className="relative" ref={storeDropdownRef}>
            <button
              type="button"
              onClick={() => setIsStoreDropdownOpen((v) => !v)}
              className="flex items-center gap-2 pl-9 pr-3 py-2 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 transition text-sm max-w-[220px] relative"
            >
              <Store className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <span className="truncate">{storeFilterName ?? 'Tous les magasins'}</span>
              <ChevronDown size={14} className={`text-gray-400 transition-transform flex-shrink-0 ${isStoreDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isStoreDropdownOpen && (
              <div className="absolute z-50 left-0 top-full mt-1 bg-white rounded-xl shadow-2xl border border-gray-200 p-3 space-y-2 w-72 max-w-[90vw]">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                  <input
                    type="text"
                    value={storeDropdownSearch}
                    onChange={(e) => setStoreDropdownSearch(e.target.value)}
                    placeholder="Rechercher un magasin..."
                    className="w-full pl-8 pr-7 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-orange-500"
                    autoFocus
                  />
                  {storeDropdownSearch && (
                    <button
                      onClick={() => setStoreDropdownSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div className="max-h-64 overflow-y-auto space-y-0.5">
                  <button
                    type="button"
                    onClick={() => selectStoreFilter('')}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs transition ${!storeFilter ? 'bg-orange-50 text-orange-900 font-medium' : 'hover:bg-gray-50 text-gray-700'}`}
                  >
                    Tous les magasins
                  </button>
                  {storeDropdownOptions.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-2">Aucun magasin trouvé</p>
                  ) : (
                    storeDropdownOptions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => selectStoreFilter(s.id)}
                        className={`w-full text-left px-2 py-1.5 rounded text-xs truncate transition ${storeFilter === s.id ? 'bg-orange-50 text-orange-900 font-medium' : 'hover:bg-gray-50 text-gray-700'}`}
                      >
                        {s.name}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {storeFilterName && (
            <span className="flex items-center gap-1.5 bg-orange-50 text-orange-700 text-xs font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap">
              {filteredItems.length} {singular}(s) pour « {storeFilterName} »
              <button onClick={() => setStoreFilter('')} className="hover:text-orange-900" title="Retirer le filtre">
                <X size={13} />
              </button>
            </span>
          )}
        </div>

        {items.length > 0 && (
          <div className="flex items-center gap-4">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-orange-600 transition"
            >
              {selectedItemIds.length === filteredItems.length && filteredItems.length > 0 ? (
                <CheckSquare size={18} className="text-orange-500" />
              ) : (
                <Square size={18} className="text-gray-400" />
              )}
              Tout sélectionner ({selectedItemIds.length}/{filteredItems.length})
            </button>

            <button
              onClick={handleGenerateSelectionPDF}
              disabled={selectedItemIds.length === 0 || isGeneratingPDF}
              className="bg-slate-900 hover:bg-slate-800 disabled:bg-gray-200 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition shadow-xs whitespace-nowrap flex items-center gap-1.5"
            >
              {isGeneratingPDF ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
              Générer le PDF (sélection)
            </button>
          </div>
        )}
      </div>

      {/* Grille des items */}
      <div className="flex-1 overflow-auto p-6">
        {filteredItems.length === 0 ? (
          <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-16 flex flex-col items-center justify-center text-gray-400">
            <Search size={32} className="mb-3 text-gray-300" />
            <p className="text-base font-medium text-gray-600">
              {items.length === 0
                ? `Aucun${elisionE} ${singular} disponible pour le moment.`
                : storeFilterName
                ? `Aucun${elisionE} ${singular} affecté${elisionE} à « ${storeFilterName} ».`
                : `Aucun${elisionE} ${singular} ne correspond à cette recherche.`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredItems.map((item) => {
              const isSelected = selectedItemIds.includes(item.id);
              const initialImageSrc = item.thumbnailUrl || item.imageUrl || `${import.meta.env.BASE_URL}${imgFolder}/${item.reference}.jpg`;

              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-xl border transition shadow-xs flex flex-col overflow-hidden ${isSelected ? 'border-orange-500 ring-2 ring-orange-500/20' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <div className="relative bg-slate-100 p-2 flex items-center justify-center border-b border-gray-100 h-48">
                    <button
                      onClick={() => toggleSelectItem(item.id)}
                      className={`absolute top-2.5 left-2.5 z-10 p-1 rounded-md bg-white shadow-md border transition-all ${isSelected
                          ? 'border-orange-500 text-orange-500 bg-orange-50'
                          : 'border-gray-300 text-gray-500 hover:border-orange-500 hover:text-orange-500'
                        }`}
                      title={isSelected ? 'Désélectionner' : 'Sélectionner'}
                    >
                      {isSelected ? (
                        <CheckSquare size={20} className="text-orange-500" />
                      ) : (
                        <Square size={20} />
                      )}
                    </button>

                    <img
                      src={initialImageSrc}
                      alt={item.reference}
                      onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                        const target = e.currentTarget;
                        if (!target.dataset['triedLabels']) {
                          target.dataset['triedLabels'] = 'true';
                          target.src = `${import.meta.env.BASE_URL}${imgFolder}/${item.reference}.jpg`;
                        } else if (!target.dataset['triedRoot']) {
                          target.dataset['triedRoot'] = 'true';
                          target.src = `${import.meta.env.BASE_URL}${item.reference}.jpg`;
                        }
                      }}
                      className="h-full w-full object-contain rounded bg-white p-1 shadow-xs border border-gray-200"
                    />
                  </div>

                  <div className="p-4 flex items-end gap-2">
                    <div className="flex-1 min-w-0">
                      <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Référence produit</label>
                      <p className="font-mono font-bold text-gray-800 truncate">{item.reference}</p>
                    </div>
                    <div className="w-16">
                      <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Qté</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={2}
                        value={repQuantities[item.id] ?? 1}
                        onChange={(e) => {
                          const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 2);
                          setRepQuantity(item.id, digitsOnly === '' ? 1 : Number(digitsOnly));
                        }}
                        placeholder="1"
                        className="w-full text-center font-mono font-bold text-gray-800 bg-gray-50 border border-gray-200 rounded px-2.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
