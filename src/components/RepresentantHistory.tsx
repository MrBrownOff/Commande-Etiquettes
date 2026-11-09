import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, History, Loader2, Printer } from 'lucide-react';
import { LabelItem, PrintHistoryEntry, useAppStore } from '../store/store';
import { auth } from '../firebase';
import { generatePrinterPDF, PrintableKind } from '../utils/printerExport';

const KIND_LABELS: Record<PrintableKind, { label: string; noun: string }> = {
  labels: { label: 'Étiquettes', noun: 'étiquette' },
  propack: { label: 'Pro-Pack', noun: 'Pro-Pack' },
  fanions: { label: 'Fanions', noun: 'fanion' },
};

interface HistoryRow {
  kind: PrintableKind;
  entry: PrintHistoryEntry;
}

const formatDate = (entry: PrintHistoryEntry): string => {
  if (!entry.createdAt) return "à l'instant";
  return entry.createdAt.toDate().toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' });
};

// Historique personnel d'un représentant : les PDF qu'il a lui-même générés (les
// fichiers ne sont pas conservés, mais leur contenu l'est et chaque PDF peut être
// régénéré à l'identique depuis ici).
export const RepresentantHistory: React.FC = () => {
  const store = useAppStore();
  const { stores, userName } = store;
  const uid = auth.currentUser?.uid;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const CATALOGS: Record<PrintableKind, { items: LabelItem[]; history: PrintHistoryEntry[]; logRun: typeof store.logPrintRun }> = {
    labels: { items: store.labels, history: store.printHistory, logRun: store.logPrintRun },
    propack: { items: store.proPack, history: store.proPackPrintHistory, logRun: store.logProPackPrintRun },
    fanions: { items: store.fanions, history: store.fanionsPrintHistory, logRun: store.logFanionsPrintRun },
  };

  const rows: HistoryRow[] = useMemo(() => {
    const result: HistoryRow[] = [];
    (Object.keys(CATALOGS) as PrintableKind[]).forEach((kind) => {
      CATALOGS[kind].history.forEach((entry) => {
        if (uid && entry.uid === uid) result.push({ kind, entry });
      });
    });
    return result.sort(
      (a, b) => (b.entry.createdAt?.toMillis() ?? Infinity) - (a.entry.createdAt?.toMillis() ?? Infinity)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, store.printHistory, store.proPackPrintHistory, store.fanionsPrintHistory]);

  const regenerate = async ({ kind, entry }: HistoryRow) => {
    const { items: catalogItems, logRun } = CATALOGS[kind];
    const toPrint: LabelItem[] = [];
    for (const line of entry.items) {
      const item = catalogItems.find((i) => i.reference === line.reference);
      if (!item) continue;
      toPrint.push({
        ...item,
        quantity: line.quantity,
        stores: stores.filter((s) => line.storeNames.includes(s.name)).map((s) => s.id),
      });
    }
    if (toPrint.length === 0) {
      alert("Aucune référence de ce PDF n'existe plus dans le catalogue actuel.");
      return;
    }
    setGeneratingId(entry.id);
    try {
      const { summary } = await generatePrinterPDF(toPrint, stores, kind, userName);
      await logRun(summary);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Impossible de générer le PDF.');
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-3xl mx-auto bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
          <History size={18} className="text-slate-700" /> Mes PDF générés
        </h2>
        <p className="text-xs text-gray-500">
          Les fichiers eux-mêmes ne sont pas conservés : seul leur contenu l'est. Vous pouvez régénérer n'importe
          quel PDF à l'identique.
        </p>

        {rows.length === 0 ? (
          <p className="text-xs text-gray-400 italic">Aucun PDF généré pour le moment.</p>
        ) : (
          <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
            {rows.map((row) => {
              const { kind, entry } = row;
              const { label, noun } = KIND_LABELS[kind];
              const isExpanded = expandedId === entry.id;
              return (
                <div key={`${kind}-${entry.id}`}>
                  <div className="flex items-center justify-between px-4 py-3 gap-3 hover:bg-gray-50 transition">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      className="flex items-center gap-2 text-left min-w-0 flex-1"
                    >
                      {isExpanded ? (
                        <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
                      ) : (
                        <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800">
                          {formatDate(entry)} — {label}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {entry.totalReferences} référence(s), {entry.totalQuantity} {noun}(s)
                          {entry.storeNames.length > 0 ? ` — ${entry.storeNames.join(', ')}` : ''}
                        </p>
                      </div>
                    </button>
                    <button
                      onClick={() => regenerate(row)}
                      disabled={generatingId !== null}
                      className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-orange-600 disabled:text-gray-300 transition whitespace-nowrap"
                    >
                      {generatingId === entry.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Printer size={14} />
                      )}
                      Régénérer
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 bg-gray-50">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-gray-400 uppercase tracking-wider">
                            <th className="py-1.5 font-semibold">Référence</th>
                            <th className="py-1.5 font-semibold w-16">Qté</th>
                            <th className="py-1.5 font-semibold">Magasin(s)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entry.items.map((item, i) => (
                            <tr key={i} className="border-t border-gray-200">
                              <td className="py-1.5 font-mono text-gray-700">{item.reference}</td>
                              <td className="py-1.5 text-gray-700">{item.quantity}</td>
                              <td className="py-1.5 text-gray-500">
                                {item.storeNames.length > 0 ? item.storeNames.join(', ') : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
