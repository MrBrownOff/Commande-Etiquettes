// src/components/PdfImportView.tsx
import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileUp, Loader2, Printer, Store } from 'lucide-react';
import { LabelItem, useAppStore } from '../store/store';
import { generatePrinterPDF, PrintableKind } from '../utils/printerExport';
import { extractPagesWithFullPageOCR } from '../utils/pdf';
import { matchReference } from '../utils/matchReference';

const CATALOG_LABELS: Record<PrintableKind, string> = {
  labels: 'Étiquettes',
  propack: 'Pro-Pack',
  fanions: 'Fanions',
};

interface ImportRow {
  id: string;
  pageNumber: number;
  thumbnailDataUrl: string;
  reference: string;
  matchKind: 'exact' | 'fuzzy' | 'none';
  checked: boolean;
  quantity: number;
}

export const PdfImportView: React.FC = () => {
  const { stores, labels, proPack, fanions, logPrintRun, logProPackPrintRun, logFanionsPrintRun } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [itemType, setItemType] = useState<PrintableKind>('labels');
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [isGenerating, setIsGenerating] = useState(false);

  const catalogConfig: Record<PrintableKind, { items: LabelItem[]; logRun: (entry: {
    totalReferences: number;
    totalQuantity: number;
    storeNames: string[];
    items: { reference: string; quantity: number; storeNames: string[] }[];
  }) => Promise<void> }> = {
    labels: { items: labels, logRun: logPrintRun },
    propack: { items: proPack, logRun: logProPackPrintRun },
    fanions: { items: fanions, logRun: logFanionsPrintRun },
  };
  const { items: catalogItems, logRun } = catalogConfig[itemType];

  const sortedStores = useMemo(
    () => [...stores].sort((a, b) => a.name.localeCompare(b.name, 'fr-CA')),
    [stores]
  );
  const selectedStore = sortedStores.find((s) => s.id === selectedStoreId);

  const referenceList = useMemo(() => catalogItems.map((i) => i.reference), [catalogItems]);

  const handleFile = async (file: File) => {
    setRows([]);
    setFileName(file.name);
    setIsProcessing(true);
    setProgress({ current: 0, total: 0 });
    try {
      const pages = await extractPagesWithFullPageOCR(file, (current, total) => setProgress({ current, total }));
      const newRows: ImportRow[] = pages.map((page) => {
        const match = matchReference(page.ocrText, referenceList);
        return {
          id: crypto.randomUUID(),
          pageNumber: page.pageNumber,
          thumbnailDataUrl: page.thumbnailDataUrl,
          reference: match?.reference ?? '',
          matchKind: match ? (match.exact ? 'exact' : 'fuzzy') : 'none',
          checked: Boolean(match),
          quantity: 1,
        };
      });
      setRows(newRows);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Impossible d'analyser ce PDF.");
    } finally {
      setIsProcessing(false);
    }
  };

  const updateRow = (id: string, fields: Partial<ImportRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...fields } : r)));
  };

  const matchedCount = rows.filter((r) => r.checked && catalogItems.some((i) => i.reference === r.reference.trim())).length;

  const handleGenerate = async () => {
    if (!selectedStore) {
      alert('Sélectionne un magasin avant de générer le PDF.');
      return;
    }

    // Les étiquettes ne sont assignées au magasin que pour cette génération
    // ponctuelle (page de garde + historique) : rien n'est écrit dans le
    // catalogue (voir updateItem/assignStoresToItems, jamais appelés ici).
    const itemsToPrint: LabelItem[] = [];
    for (const row of rows) {
      if (!row.checked || row.quantity <= 0) continue;
      const matchedItem = catalogItems.find((i) => i.reference === row.reference.trim());
      if (!matchedItem) continue;
      itemsToPrint.push({ ...matchedItem, quantity: row.quantity, stores: [selectedStore.id] });
    }
    if (itemsToPrint.length === 0) {
      alert('Aucune référence valide sélectionnée.');
      return;
    }

    setIsGenerating(true);
    try {
      const { missingLabels, noCropMarksLabels, summary } = await generatePrinterPDF(itemsToPrint, stores, itemType);
      await logRun(summary);
      if (missingLabels.length > 0) {
        alert(
          `Le PDF a été généré, mais l'image de ${missingLabels.length} référence(s) était introuvable et a été omise : ${missingLabels.join(', ')}`
        );
      }
      if (noCropMarksLabels.length > 0) {
        alert(
          `Attention : le PDF vectoriel (avec traits de coupe) était introuvable pour ${noCropMarksLabels.length} référence(s), imprimée(s) à partir de l'image JPEG sans traits de coupe : ${noCropMarksLabels.join(', ')}`
        );
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Impossible de générer le PDF.');
    } finally {
      setIsGenerating(false);
    }
  };

  const datalistId = `pdf-import-refs-${itemType}`;

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <FileUp size={24} className="text-slate-700" />
          Importer un ancien PDF
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Charge un PDF déjà imprimé (même ancien) pour retrouver automatiquement ses références dans le
          catalogue actuel, affecter le résultat à un magasin et régénérer le PDF — à vérifier et corriger
          au besoin, la reconnaissance n'étant jamais garantie à 100 %.
        </p>
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">
              Catalogue
            </span>
            <select
              value={itemType}
              onChange={(e) => {
                setItemType(e.target.value as PrintableKind);
                setRows([]);
              }}
              className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              {(Object.keys(CATALOG_LABELS) as PrintableKind[]).map((kind) => (
                <option key={kind} value={kind}>
                  {CATALOG_LABELS[kind]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Store size={14} />
              Magasin
            </span>
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="w-64 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              <option value="">Sélectionner un magasin...</option>
              {sortedStores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-300 text-white px-4 py-2 rounded-lg transition text-sm font-semibold"
          >
            {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
            Choisir un PDF...
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          />

          {fileName && !isProcessing && <span className="text-xs text-gray-400">{fileName}</span>}
        </div>

        {isProcessing && (
          <p className="text-sm text-gray-500 flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            Analyse des pages en cours... {progress.current}/{progress.total || '?'}
          </p>
        )}
      </div>

      {rows.length > 0 && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-800">
              {rows.length} page(s) analysée(s) — vérifie les références avant de générer
            </h2>
            <button
              onClick={handleGenerate}
              disabled={isGenerating || matchedCount === 0}
              className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-200 text-white px-4 py-2 rounded-lg transition text-sm font-semibold"
            >
              {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
              Générer le PDF ({matchedCount})
            </button>
          </div>

          <datalist id={datalistId}>
            {catalogItems.map((item) => (
              <option key={item.id} value={item.reference} />
            ))}
          </datalist>

          <div className="border border-gray-100 rounded-lg overflow-hidden divide-y divide-gray-50">
            {rows.map((row) => {
              const isValid = catalogItems.some((i) => i.reference === row.reference.trim());
              return (
                <div key={row.id} className="flex items-center gap-3 px-4 py-2">
                  <input
                    type="checkbox"
                    checked={row.checked}
                    onChange={(e) => updateRow(row.id, { checked: e.target.checked })}
                    className="rounded text-orange-500 focus:ring-orange-400 h-3.5 w-3.5 flex-shrink-0"
                  />
                  <img
                    src={row.thumbnailDataUrl}
                    alt={`Page ${row.pageNumber}`}
                    className="w-10 h-14 object-cover border border-gray-200 rounded flex-shrink-0"
                  />
                  <span className="text-[11px] text-gray-400 w-10 flex-shrink-0">p.{row.pageNumber}</span>
                  <input
                    type="text"
                    list={datalistId}
                    value={row.reference}
                    onChange={(e) => updateRow(row.id, { reference: e.target.value })}
                    placeholder="Référence..."
                    className={`flex-1 min-w-0 font-mono text-sm border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-orange-500 ${
                      isValid ? 'border-gray-200' : 'border-amber-300 bg-amber-50'
                    }`}
                  />
                  {!isValid && (
                    <span className="flex items-center gap-1 text-[11px] text-amber-600 flex-shrink-0">
                      <AlertTriangle size={12} />
                      {row.matchKind === 'none' ? 'non reconnue' : 'à confirmer'}
                    </span>
                  )}
                  {isValid && row.matchKind === 'fuzzy' && (
                    <span className="text-[11px] text-orange-500 flex-shrink-0">suggestion</span>
                  )}
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={3}
                    value={row.quantity}
                    onChange={(e) => {
                      const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 3);
                      updateRow(row.id, { quantity: digitsOnly === '' ? 0 : Number(digitsOnly) });
                    }}
                    className="w-14 flex-shrink-0 text-center bg-white border border-gray-200 rounded px-1.5 py-1 text-xs font-semibold text-gray-700 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-gray-400">
            La reconnaissance se base sur une lecture optique (OCR) de chaque page : corrige les références
            marquées avant de générer, au besoin via la liste déroulante du champ.
          </p>
        </div>
      )}
    </div>
  );
};
