// src/components/StoreHistoryView.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { CheckSquare, History, Loader2, Printer, Search, Square, Store } from 'lucide-react';
import { LabelItem, PrintHistoryEntry, useAppStore } from '../store/store';
import { generatePrinterPDF, PrintableKind } from '../utils/printerExport';

interface CatalogHistoryConfig {
  label: string;
  history: PrintHistoryEntry[];
}

interface HistoryRow {
  date: string;
  dateMs: number;
  catalog: string;
  reference: string;
  quantity: number;
}

interface PrintableCatalogConfig {
  kind: PrintableKind;
  label: string;
  items: LabelItem[];
  logRun: (entry: {
    totalReferences: number;
    totalQuantity: number;
    storeNames: string[];
    items: { reference: string; quantity: number; storeNames: string[] }[];
  }) => Promise<void>;
}

const formatDate = (entry: PrintHistoryEntry): string => {
  if (!entry.createdAt) return "à l'instant";
  return entry.createdAt.toDate().toLocaleString('fr-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

export const StoreHistoryView: React.FC = () => {
  const {
    stores,
    labels,
    proPack,
    fanions,
    printHistory,
    proPackPrintHistory,
    fanionsPrintHistory,
    logPrintRun,
    logProPackPrintRun,
    logFanionsPrintRun,
  } = useAppStore();
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [referenceSearch, setReferenceSearch] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<Record<PrintableKind, string[]>>({
    labels: [],
    propack: [],
    fanions: [],
  });
  const [generatingKind, setGeneratingKind] = useState<PrintableKind | null>(null);

  const sortedStores = useMemo(
    () => [...stores].sort((a, b) => a.name.localeCompare(b.name, 'fr-CA')),
    [stores]
  );

  const selectedStore = sortedStores.find((s) => s.id === selectedStoreId);

  // Catalogues partageant tous la même structure d'historique et de réimpression
  // (voir store.ts / printerExport.ts) : un même magasin peut apparaître dans
  // n'importe lequel des trois.
  const printableCatalogs: PrintableCatalogConfig[] = [
    { kind: 'labels', label: 'Étiquettes', items: labels, logRun: logPrintRun },
    { kind: 'propack', label: 'Pro-Pack', items: proPack, logRun: logProPackPrintRun },
    { kind: 'fanions', label: 'Fanions', items: fanions, logRun: logFanionsPrintRun },
  ];

  const historyCatalogs: CatalogHistoryConfig[] = [
    { label: 'Étiquettes', history: printHistory },
    { label: 'Pro-Pack', history: proPackPrintHistory },
    { label: 'Fanions', history: fanionsPrintHistory },
  ];

  // Références actuellement assignées au magasin sélectionné, catalogue par
  // catalogue — seules celles avec une quantité renseignée sont imprimables
  // (voir generatePrinterPDF, qui rejette sinon).
  const eligibleItemsByKind = useMemo(() => {
    const result: Record<PrintableKind, LabelItem[]> = { labels: [], propack: [], fanions: [] };
    if (!selectedStore) return result;
    for (const { kind, items } of printableCatalogs) {
      result[kind] = items
        .filter((item) => item.stores.includes(selectedStore.id) && (item.quantity ?? 0) > 0)
        .sort((a, b) => a.reference.localeCompare(b.reference, 'fr-CA'));
    }
    return result;
  }, [selectedStore, labels, proPack, fanions]);

  // Présélectionne tout ce qui est assigné au magasin dès qu'on le choisit, pour
  // que « Générer le PDF » reproduise par défaut l'ensemble de ses étiquettes.
  useEffect(() => {
    setSelectedItemIds({
      labels: eligibleItemsByKind.labels.map((i) => i.id),
      propack: eligibleItemsByKind.propack.map((i) => i.id),
      fanions: eligibleItemsByKind.fanions.map((i) => i.id),
    });
  }, [selectedStore?.id]);

  const toggleItem = (kind: PrintableKind, id: string) => {
    setSelectedItemIds((prev) => ({
      ...prev,
      [kind]: prev[kind].includes(id) ? prev[kind].filter((i) => i !== id) : [...prev[kind], id],
    }));
  };

  const toggleAll = (kind: PrintableKind) => {
    const allIds = eligibleItemsByKind[kind].map((i) => i.id);
    setSelectedItemIds((prev) => ({
      ...prev,
      [kind]: prev[kind].length === allIds.length ? [] : allIds,
    }));
  };

  const handleGenerate = async (config: PrintableCatalogConfig) => {
    const selectedItems = config.items.filter((item) => selectedItemIds[config.kind].includes(item.id));
    if (selectedItems.length === 0) return;

    setGeneratingKind(config.kind);
    try {
      const { missingLabels, noCropMarksLabels, summary } = await generatePrinterPDF(selectedItems, stores, config.kind);
      await config.logRun(summary);
      if (missingLabels.length > 0) {
        alert(
          `Le PDF ${config.label} a été généré, mais l'image de ${missingLabels.length} référence(s) était introuvable et a été omise : ${missingLabels.join(', ')}`
        );
      }
      if (noCropMarksLabels.length > 0) {
        alert(
          `Attention : le PDF vectoriel (avec traits de coupe) était introuvable pour ${noCropMarksLabels.length} référence(s) du PDF ${config.label}, imprimée(s) à partir de l'image JPEG sans traits de coupe : ${noCropMarksLabels.join(', ')}`
        );
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Impossible de générer le PDF.');
    } finally {
      setGeneratingKind(null);
    }
  };

  // Le rapprochement avec l'historique se fait par nom de magasin (seule
  // information conservée au moment de l'impression, pas l'ID) : un magasin
  // renommé depuis ne retrouvera pas ses impressions antérieures sous son
  // nouveau nom.
  const rows: HistoryRow[] = useMemo(() => {
    if (!selectedStore) return [];
    const result: HistoryRow[] = [];
    for (const { label, history } of historyCatalogs) {
      for (const entry of history) {
        for (const item of entry.items) {
          if (item.storeNames.includes(selectedStore.name)) {
            result.push({
              date: formatDate(entry),
              dateMs: entry.createdAt?.toMillis() ?? 0,
              catalog: label,
              reference: item.reference,
              quantity: item.quantity,
            });
          }
        }
      }
    }
    return result.sort((a, b) => b.dateMs - a.dateMs);
  }, [selectedStore, printHistory, proPackPrintHistory, fanionsPrintHistory]);

  const filteredRows = useMemo(() => {
    const query = referenceSearch.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => row.reference.toLowerCase().includes(query));
  }, [rows, referenceSearch]);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <History size={24} className="text-slate-700" />
          Historique par magasin
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Choisis un magasin pour réimprimer ses étiquettes assignées ou consulter ce qui lui a déjà été
          imprimé, tous catalogues confondus (étiquettes, Pro-Pack, fanions).
        </p>
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs">
        <label className="block">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <Store size={14} />
            Magasin
          </span>
          <select
            value={selectedStoreId}
            onChange={(e) => {
              setSelectedStoreId(e.target.value);
              setReferenceSearch('');
            }}
            className="w-full max-w-md bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
          >
            <option value="">Sélectionner un magasin...</option>
            {sortedStores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedStore && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-5">
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <Printer size={18} className="text-slate-700" />
            Réimprimer pour « {selectedStore.name} »
          </h2>

          {printableCatalogs.every(({ kind }) => eligibleItemsByKind[kind].length === 0) ? (
            <p className="text-sm text-gray-400 italic">
              Aucune référence avec quantité renseignée n'est actuellement assignée à ce magasin.
            </p>
          ) : (
            printableCatalogs.map((config) => {
              const eligible = eligibleItemsByKind[config.kind];
              if (eligible.length === 0) return null;
              const selected = selectedItemIds[config.kind];
              const allSelected = selected.length === eligible.length;
              const isGenerating = generatingKind === config.kind;

              return (
                <div key={config.kind} className="border border-gray-100 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                    <button
                      onClick={() => toggleAll(config.kind)}
                      className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-orange-600 transition"
                    >
                      {allSelected ? (
                        <CheckSquare size={16} className="text-orange-500" />
                      ) : (
                        <Square size={16} className="text-gray-400" />
                      )}
                      {config.label}
                      <span className="text-xs font-normal text-gray-400">
                        ({selected.length}/{eligible.length})
                      </span>
                    </button>
                    <button
                      onClick={() => handleGenerate(config)}
                      disabled={selected.length === 0 || generatingKind !== null}
                      className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-200 text-white px-3 py-1.5 rounded-lg transition text-xs font-semibold"
                    >
                      {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                      Générer le PDF
                    </button>
                  </div>
                  <div className="max-h-56 overflow-y-auto divide-y divide-gray-50">
                    {eligible.map((item) => (
                      <label
                        key={item.id}
                        className="flex items-center justify-between px-4 py-1.5 text-sm hover:bg-gray-50 cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selected.includes(item.id)}
                            onChange={() => toggleItem(config.kind, item.id)}
                            className="rounded text-orange-500 focus:ring-orange-400 h-3.5 w-3.5"
                          />
                          <span className="font-mono text-gray-700">{item.reference}</span>
                        </span>
                        <span className="text-xs text-gray-400">Qté {item.quantity}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
          <History size={18} className="text-slate-700" />
          Historique des impressions
        </h2>

        {!selectedStore ? (
          <p className="text-sm text-gray-400 italic">Sélectionne un magasin pour voir son historique.</p>
        ) : (
          <>
            {rows.length > 0 && (
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="text"
                  value={referenceSearch}
                  onChange={(e) => setReferenceSearch(e.target.value)}
                  placeholder="Rechercher une référence..."
                  className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
            )}

            {rows.length === 0 ? (
              <p className="text-sm text-gray-400 italic">
                Aucune impression trouvée pour « {selectedStore.name} » dans l'historique conservé.
              </p>
            ) : filteredRows.length === 0 ? (
              <p className="text-sm text-gray-400 italic">
                Aucune référence ne correspond à « {referenceSearch} » pour « {selectedStore.name} ».
              </p>
            ) : (
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 uppercase tracking-wider text-xs bg-gray-50">
                      <th className="py-2 px-3 font-semibold">Date</th>
                      <th className="py-2 px-3 font-semibold">Catalogue</th>
                      <th className="py-2 px-3 font-semibold">Référence</th>
                      <th className="py-2 px-3 font-semibold w-16">Qté</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{row.date}</td>
                        <td className="py-2 px-3 text-gray-500">{row.catalog}</td>
                        <td className="py-2 px-3 font-mono text-gray-700">{row.reference}</td>
                        <td className="py-2 px-3 text-gray-700">{row.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-[11px] text-gray-400">
              Basé sur les 200 derniers lots d'impression conservés par catalogue.
            </p>
          </>
        )}
      </div>
    </div>
  );
};
