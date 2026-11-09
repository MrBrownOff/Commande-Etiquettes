import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useAppStore } from '../store/store';
import { Search, Loader2, CheckSquare, Square, Printer, LogOut, Tag, Flag, Bookmark, Store, X, ChevronDown, History, Download, Upload } from 'lucide-react';
import { generatePrinterPDF, PrintableKind } from '../utils/printerExport';
import { signOutUser } from './AuthGate';
import { StoreAssignPopover } from './StoreAssignPopover';
import { BatchStoreAssignPopover } from './BatchStoreAssignPopover';
import { RepresentantHistory } from './RepresentantHistory';
import { buildCsvTemplate, CsvOrderResult, decodeCsvBytes, parseCsv, resolveCsvOrder } from '../utils/csvOrder';

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
  const [showHistory, setShowHistory] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvReport, setCsvReport] = useState<{ fileName: string; result: CsvOrderResult } | { fileName: string; error: string } | null>(null);

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
  // Magasins associés par ce représentant à chaque item : personnels comme les
  // quantités, ce sont eux (et non item.stores du catalogue) qui figurent sur la
  // page de garde du PDF généré.
  const REP_STORES_BY_TYPE = {
    labels: store.repStoresLabels,
    propack: store.repStoresProPack,
    fanions: store.repStoresFanions,
  };
  const SET_REP_STORES_BY_TYPE = {
    labels: store.setRepStoresLabels,
    propack: store.setRepStoresProPack,
    fanions: store.setRepStoresFanions,
  };
  const LOG_RUN_BY_TYPE = { labels: store.logPrintRun, propack: store.logProPackPrintRun, fanions: store.logFanionsPrintRun };

  const { stores } = store;
  const items = ITEMS_BY_TYPE[activeType];
  const repQuantities = REP_QTY_BY_TYPE[activeType];
  const setRepQuantity = SET_REP_QTY_BY_TYPE[activeType];
  const repStores = REP_STORES_BY_TYPE[activeType];
  const setRepStores = SET_REP_STORES_BY_TYPE[activeType];
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
    setShowHistory(false);
    setCsvReport(null);
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

  // Ajoute (ou retire) des magasins à chaque item sélectionné, en conservant ceux
  // déjà associés à chacun.
  const assignStoresToSelection = (itemIds: string[], storeIds: string[]) => {
    itemIds.forEach((id) =>
      setRepStores([id], Array.from(new Set([...(repStores[id] ?? []), ...storeIds])))
    );
  };
  const removeStoresFromSelection = (itemIds: string[], storeIds: string[]) => {
    itemIds.forEach((id) => setRepStores([id], (repStores[id] ?? []).filter((s) => !storeIds.includes(s))));
  };

  const handleDownloadCsvTemplate = () => {
    const csv = buildCsvTemplate(items, stores);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `modele_commande_${activeType === 'labels' ? 'etiquettes' : activeType}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Sélectionne les items listés dans le CSV (croisement strict avec le
  // catalogue de l'onglet actif) et applique leurs quantités et magasins
  // personnels, comme si le représentant les avait saisis à la main.
  const handleCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const result = resolveCsvOrder(parseCsv(decodeCsvBytes(await file.arrayBuffer())), items, stores);
      result.matched.forEach(({ item, quantity, storeIds }) => {
        setRepQuantity(item.id, quantity);
        if (storeIds) setRepStores([item.id], storeIds);
      });
      setSelectedItemIds(result.matched.map((m) => m.item.id));
      setSearchQuery('');
      setStoreFilter('');
      setCsvReport({ fileName: file.name, result });
    } catch (err) {
      setCsvReport({ fileName: file.name, error: err instanceof Error ? err.message : 'Fichier illisible.' });
    }
  };

  const handleGenerateSelectionPDF = async () => {
    // On substitue la quantité personnelle du représentant à celle de l'item
    // partagé, sans jamais l'écrire dans le catalogue commun (voir updateItem
    // plus haut, qui n'existe plus ici : seule la quantité personnelle change).
    const selectedItems = items
      .filter((l) => selectedItemIds.includes(l.id))
      .map((l) => ({ ...l, quantity: repQuantities[l.id] ?? 1, stores: repStores[l.id] ?? [] }));
    setIsGeneratingPDF(true);
    try {
      const { missingLabels, noCropMarksLabels, summary } = await generatePrinterPDF(selectedItems, store.stores, activeType, store.userName);
      await logRun(summary);
      if (missingLabels.length > 0) {
        alert(
          `Le PDF a été généré, mais l'image de ${missingLabels.length} ${singular}(s) était introuvable et a été omise : ${missingLabels.join(', ')}`
        );
      }
      if (noCropMarksLabels.length > 0) {
        alert(
          `Attention : le PDF vectoriel (avec traits de coupe) était introuvable pour ${noCropMarksLabels.length} ${singular}(s), imprimé(s) à partir de l'image JPEG sans traits de coupe : ${noCropMarksLabels.join(', ')}`
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
        {store.userName && <span className="text-sm text-slate-300 ml-auto mr-6 truncate">{store.userName}</span>}
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
              !showHistory && activeType === type
                ? 'border-orange-500 text-orange-600 bg-orange-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
        <button
          onClick={() => setShowHistory(true)}
          className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition border-b-2 ml-auto ${
            showHistory
              ? 'border-orange-500 text-orange-600 bg-orange-50/50'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <History size={16} />
          Historique
        </button>
      </div>

      {showHistory ? (
        <RepresentantHistory />
      ) : (
        <>

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

        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadCsvTemplate}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-orange-600 transition"
            title="Télécharger le fichier CSV modèle"
          >
            <Download size={16} />
            Modèle CSV
          </button>
          <button
            onClick={() => csvInputRef.current?.click()}
            disabled={items.length === 0}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-orange-600 disabled:text-gray-300 transition"
          >
            <Upload size={16} />
            Importer un CSV
          </button>
          <input ref={csvInputRef} type="file" accept=".csv,text/csv" onChange={handleCsvFile} className="hidden" />
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

            {selectedItemIds.length > 0 && (
              <BatchStoreAssignPopover
                selectedLabelIds={selectedItemIds}
                onAssign={assignStoresToSelection}
                onRemove={removeStoresFromSelection}
              />
            )}

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

      {csvReport && (
        <div className="mx-6 mt-4 bg-white border border-gray-200 rounded-xl p-4 text-sm space-y-2 flex-shrink-0 max-h-60 overflow-auto">
          <div className="flex items-start justify-between gap-3">
            <p className="font-semibold text-gray-800">Import de « {csvReport.fileName} »</p>
            <button onClick={() => setCsvReport(null)} className="text-gray-400 hover:text-gray-600" title="Fermer">
              <X size={16} />
            </button>
          </div>
          {'error' in csvReport ? (
            <p className="text-red-600">{csvReport.error}</p>
          ) : (
            <>
              <p className="text-gray-700">
                {csvReport.result.matched.length} {singular}(s) sélectionné{elisionE}(s) dans le catalogue.
              </p>
              {csvReport.result.notFound.length > 0 && (
                <p className="text-red-600">
                  Référence(s) introuvable(s) au catalogue (ignorée(s)) :{' '}
                  {csvReport.result.notFound.map((n) => `${n.reference} (ligne ${n.line})`).join(', ')}
                </p>
              )}
              {csvReport.result.invalidQuantity.length > 0 && (
                <p className="text-red-600">
                  Quantité invalide, entre 1 et 99 attendue (ligne ignorée) :{' '}
                  {csvReport.result.invalidQuantity.map((n) => `${n.reference} = « ${n.value} » (ligne ${n.line})`).join(', ')}
                </p>
              )}
              {csvReport.result.unknownStores.length > 0 && (
                <p className="text-amber-700">
                  Magasin(s) inconnu(s) (non associé(s)) :{' '}
                  {csvReport.result.unknownStores.map((n) => `« ${n.name} » (${n.reference}, ligne ${n.line})`).join(', ')}
                </p>
              )}
            </>
          )}
        </div>
      )}

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
                  className={`bg-white rounded-xl border transition shadow-xs flex flex-col ${isSelected ? 'border-orange-500 ring-2 ring-orange-500/20' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <div className="relative bg-slate-100 p-2 flex items-center justify-center border-b border-gray-100 h-48 rounded-t-xl">
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

                  <div className="px-4 pb-4 space-y-2">
                    <StoreAssignPopover
                      assignedStoreIds={repStores[item.id] ?? []}
                      onChangeStores={(ids) => setRepStores([item.id], ids)}
                    />
                    {(repStores[item.id] ?? []).length > 0 && (
                      <p className="text-[11px] text-gray-500 leading-snug">
                        {(repStores[item.id] ?? [])
                          .map((id) => stores.find((s) => s.id === id)?.name)
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
};
