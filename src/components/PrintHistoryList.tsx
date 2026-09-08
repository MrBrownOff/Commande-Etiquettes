import React, { useState } from 'react';
import { ChevronDown, ChevronRight, History } from 'lucide-react';
import { PrintHistoryEntry } from '../store/store';

interface PrintHistoryListProps {
  entries: PrintHistoryEntry[];
  noun?: string;
}

const formatDate = (entry: PrintHistoryEntry): string => {
  if (!entry.createdAt) return "à l'instant";
  return entry.createdAt.toDate().toLocaleString('fr-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

export const PrintHistoryList: React.FC<PrintHistoryListProps> = ({ entries, noun = 'étiquette' }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
      <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
        <History size={18} className="text-slate-700" /> Historique des impressions
      </h2>
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
