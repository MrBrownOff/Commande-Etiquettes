// src/components/StoreHistoryView.tsx
import React, { useMemo, useState } from 'react';
import { History, Store } from 'lucide-react';
import { PrintHistoryEntry, useAppStore } from '../store/store';

interface CatalogConfig {
  key: string;
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

const formatDate = (entry: PrintHistoryEntry): string => {
  if (!entry.createdAt) return "à l'instant";
  return entry.createdAt.toDate().toLocaleString('fr-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

export const StoreHistoryView: React.FC = () => {
  const { stores, printHistory, proPackPrintHistory, fanionsPrintHistory } = useAppStore();
  const [selectedStoreId, setSelectedStoreId] = useState('');

  const sortedStores = useMemo(
    () => [...stores].sort((a, b) => a.name.localeCompare(b.name, 'fr-CA')),
    [stores]
  );

  const selectedStore = sortedStores.find((s) => s.id === selectedStoreId);

  // Catalogues partageant tous la même structure d'historique (voir store.ts) :
  // un même magasin peut apparaître dans n'importe lequel des trois.
  const catalogs: CatalogConfig[] = [
    { key: 'labels', label: 'Étiquettes', history: printHistory },
    { key: 'propack', label: 'Pro-Pack', history: proPackPrintHistory },
    { key: 'fanions', label: 'Fanions', history: fanionsPrintHistory },
  ];

  // Le rapprochement se fait par nom de magasin (seule information conservée dans
  // l'historique au moment de l'impression) : un magasin renommé depuis ne
  // retrouvera pas ses impressions antérieures sous son nouveau nom.
  const rows: HistoryRow[] = useMemo(() => {
    if (!selectedStore) return [];
    const result: HistoryRow[] = [];
    for (const { label, history } of catalogs) {
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

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <History size={24} className="text-slate-700" />
          Historique par magasin
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Choisis un magasin pour voir les références déjà imprimées pour lui, tous catalogues confondus
          (étiquettes, Pro-Pack, fanions).
        </p>
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
        <label className="block">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <Store size={14} />
            Magasin
          </span>
          <select
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
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

        {selectedStore && (
          rows.length === 0 ? (
            <p className="text-sm text-gray-400 italic">
              Aucune impression trouvée pour « {selectedStore.name} » dans l'historique conservé.
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
                  {rows.map((row, i) => (
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
          )
        )}

        <p className="text-[11px] text-gray-400">
          Basé sur les 200 derniers lots d'impression conservés par catalogue.
        </p>
      </div>
    </div>
  );
};
