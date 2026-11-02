// src/components/StoreHistoryView.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { CheckSquare, History, Loader2, Printer, Search, Square, Store } from 'lucide-react';
import { LabelItem, PrintHistoryEntry, useAppStore } from '../store/store';
import { generatePrinterPDF, PrintableKind } from '../utils/printerExport';

interface CatalogConfig {
  kind: PrintableKind;
  label: string;
  items: LabelItem[];
  history: PrintHistoryEntry[];
  logRun: (entry: {
    totalReferences: number;
    totalQuantity: number;
    storeNames: string[];
    items: { reference: string; quantity: number; storeNames: string[] }[];
  }) => Promise<void>;
}

interface HistoryRow {
  date: string;
  dateMs: number;
  kind: PrintableKind;
  catalog: string;
  reference: string;
  quantity: number;
}

// Référence déjà imprimée au moins une fois pour ce magasin : la quantité
// réimprimable est éditable, initialisée à la dernière quantité imprimée.
interface ReprintCandidate {
  reference: string;
  lastQuantity: number;
  lastDate: string;
  matchedItem: LabelItem | undefined; // undefined si la référence n'existe plus dans le catalogue actuel
}

interface ReprintSelectionState {
  checked: boolean;
  quantity: number;
}

const formatDate = (entry: PrintHistoryEntry): string => {
  if (!entry.createdAt) return "à l'instant";
  return entry.createdAt.toDate().toLocaleString('fr-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const emptyByKind = <T,>(value: () => T): Record<PrintableKind, T> => ({
  labels: value(),
  propack: value(),
  fanions: value(),
});

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
  const [reprintSelection, setReprintSelection] = useState<Record<PrintableKind, Record<string, ReprintSelectionState>>>(
    emptyByKind(() => ({}))
  );
  const [generatingKind, setGeneratingKind] = useState<PrintableKind | null>(null);

  const sortedStores = useMemo(
    () => [...stores].sort((a, b) => a.name.localeCompare(b.name, 'fr-CA')),
    [stores]
  );

  const selectedStore = sortedStores.find((s) => s.id === selectedStoreId);

  // Catalogues partageant tous la même structure d'historique et de réimpression
  // (voir store.ts / printerExport.ts) : un même magasin peut apparaître dans
  // n'importe lequel des trois.
  const catalogs: CatalogConfig[] = [
    { kind: 'labels', label: 'Étiquettes', items: labels, history: printHistory, logRun: logPrintRun },
    { kind: 'propack', label: 'Pro-Pack', items: proPack, history: proPackPrintHistory, logRun: logProPackPrintRun },
    { kind: 'fanions', label: 'Fanions', items: fanions, history: fanionsPrintHistory, logRun: logFanionsPrintRun },
  ];

  // Le rapprochement avec l'historique se fait par nom de magasin (seule
  // information conservée au moment de l'impression, pas l'ID) : un magasin
  // renommé depuis ne retrouvera pas ses impressions antérieures sous son
  // nouveau nom.
  const rows: HistoryRow[] = useMemo(() => {
    if (!selectedStore) return [];
    const result: HistoryRow[] = [];
    for (const { kind, label, history } of catalogs) {
      for (const entry of history) {
        for (const item of entry.items) {
          if (item.storeNames.includes(selectedStore.name)) {
            result.push({
              date: formatDate(entry),
              dateMs: entry.createdAt?.toMillis() ?? 0,
              kind,
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

  // Les étiquettes réimprimables sont uniquement celles déjà apparues dans
  // l'historique de ce magasin (pas les assignations actuelles du catalogue) :
  // une référence par catalogue, dédupliquée sur son occurrence la plus
  // récente (rows est déjà trié du plus récent au plus ancien).
  const reprintCandidatesByKind = useMemo(() => {
    const result = emptyByKind<ReprintCandidate[]>(() => []);
    const catalogItemsByKind: Record<PrintableKind, LabelItem[]> = { labels, propack: proPack, fanions };
    const seen = emptyByKind<Set<string>>(() => new Set<string>());
    for (const row of rows) {
      if (seen[row.kind].has(row.reference)) continue;
      seen[row.kind].add(row.reference);
      result[row.kind].push({
        reference: row.reference,
        lastQuantity: row.quantity,
        lastDate: row.date,
        matchedItem: catalogItemsByKind[row.kind].find((i) => i.reference === row.reference),
      });
    }
    (Object.keys(result) as PrintableKind[]).forEach((kind) =>
      result[kind].sort((a, b) => a.reference.localeCompare(b.reference, 'fr-CA'))
    );
    return result;
  }, [rows, labels, proPack, fanions]);

  // Présélectionne (cochées, quantité = dernière quantité imprimée) toutes les
  // références encore présentes dans le catalogue, dès qu'on choisit le magasin.
  useEffect(() => {
    const next = emptyByKind<Record<string, ReprintSelectionState>>(() => ({}));
    (Object.keys(reprintCandidatesByKind) as PrintableKind[]).forEach((kind) => {
      for (const candidate of reprintCandidatesByKind[kind]) {
        next[kind][candidate.reference] = {
          checked: Boolean(candidate.matchedItem),
          quantity: candidate.lastQuantity,
        };
      }
    });
    setReprintSelection(next);
  }, [selectedStore?.id]);

  const toggleCandidate = (kind: PrintableKind, reference: string) => {
    setReprintSelection((prev) => ({
      ...prev,
      [kind]: {
        ...prev[kind],
        [reference]: { ...prev[kind][reference], checked: !prev[kind][reference]?.checked },
      },
    }));
  };

  const setCandidateQuantity = (kind: PrintableKind, reference: string, quantity: number) => {
    setReprintSelection((prev) => ({
      ...prev,
      [kind]: {
        ...prev[kind],
        [reference]: { ...prev[kind][reference], quantity },
      },
    }));
  };

  const toggleAll = (kind: PrintableKind) => {
    const available = reprintCandidatesByKind[kind].filter((c) => c.matchedItem);
    const allChecked = available.every((c) => reprintSelection[kind][c.reference]?.checked);
    setReprintSelection((prev) => {
      const next = { ...prev[kind] };
      for (const candidate of available) {
        next[candidate.reference] = { ...next[candidate.reference], checked: !allChecked };
      }
      return { ...prev, [kind]: next };
    });
  };

  const handleGenerate = async (config: CatalogConfig) => {
    const selection = reprintSelection[config.kind];
    const itemsToPrint: LabelItem[] = [];
    for (const candidate of reprintCandidatesByKind[config.kind]) {
      const sel = selection[candidate.reference];
      if (!sel?.checked || !candidate.matchedItem || sel.quantity <= 0) continue;
      itemsToPrint.push({ ...candidate.matchedItem, quantity: sel.quantity });
    }
    if (itemsToPrint.length === 0) return;

    setGeneratingKind(config.kind);
    try {
      const { missingLabels, noCropMarksLabels, summary } = await generatePrinterPDF(itemsToPrint, stores, config.kind);
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
          Choisis un magasin pour réimprimer ce qui lui a déjà été imprimé (en ajustant au besoin les
          quantités) ou consulter son historique, tous catalogues confondus (étiquettes, Pro-Pack, fanions).
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

          {rows.length === 0 ? (
            <p className="text-sm text-gray-400 italic">
              Aucun historique d'impression pour ce magasin — rien à réimprimer.
            </p>
          ) : (
            catalogs.map((config) => {
              const candidates = reprintCandidatesByKind[config.kind];
              if (candidates.length === 0) return null;
              const selection = reprintSelection[config.kind];
              const available = candidates.filter((c) => c.matchedItem);
              const checkedCount = available.filter((c) => selection[c.reference]?.checked).length;
              const allChecked = available.length > 0 && checkedCount === available.length;
              const isGenerating = generatingKind === config.kind;
              const canGenerate = available.some(
                (c) => selection[c.reference]?.checked && (selection[c.reference]?.quantity ?? 0) > 0
              );

              return (
                <div key={config.kind} className="border border-gray-100 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                    <button
                      onClick={() => toggleAll(config.kind)}
                      disabled={available.length === 0}
                      className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-orange-600 transition disabled:opacity-50"
                    >
                      {allChecked ? (
                        <CheckSquare size={16} className="text-orange-500" />
                      ) : (
                        <Square size={16} className="text-gray-400" />
                      )}
                      {config.label}
                      <span className="text-xs font-normal text-gray-400">
                        ({checkedCount}/{available.length})
                      </span>
                    </button>
                    <button
                      onClick={() => handleGenerate(config)}
                      disabled={!canGenerate || generatingKind !== null}
                      className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-200 text-white px-3 py-1.5 rounded-lg transition text-xs font-semibold"
                    >
                      {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                      Générer le PDF
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
                    {candidates.map((candidate) => {
                      const sel = selection[candidate.reference];
                      const isAvailable = Boolean(candidate.matchedItem);
                      return (
                        <div
                          key={candidate.reference}
                          className={`flex items-center justify-between px-4 py-1.5 text-sm ${isAvailable ? 'hover:bg-gray-50' : 'opacity-50'}`}
                        >
                          <label className="flex items-center gap-2 min-w-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(sel?.checked)}
                              disabled={!isAvailable}
                              onChange={() => toggleCandidate(config.kind, candidate.reference)}
                              className="rounded text-orange-500 focus:ring-orange-400 h-3.5 w-3.5 flex-shrink-0"
                            />
                            <span className="font-mono text-gray-700 truncate">{candidate.reference}</span>
                            {!isAvailable && (
                              <span className="text-[11px] text-gray-400 italic flex-shrink-0">
                                introuvable dans le catalogue actuel
                              </span>
                            )}
                          </label>
                          <span className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-[11px] text-gray-400">
                              dernière fois : {candidate.lastQuantity} ({candidate.lastDate})
                            </span>
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={3}
                              disabled={!isAvailable}
                              value={sel?.quantity ?? 0}
                              onChange={(e) => {
                                const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 3);
                                setCandidateQuantity(config.kind, candidate.reference, digitsOnly === '' ? 0 : Number(digitsOnly));
                              }}
                              className="w-14 text-center bg-white border border-gray-200 rounded px-1.5 py-1 text-xs font-semibold text-gray-700 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-gray-100"
                            />
                          </span>
                        </div>
                      );
                    })}
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
