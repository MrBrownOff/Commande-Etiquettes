import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib';
import { LabelItem, StoreItem } from '../store/store';

const PT_PER_MM = 72 / 25.4;
const PAGE_WIDTH = 595.28; // A4 en points (210mm)
const PAGE_HEIGHT = 841.89; // A4 en points (297mm)
const MARGIN_MM = 15;

// Taille d'impression cible d'une étiquette (format le plus courant : 2 x 3,25 po).
// L'étiquette n'est jamais agrandie au-delà de cette taille — elle y est simplement
// contenue, ce qui garantit une résolution d'impression élevée quelle que soit la source.
const LABEL_WIDTH_PT = 2 * 72;
const LABEL_HEIGHT_PT = 3.25 * 72;

// Candidats JPEG à essayer dans l'ordre : les URL blob issues d'un import de fichiers ne
// survivent pas à un rechargement de page ou à une restauration de projet JSON — dans
// ce cas on doit se rabattre sur le fichier statique nommé d'après la référence.
const getLabelImageCandidates = (label: LabelItem): string[] => {
  const candidates = [label.thumbnailUrl, label.imageUrl];
  candidates.push(`${import.meta.env.BASE_URL}labels/${label.reference}.jpg`);
  candidates.push(`${import.meta.env.BASE_URL}${label.reference}.jpg`);
  return Array.from(new Set(candidates.filter((src): src is string => Boolean(src))));
};

const getLabelPdfCandidate = (label: LabelItem): string =>
  `${import.meta.env.BASE_URL}labels-pdf/${label.reference}.pdf`;

type EmbeddedLabel =
  | { kind: 'pdf'; source: Awaited<ReturnType<PDFDocument['embedPdf']>>[number]; width: number; height: number }
  | { kind: 'jpg'; source: Awaited<ReturnType<PDFDocument['embedJpg']>>; width: number; height: number };

// Essaie d'abord la version PDF vectorielle de l'étiquette (qualité et couleurs fidèles
// à l'original, indépendamment de la résolution), puis se rabat sur le JPEG si aucun PDF
// n'existe pour cette référence.
const embedLabel = async (pdfDoc: PDFDocument, label: LabelItem): Promise<EmbeddedLabel | null> => {
  try {
    const res = await fetch(getLabelPdfCandidate(label));
    if (res.ok) {
      const bytes = await res.arrayBuffer();
      const srcDoc = await PDFDocument.load(bytes);
      if (srcDoc.getPageCount() > 0) {
        const [embedded] = await pdfDoc.embedPdf(srcDoc, [0]);
        return { kind: 'pdf', source: embedded, width: embedded.width, height: embedded.height };
      }
    }
  } catch {
    // Pas de PDF exploitable pour cette référence : on se rabat sur le JPEG.
  }

  for (const src of getLabelImageCandidates(label)) {
    try {
      const res = await fetch(src);
      if (!res.ok) continue;
      const bytes = await res.arrayBuffer();
      const image = await pdfDoc.embedJpg(bytes);
      return { kind: 'jpg', source: image, width: image.width, height: image.height };
    } catch {
      // on essaie la source suivante
    }
  }

  return null;
};

// Génère un PDF prêt pour l'imprimeur : une page de garde récapitulative,
// suivie d'une page par exemplaire commandé de chaque étiquette.
export const generatePrinterPDF = async (labels: LabelItem[], stores: StoreItem[]) => {
  const orderedLabels = labels.filter((l) => (l.quantity ?? 0) > 0);
  if (orderedLabels.length === 0) {
    throw new Error("Aucune étiquette n'a de quantité renseignée.");
  }

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);

  const total = orderedLabels.reduce((sum, l) => sum + (l.quantity ?? 0), 0);
  const storeNames = Array.from(
    new Set(
      orderedLabels
        .flatMap((label) => label.stores.map((id) => stores.find((s) => s.id === id)?.name))
        .filter((name): name is string => Boolean(name))
    )
  ).sort();

  // Convertit une distance "depuis le haut de la page" (en mm) vers l'axe Y de pdf-lib
  // (origine en bas de page, en points).
  const yFromTop = (mm: number) => PAGE_HEIGHT - mm * PT_PER_MM;
  const mmToPt = (mm: number) => mm * PT_PER_MM;
  const drawText = (
    page: Awaited<ReturnType<PDFDocument['addPage']>>,
    text: string,
    xMm: number,
    yMmFromTop: number,
    size: number,
    useFont: PDFFont = font
  ) => {
    page.drawText(text, { x: mmToPt(xMm), y: yFromTop(yMmFromTop), size, font: useFont, color: black });
  };

  // Page de garde — simple récapitulatif : nombre d'étiquettes et magasins concernés
  const coverPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawText(coverPage, 'Bon de commande — Étiquettes', MARGIN_MM, MARGIN_MM + 5, 18, fontBold);
  drawText(
    coverPage,
    `Généré le ${new Date().toLocaleDateString('fr-CA')} — ${orderedLabels.length} référence(s), ${total} étiquette(s) au total`,
    MARGIN_MM,
    MARGIN_MM + 15,
    11
  );
  drawText(coverPage, 'Magasin(s) concerné(s) :', MARGIN_MM, MARGIN_MM + 28, 13, fontBold);

  const contentTop = MARGIN_MM + 36;
  const contentBottom = PAGE_HEIGHT / PT_PER_MM - MARGIN_MM;
  const availableHeight = contentBottom - contentTop;

  // Bascule automatiquement sur plusieurs colonnes si la liste de magasins est longue
  const columns = storeNames.length > Math.floor(availableHeight / 7) ? 2 : 1;
  const rowsPerColumn = Math.ceil(storeNames.length / columns) || 1;
  const rowHeight = Math.min(8, Math.max(5, availableHeight / rowsPerColumn));
  const colWidth = (PAGE_WIDTH / PT_PER_MM - MARGIN_MM * 2) / columns;

  if (storeNames.length === 0) {
    drawText(coverPage, 'Aucun magasin assigné.', MARGIN_MM, contentTop, 12);
  } else {
    for (let col = 0; col < columns; col++) {
      const colX = MARGIN_MM + col * colWidth;
      let y = contentTop;
      const colNames = storeNames.slice(col * rowsPerColumn, (col + 1) * rowsPerColumn);
      for (const name of colNames) {
        drawText(coverPage, `•  ${name}`, colX, y, 12);
        y += rowHeight;
      }
    }
  }

  // Pages d'étiquettes : une page par exemplaire commandé, sans légende superflue
  const missingLabels: string[] = [];
  for (const label of orderedLabels) {
    const qty = label.quantity ?? 0;
    const embedded = await embedLabel(pdfDoc, label);
    if (!embedded) {
      missingLabels.push(label.reference);
      continue;
    }

    // L'étiquette est contenue dans le format cible et centrée sur la page.
    const ratio = Math.min(LABEL_WIDTH_PT / embedded.width, LABEL_HEIGHT_PT / embedded.height);
    const w = embedded.width * ratio;
    const h = embedded.height * ratio;
    const x = (PAGE_WIDTH - w) / 2;
    const y = (PAGE_HEIGHT - h) / 2;

    for (let i = 0; i < qty; i++) {
      const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      if (embedded.kind === 'pdf') {
        page.drawPage(embedded.source, { x, y, width: w, height: h });
      } else {
        page.drawImage(embedded.source, { x, y, width: w, height: h });
      }
    }
  }

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `commande_impression_etiquettes_${new Date().toISOString().slice(0, 10)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);

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
