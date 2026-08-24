import React, { useRef, useState, useMemo } from 'react';
import { useAppStore, LabelItem } from '../store/store';
import { Upload, Search, Loader2, CheckSquare, Square, Trash2, Printer, Store, X } from 'lucide-react';
import { StoreAssignPopover } from './StoreAssignPopover';
import { BatchStoreAssignPopover } from './BatchStoreAssignPopover';
import { generatePrinterPDF } from '../utils/printerExport';

export const LabelsView: React.FC = () => {
  const { labels, stores, addLabelsBatch, deleteLabel, clearLabels, updateLabel, logPrintRun } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Chargement direct des images/PDFs par nom de fichier sans OCR
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    // Pas d'URL blob persistée : elle ne survivrait pas à la session en cours.
    // L'image est retrouvée via son nom de fichier dans public/labels/ (voir fallback d'affichage).
    const newLabels: LabelItem[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      reference: file.name.replace(/\.[^/.]+$/, ''), // ex: "BC0361596.jpg" -> "BC0361596"
      filename: file.name,
      name: '',
      banner: '',
      stores: [],
      quantity: 1,
    }));

    await addLabelsBatch(newLabels);
    setIsProcessing(false);

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Vider toutes les étiquettes
  const handleClearLabels = () => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer toutes les étiquettes ?")) {
      clearLabels();
    }
  };

  // Filtrage instantané par référence et/ou par magasin affecté
  const filteredLabels = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return labels.filter((label) => {
      if (storeFilter && !label.stores.includes(storeFilter)) return false;
      if (query && !label.reference.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [labels, searchQuery, storeFilter]);

  const storeFilterName = storeFilter ? stores.find((s) => s.id === storeFilter)?.name : null;

  // Sélection multiple
  const toggleSelectAll = () => {
    if (selectedLabelIds.length === filteredLabels.length) {
      setSelectedLabelIds([]);
    } else {
      setSelectedLabelIds(filteredLabels.map((l) => l.id));
    }
  };

  const toggleSelectLabel = (id: string) => {
    setSelectedLabelIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Génère le PDF imprimeur pour uniquement les étiquettes cochées,
  // sans tenir compte des quantités des étiquettes non sélectionnées.
  const handleGenerateSelectionPDF = async () => {
    const selectedLabels = labels.filter((l) => selectedLabelIds.includes(l.id));
    setIsGeneratingPDF(true);
    try {
      const { missingLabels, summary } = await generatePrinterPDF(selectedLabels, stores);
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

  return (
    <div className="flex-1 flex flex-col overflow-hidden h-full">
      <input
        type="file"
        accept="image/*,application/pdf"
        multiple
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Header */}
      <header className="h-16 bg-white border-b flex items-center justify-between px-6 shadow-xs flex-shrink-0 gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Recherche instantanée par référence..."
              className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 transition text-sm"
            />
          </div>

          <div className="relative">
            <Store className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <select
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
              className="pl-9 pr-8 py-2 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 transition text-sm appearance-none max-w-[220px]"
            >
              <option value="">Tous les magasins</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>

          {storeFilterName && (
            <span className="flex items-center gap-1.5 bg-orange-50 text-orange-700 text-xs font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap">
              {filteredLabels.length} étiquette(s) pour « {storeFilterName} »
              <button onClick={() => setStoreFilter('')} className="hover:text-orange-900" title="Retirer le filtre">
                <X size={13} />
              </button>
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {labels.length > 0 && (
            <button
              onClick={handleClearLabels}
              className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-lg transition text-xs font-semibold"
            >
              <Trash2 size={15} /> Vider les étiquettes
            </button>
          )}

          <button
            onClick={handleUploadClick}
            disabled={isProcessing}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white px-4 py-2 rounded-lg transition shadow-sm font-medium text-sm"
          >
            {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
            {isProcessing ? 'Traitement en cours...' : 'Importer des étiquettes'}
          </button>
        </div>
      </header>

      {/* Workspace */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Statistiques rapides */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl shadow-xs border border-gray-100">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Total Étiquettes</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{labels.length}</p>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-xs border border-gray-100">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Magasins Actifs</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{stores.length}</p>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-xs border border-gray-100">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Affectées</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">
              {labels.filter((l) => l.stores.length > 0).length}
            </p>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-xs border border-gray-100">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Non Affectées</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">
              {labels.filter((l) => l.stores.length === 0).length}
            </p>
          </div>
        </div>

        {/* Overlay de chargement */}
        {isProcessing && (
          <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-8 flex flex-col items-center justify-center text-gray-500">
            <Loader2 size={40} className="mb-3 text-orange-500 animate-spin" />
            <p className="text-base font-medium text-gray-700">Importation des étiquettes en cours...</p>
          </div>
        )}

        {/* Barre d'actions multiples */}
        {labels.length > 0 && (
          <div className="bg-white p-4 rounded-xl shadow-xs border border-gray-100 flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-orange-600 transition"
              >
                {selectedLabelIds.length === filteredLabels.length && filteredLabels.length > 0 ? (
                  <CheckSquare size={18} className="text-orange-500" />
                ) : (
                  <Square size={18} className="text-gray-400" />
                )}
                Tout sélectionner ({selectedLabelIds.length}/{filteredLabels.length})
              </button>
            </div>

            {/* Affectation en masse + impression de la sélection */}
            <div className="flex items-center gap-2">
              <BatchStoreAssignPopover selectedLabelIds={selectedLabelIds} />
              <button
                onClick={handleGenerateSelectionPDF}
                disabled={selectedLabelIds.length === 0 || isGeneratingPDF}
                className="bg-slate-900 hover:bg-slate-800 disabled:bg-gray-200 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition shadow-xs whitespace-nowrap flex items-center gap-1.5"
              >
                {isGeneratingPDF ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
                Générer le PDF (sélection)
              </button>
            </div>
          </div>
        )}

        {/* Grille des étiquettes ou Zone d'import vide */}
        {labels.length === 0 && !isProcessing ? (
          <div
            onClick={handleUploadClick}
            className="bg-white rounded-xl shadow-xs border border-gray-200 p-16 flex flex-col items-center justify-center text-gray-400 border-dashed cursor-pointer hover:border-orange-400 hover:bg-orange-50/20 transition group"
          >
            <div className="p-4 rounded-full bg-orange-50 text-orange-500 mb-4 group-hover:scale-110 transition duration-300">
              <Upload size={32} />
            </div>
            <p className="text-lg font-semibold text-gray-700">Glissez-déposez vos étiquettes (JPG/PNG) ou PDF ici</p>
            <p className="text-sm text-gray-400 mt-1">Cliquez pour parcourir (Nom de fichier = Référence automatique)</p>
          </div>
        ) : filteredLabels.length === 0 ? (
          <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-16 flex flex-col items-center justify-center text-gray-400">
            <Store size={32} className="mb-3 text-gray-300" />
            <p className="text-base font-medium text-gray-600">
              {storeFilterName
                ? `Aucune étiquette affectée à « ${storeFilterName} ».`
                : 'Aucune étiquette ne correspond à cette recherche.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredLabels.map((label) => {
              const isSelected = selectedLabelIds.includes(label.id);
              const initialImageSrc = label.thumbnailUrl || label.imageUrl || `${import.meta.env.BASE_URL}labels/${label.reference}.jpg`;

              return (
                <div
                  key={label.id}
                  className={`bg-white rounded-xl border transition shadow-xs flex flex-col overflow-hidden ${isSelected ? 'border-orange-500 ring-2 ring-orange-500/20' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  {/* Visuel complet de l'étiquette */}
                  <div className="relative bg-slate-100 p-2 flex items-center justify-center border-b border-gray-100 h-48">
                    {/* Checkbox de sélection - BIEN VISIBLE & CONTRASTÉE */}
                    <button
                      onClick={() => toggleSelectLabel(label.id)}
                      className={`absolute top-2.5 left-2.5 z-10 p-1 rounded-md bg-white shadow-md border transition-all ${isSelected
                          ? 'border-orange-500 text-orange-500 bg-orange-50'
                          : 'border-gray-300 text-gray-500 hover:border-orange-500 hover:text-orange-500'
                        }`}
                      title={isSelected ? "Désélectionner" : "Sélectionner"}
                    >
                      {isSelected ? (
                        <CheckSquare size={20} className="text-orange-500" />
                      ) : (
                        <Square size={20} />
                      )}
                    </button>

                    {/* Image de l'étiquette avec fallback automatique */}
                    <img
                      src={initialImageSrc}
                      alt={label.reference}
                      onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                        const target = e.currentTarget;
                        if (!target.dataset['triedLabels']) {
                          target.dataset['triedLabels'] = 'true';
                          target.src = `${import.meta.env.BASE_URL}labels/${label.reference}.jpg`;
                        } else if (!target.dataset['triedRoot']) {
                          target.dataset['triedRoot'] = 'true';
                          target.src = `${import.meta.env.BASE_URL}${label.reference}.jpg`;
                        }
                      }}
                      className="h-full w-full object-contain rounded bg-white p-1 shadow-xs border border-gray-200"
                    />
                  </div>

                  {/* Corps de carte : Référence modifiable */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Référence produit</label>
                        <input
                          type="text"
                          value={label.reference}
                          onChange={(e) => updateLabel(label.id, { reference: e.target.value })}
                          className="w-full font-mono font-bold text-gray-800 bg-gray-50 border border-gray-200 rounded px-2.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition"
                          placeholder="Référence..."
                        />
                      </div>
                      <div className="w-16">
                        <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Qté</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={2}
                          value={label.quantity ?? 1}
                          onChange={(e) => {
                            const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 2);
                            updateLabel(label.id, { quantity: digitsOnly === '' ? 1 : Number(digitsOnly) });
                          }}
                          placeholder="1"
                          className="w-full text-center font-mono font-bold text-gray-800 bg-gray-50 border border-gray-200 rounded px-2.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition"
                        />
                      </div>
                    </div>

                    {/* Magasins affectés sous forme de Badges */}
                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Magasins assignés</p>
                      <div className="flex flex-wrap gap-1 min-h-[28px] items-center">
                        {label.stores.length === 0 ? (
                          <span className="text-xs text-gray-400 italic">Aucun magasin</span>
                        ) : (
                          label.stores.map((storeId) => {
                            const storeObj = stores.find((s) => s.id === storeId);
                            if (!storeObj) return null;
                            return (
                              <span
                                key={storeId}
                                className="inline-flex items-center gap-1 bg-orange-50 text-orange-700 text-xs px-2 py-0.5 rounded-full font-medium border border-orange-100"
                              >
                                {storeObj.name}
                                <button
                                  onClick={() => updateLabel(label.id, { stores: label.stores.filter((id) => id !== storeId) })}
                                  className="hover:text-red-600 transition ml-0.5"
                                >
                                  &times;
                                </button>
                              </span>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Actions rapides par carte */}
                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                      <StoreAssignPopover
                        labelId={label.id}
                        assignedStoreIds={label.stores}
                      />

                      <button
                        onClick={() => deleteLabel(label.id)}
                        className="text-gray-400 hover:text-red-500 transition p-1"
                        title="Supprimer l'étiquette"
                      >
                        <Trash2 size={16} />
                      </button>
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