import React, { useState } from 'react';
import { ChevronDown, ChevronRight, History, Loader2, Trash2 } from 'lucide-react';
import { PrintHistoryEntry } from '../store/store';

interface PrintHistoryListProps {
  entries: PrintHistoryEntry[];
  noun?: string;
  onClear?: () => Promise<void>;
}

const formatDate = (entry: PrintHistoryEntry): string => {
  if (!entry.createdAt) return "à l'instant";
  return entry.createdAt.toDate().toLocaleString('fr-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

export const PrintHistoryList: React.FC<PrintHistoryListProps> = ({ entries, noun = 'étiquette', onClear }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  const handleClear = async () => {
    if (!onClear) return;
    const confirmed = window.confirm(
      "Vider tout l'historique des impressions de ce catalogue ? Cette action est définitive. " +
        'Les assignations étiquettes/magasins ne sont pas touchées.'
    );
    if (!confirmed) return;
    setIsClearing(true);
    try {
      await onClear();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Impossible de vider l'historique.");
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
          <History size={18} className="text-slate-700" /> Historique des impressions
        </h2>
        {onClear && (
          <button
            onClick={handleClear}
            disabled={isClearing || entries.length === 0}
            className="flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700 disabled:text-gray-300 transition"
          >
            {isClearing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Vider l'historique
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500">
        Trace des informations contenues dans les derniers PDF générés (les fichiers eux-mêmes ne sont pas
        conservés, seul leur contenu est historisé).
      </p>

      {entries.length === 0 ? (
        <p className="text-xs text-gray-400 italic">Aucun PDF généré pour le moment.</p>
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
          {entries.map((entry) => {
            const isExpanded = expandedId === entry.id;
            return (
              <div key={entry.id}>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown size={14} className="text-gray-400" />
                    ) : (
                      <ChevronRight size={14} className="text-gray-400" />
                    )}
                    <span className="text-sm font-medium text-gray-800">{formatDate(entry)}</span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {entry.totalReferences} référence(s), {entry.totalQuantity} {noun}(s)
                    {entry.storeNames.length > 0 ? ` — ${entry.storeNames.join(', ')}` : ''}
                  </span>
                </button>

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
  );
};
