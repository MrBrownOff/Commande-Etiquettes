// src/components/ProjectView.tsx
import React, { useRef, useState } from 'react';
import { useAppStore } from '../store/store';
import { Save, Download, Upload, CheckCircle2, Printer, Loader2, Flag } from 'lucide-react';
import { generateExports } from '../utils/export';
import { generatePrinterPDF } from '../utils/printerExport';
import { PrintHistoryList } from './PrintHistoryList';

export const ProjectView: React.FC = () => {
  const {
    labels,
    proPack,
    stores,
    printHistory,
    proPackPrintHistory,
    exportProject,
    importProject,
    logPrintRun,
    logProPackPrintRun,
  } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isGeneratingProPackPDF, setIsGeneratingProPackPDF] = useState(false);

  const labelsWithQuantity = labels.filter((l) => (l.quantity ?? 0) > 0);
  const totalToPrint = labelsWithQuantity.reduce((sum, l) => sum + (l.quantity ?? 0), 0);
  const proPackWithQuantity = proPack.filter((f) => (f.quantity ?? 0) > 0);
  const totalProPackToPrint = proPackWithQuantity.reduce((sum, f) => sum + (f.quantity ?? 0), 0);

  // Import de la sauvegarde JSON
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        importProject(json);
        setStatusMessage('Projet restauré avec succès !');
        setTimeout(() => setStatusMessage(null), 4000);
      } catch (err) {
        alert('Fichier JSON de sauvegarde invalide.');
      }
    };
    reader.readAsText(file);
  };

  // Génération du PDF prêt pour l'imprimeur (page de garde + étiquettes en quantité)
  const handleGeneratePrinterPDF = async () => {
    setIsGeneratingPDF(true);
    try {
      const { missingLabels, summary } = await generatePrinterPDF(labels, stores, 'labels');
      await logPrintRun(summary);
      if (missingLabels.length > 0) {
        alert(
          `Le PDF a été généré, mais l'image de ${missingLabels.length} étiquette(s) était introuvable et a été omise : ${missingLabels.join(', ')}`
        );
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Impossible de générer le PDF.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Génération du PDF prêt pour l'imprimeur pour le Pro-Pack (indépendant des étiquettes)
  const handleGenerateProPackPrinterPDF = async () => {
    setIsGeneratingProPackPDF(true);
    try {
      const { missingLabels, summary } = await generatePrinterPDF(proPack, stores, 'propack');
      await logProPackPrintRun(summary);
      if (missingLabels.length > 0) {
        alert(
          `Le PDF a été généré, mais l'image de ${missingLabels.length} Pro-Pack était introuvable et a été omise : ${missingLabels.join(', ')}`
        );
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Impossible de générer le PDF.');
    } finally {
      setIsGeneratingProPackPDF(false);
    }
  };

  // Export CSV final d'affectation
  const handleExportCSV = () => {
    const { csvUrl } = generateExports(labels, stores);
    const link = document.createElement('a');
    link.href = csvUrl;
    link.download = `affectations_magasins_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const handleExportProPackCSV = () => {
    const { csvUrl } = generateExports(proPack, stores);
    const link = document.createElement('a');
    link.href = csvUrl;
    link.download = `affectations_magasins_pro-pack_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Save className="text-orange-500" size={28} />
          Sauvegarde & Exports
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Sauvegardez l'état complet de votre travail en JSON ou gérez vos exports CSV.
        </p>
      </div>

      {statusMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl flex items-center gap-2 text-sm font-medium">
          <CheckCircle2 size={18} className="text-emerald-600" />
          {statusMessage}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Sauvegarde JSON */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <Download size={18} className="text-orange-500" /> Sauvegarde (.JSON)
          </h2>
          <p className="text-xs text-gray-500">
            Télécharge un fichier JSON contenant la liste exacte de vos étiquettes, Pro-Pack et magasins pour reprendre votre travail plus tard sans rien perdre.
          </p>
          <button
            onClick={exportProject}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-2.5 rounded-lg text-sm transition flex items-center justify-center gap-2"
          >
            <Download size={16} /> Exporter le projet (.JSON)
          </button>
        </div>

        {/* Restauration JSON */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <Upload size={18} className="text-orange-500" /> Restauration (.JSON)
          </h2>
          <p className="text-xs text-gray-500">
            Chargez un fichier `.json` précédemment exporté pour restaurer votre projet.
          </p>
          <input
            type="file"
            accept=".json,application/json"
            ref={fileInputRef}
            onChange={handleImportJSON}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full border border-gray-200 hover:border-orange-400 hover:bg-orange-50/30 text-gray-700 font-medium py-2.5 rounded-lg text-sm transition flex items-center justify-center gap-2"
          >
            <Upload size={16} className="text-orange-500" /> Importer un projet (.JSON)
          </button>
        </div>
      </div>

      {/* Export métier final — Étiquettes */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
          <Download size={18} className="text-emerald-600" /> Export final des affectations — Étiquettes (CSV)
        </h2>
        <p className="text-xs text-gray-500">
          Générez le fichier CSV d'affectation final des étiquettes, prêt pour l'analyse sur Excel ou votre ERP.
        </p>
        <button
          onClick={handleExportCSV}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-5 py-2.5 rounded-lg text-sm transition flex items-center gap-2"
        >
          <Download size={16} /> Générer le fichier CSV d'affectations
        </button>
      </div>

      {/* Bon de commande PDF pour l'imprimeur — Étiquettes */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
          <Printer size={18} className="text-slate-700" /> Bon d'impression — Étiquettes (PDF)
        </h2>
        <p className="text-xs text-gray-500">
          Génère un PDF prêt pour l'imprimeur : une page de garde récapitulant le nombre total d'étiquettes
          et les magasins concernés, suivie des étiquettes en autant d'exemplaires que la quantité renseignée.
        </p>
        <p className="text-xs font-medium text-gray-600">
          {labelsWithQuantity.length === 0
            ? 'Aucune quantité renseignée pour le moment.'
            : `${labelsWithQuantity.length} référence(s), ${totalToPrint} étiquette(s) à imprimer.`}
        </p>
        <button
          onClick={handleGeneratePrinterPDF}
          disabled={isGeneratingPDF || labelsWithQuantity.length === 0}
          className="bg-slate-900 hover:bg-slate-800 disabled:bg-gray-200 text-white font-medium px-5 py-2.5 rounded-lg text-sm transition flex items-center gap-2"
        >
          {isGeneratingPDF ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
          {isGeneratingPDF ? 'Génération en cours...' : "Générer le PDF pour l'imprimeur"}
        </button>
      </div>

      <PrintHistoryList entries={printHistory} />

      <div className="pt-4 border-t border-gray-200">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <Flag className="text-orange-500" size={22} />
          Pro-Pack
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Catalogue indépendant des étiquettes : sa propre sauvegarde, son propre bon d'impression et son propre historique.
        </p>
      </div>

      {/* Export métier final — Pro-Pack */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
          <Download size={18} className="text-emerald-600" /> Export final des affectations — Pro-Pack (CSV)
        </h2>
        <p className="text-xs text-gray-500">
          Générez le fichier CSV d'affectation final du Pro-Pack, prêt pour l'analyse sur Excel ou votre ERP.
        </p>
        <button
          onClick={handleExportProPackCSV}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-5 py-2.5 rounded-lg text-sm transition flex items-center gap-2"
        >
          <Download size={16} /> Générer le fichier CSV d'affectations
        </button>
      </div>

      {/* Bon de commande PDF pour l'imprimeur — Pro-Pack */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
          <Printer size={18} className="text-slate-700" /> Bon d'impression — Pro-Pack (PDF)
        </h2>
        <p className="text-xs text-gray-500">
          Génère un PDF prêt pour l'imprimeur : une page de garde récapitulant le nombre total de Pro-Pack
          et les magasins concernés, suivie des Pro-Pack en autant d'exemplaires que la quantité renseignée.
        </p>
        <p className="text-xs font-medium text-gray-600">
          {proPackWithQuantity.length === 0
            ? 'Aucune quantité renseignée pour le moment.'
            : `${proPackWithQuantity.length} référence(s), ${totalProPackToPrint} Pro-Pack à imprimer.`}
        </p>
        <button
          onClick={handleGenerateProPackPrinterPDF}
          disabled={isGeneratingProPackPDF || proPackWithQuantity.length === 0}
          className="bg-slate-900 hover:bg-slate-800 disabled:bg-gray-200 text-white font-medium px-5 py-2.5 rounded-lg text-sm transition flex items-center gap-2"
        >
          {isGeneratingProPackPDF ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
          {isGeneratingProPackPDF ? 'Génération en cours...' : "Générer le PDF pour l'imprimeur"}
        </button>
      </div>

      <PrintHistoryList entries={proPackPrintHistory} noun="Pro-Pack" />
    </div>
  );
};
