import jsPDF from 'jspdf';
import { LabelItem, StoreItem } from '../store/store';

// Candidats à essayer dans l'ordre : les URL blob issues d'un import de fichiers ne
// survivent pas à un rechargement de page ou à une restauration de projet JSON — dans
// ce cas on doit se rabattre sur le fichier statique nommé d'après la référence.
const getLabelImageCandidates = (label: LabelItem): string[] => {
  const candidates = [label.thumbnailUrl, label.imageUrl];
  candidates.push(`${import.meta.env.BASE_URL}labels/${label.reference}.jpg`);
  candidates.push(`${import.meta.env.BASE_URL}${label.reference}.jpg`);
  return Array.from(new Set(candidates.filter((src): src is string => Boolean(src))));
};

// Récupère l'image telle quelle (octets d'origine, sans passer par un <canvas>) pour éviter
// toute recompression JPEG et tout écart de couleur induits par un aller-retour de rendu.
const loadImage = async (src: string): Promise<{ dataUrl: string; width: number; height: number }> => {
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`Impossible de charger l'image de l'étiquette : ${src}`);
  }
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Lecture du fichier échouée'));
    reader.readAsDataURL(blob);
  });
  return { dataUrl, width: bitmap.width, height: bitmap.height };
};

// Essaie chaque source candidate dans l'ordre jusqu'à ce qu'une image se charge réellement.
const loadImageWithFallback = async (label: LabelItem) => {
  for (const src of getLabelImageCandidates(label)) {
    try {
      return await loadImage(src);
    } catch {
      // on essaie la source suivante
    }
  }
  return null;
};

// Taille d'impression cible d'une étiquette (format le plus courant : 2 x 3,25 po).
// Les étiquettes ne sont plus étirées pour remplir la page — leur image est simplement
// contenue dans ce format, ce qui garantit une résolution d'impression élevée
// (les fichiers sources, ~900x1275px, y impriment autour de 400+ DPI).
const LABEL_WIDTH_MM = 2 * 25.4;
const LABEL_HEIGHT_MM = 3.25 * 25.4;

// Génère un PDF prêt pour l'imprimeur : une page de garde récapitulative,
// suivie d'une page par exemplaire commandé de chaque étiquette.
export const generatePrinterPDF = async (labels: LabelItem[], stores: StoreItem[]) => {
  const orderedLabels = labels.filter((l) => (l.quantity ?? 0) > 0);
  if (orderedLabels.length === 0) {
    throw new Error("Aucune étiquette n'a de quantité renseignée.");
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const total = orderedLabels.reduce((sum, l) => sum + (l.quantity ?? 0), 0);

  const storeNames = Array.from(
    new Set(
      orderedLabels
        .flatMap((label) => label.stores.map((id) => stores.find((s) => s.id === id)?.name))
        .filter((name): name is string => Boolean(name))
    )
  ).sort();

  // Page de garde — simple récapitulatif : nombre d'étiquettes et magasins concernés
  doc.setFontSize(18);
  doc.text('Bon de commande — Étiquettes', margin, margin + 5);
  doc.setFontSize(11);
  doc.text(
    `Généré le ${new Date().toLocaleDateString('fr-CA')} — ${orderedLabels.length} référence(s), ${total} étiquette(s) au total`,
    margin,
    margin + 15
  );

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Magasin(s) concerné(s) :', margin, margin + 28);
  doc.setFont('helvetica', 'normal');

  const contentTop = margin + 36;
  const contentBottom = pageHeight - margin;
  const availableHeight = contentBottom - contentTop;

  // Bascule automatiquement sur plusieurs colonnes si la liste de magasins est longue
  const columns = storeNames.length > Math.floor(availableHeight / 7) ? 2 : 1;
  const rowsPerColumn = Math.ceil(storeNames.length / columns) || 1;
  const rowHeight = Math.min(8, Math.max(5, availableHeight / rowsPerColumn));
  const colWidth = (pageWidth - margin * 2) / columns;

  doc.setFontSize(12);
  if (storeNames.length === 0) {
    doc.text('Aucun magasin assigné.', margin, contentTop);
  } else {
    for (let col = 0; col < columns; col++) {
      const colX = margin + col * colWidth;
      let y = contentTop;
      const colNames = storeNames.slice(col * rowsPerColumn, (col + 1) * rowsPerColumn);
      for (const name of colNames) {
        doc.text(`•  ${name}`, colX, y);
        y += rowHeight;
      }
    }
  }

  // Pages d'étiquettes : une page par exemplaire commandé, sans légende superflue
  const missingLabels: string[] = [];
  for (const label of orderedLabels) {
    const qty = label.quantity ?? 0;
    const image = await loadImageWithFallback(label);
    if (!image) {
      missingLabels.push(label.reference);
      continue;
    }

    // L'image est contenue dans le format cible et centrée sur la page.
    const ratio = Math.min(LABEL_WIDTH_MM / image.width, LABEL_HEIGHT_MM / image.height);
    const w = image.width * ratio;
    const h = image.height * ratio;
    const x = (pageWidth - w) / 2;
    const imgY = (pageHeight - h) / 2;

    for (let i = 0; i < qty; i++) {
      doc.addPage();
      doc.addImage(image.dataUrl, 'JPEG', x, imgY, w, h);
    }
  }

  doc.save(`commande_impression_etiquettes_${new Date().toISOString().slice(0, 10)}.pdf`);

  return {
    missingLabels,
    summary: {
      totalReferences: orderedLabels.length,
      totalQuantity: total,
      storeNames,
      items: orderedLabels.map((label) => ({
        reference: label.reference,
        quantity: label.quantity ?? 0,
        storeNames: label.stores
          .map((id) => stores.find((s) => s.id === id)?.name)
          .filter((name): name is string => Boolean(name)),
      })),
    },
  };
};
