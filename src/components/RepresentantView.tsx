import React, { useMemo, useState } from 'react';
import { useAppStore } from '../store/store';
import { Search, Loader2, CheckSquare, Square, Printer, LogOut, Tag, Flag } from 'lucide-react';
import { generatePrinterPDF, PrintableKind } from '../utils/printerExport';
import { signOutUser } from './AuthGate';

const TYPE_TABS: { type: PrintableKind; label: string; icon: typeof Tag }[] = [
  { type: 'labels', label: 'Étiquettes', icon: Tag },
  { type: 'fanions', label: 'Fanions', icon: Flag },
];

// Vue allégée destinée aux représentants : ils choisissent des étiquettes ou des fanions
// à imprimer dans le même catalogue partagé que l'équipe interne, sans avoir accès à la
// gestion des magasins ni à l'import/suppression d'items (réservés à l'équipe interne).
// Les deux catégories fonctionnent indépendamment l'une de l'autre (données, sélection,
// recherche propres à chacune).
export const RepresentantView: React.FC = () => {
  const store = useAppStore();
  const [activeType, setActiveType] = useState<PrintableKind>('labels');
  const items = activeType === 'fanions' ? store.fanions : store.labels;
  const updateItem = activeType === 'fanions' ? store.updateFanion : store.updateLabel;
  const logRun = activeType === 'fanions' ? store.logFanionPrintRun : store.logPrintRun;
  const imgFolder = activeType;
  const singular = activeType === 'fanions' ? 'fanion' : 'étiquette';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const switchType = (type: PrintableKind) => {
    setActiveType(type);
    setSearchQuery('');
    setSelectedItemIds([]);
  };

  const filteredItems = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return items;
    return items.filter((item) => item.reference.toLowerCase().includes(query));
  }, [items, searchQuery]);

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
    const selectedItems = items.filter((l) => selectedItemIds.includes(l.id));
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

      {/* Barre de recherche + actions */}
      <div className="bg-white border-b flex items-center justify-between px-6 py-3 shadow-xs flex-shrink-0 gap-4 flex-wrap">
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
                ? `Aucun${activeType === 'fanions' ? '' : 'e'} ${singular} disponible pour le moment.`
                : `Aucun${activeType === 'fanions' ? '' : 'e'} ${singular} ne correspond à cette recherche.`}
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
                        value={item.quantity ?? 1}
                        onChange={(e) => {
                          const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 2);
                          updateItem(item.id, { quantity: digitsOnly === '' ? 1 : Number(digitsOnly) });
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
