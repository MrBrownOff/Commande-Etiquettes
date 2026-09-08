import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib';
import { LabelItem, StoreItem } from '../store/store';

const PT_PER_MM = 72 / 25.4;
const PAGE_WIDTH = 595.28; // A4 en points (210mm)
const PAGE_HEIGHT = 841.89; // A4 en points (297mm)
const MARGIN_MM = 15;

export type PrintableKind = 'labels' | 'fanions';

// Chaque catégorie a son propre dossier d'assets et son propre format d'impression
// cible : l'item n'est jamais agrandi au-delà de cette taille — il y est simplement
// contenu, ce qui garantit une résolution d'impression élevée quelle que soit la source.
const KIND_CONFIG: Record<
  PrintableKind,
  { pdfFolder: string; imgFolder: string; widthIn: number; heightIn: number; coverTitle: string; fileSlug: string; noun: string }
> = {
  labels: {
    pdfFolder: 'labels-pdf',
    imgFolder: 'labels',
    widthIn: 2,
    heightIn: 3.25,
    coverTitle: 'Bon de commande — Étiquettes',
    fileSlug: 'etiquettes',
    noun: 'étiquette',
  },
  fanions: {
    pdfFolder: 'fanions-pdf',
    imgFolder: 'fanions',
    widthIn: 8.5,
    heightIn: 3.25,
    coverTitle: 'Bon de commande — Fanions',
    fileSlug: 'fanions',
    noun: 'fanion',
  },
};

// Candidats JPEG à essayer dans l'ordre : les URL blob issues d'un import de fichiers ne
// survivent pas à un rechargement de page ou à une restauration de projet JSON — dans
// ce cas on doit se rabattre sur le fichier statique nommé d'après la référence.
const getItemImageCandidates = (item: LabelItem, imgFolder: string): string[] => {
  const candidates = [item.thumbnailUrl, item.imageUrl];
  candidates.push(`${import.meta.env.BASE_URL}${imgFolder}/${item.reference}.jpg`);
  candidates.push(`${import.meta.env.BASE_URL}${item.reference}.jpg`);
  return Array.from(new Set(candidates.filter((src): src is string => Boolean(src))));
};

const getItemPdfCandidate = (item: LabelItem, pdfFolder: string): string =>
  `${import.meta.env.BASE_URL}${pdfFolder}/${item.reference}.pdf`;

type TrimBox = { x: number; y: number; width: number; height: number };

type EmbeddedItem =
  | {
      kind: 'pdf';
      source: Awaited<ReturnType<PDFDocument['embedPdf']>>[number];
      width: number;
      height: number;
      // Zone de coupe réelle de l'item à l'intérieur de la page source
      // (peut être plus petite que la page si celle-ci inclut une marge de
      // fond perdu et des traits de coupe pour l'imprimerie). Absent = la
      // page entière fait office de zone de coupe.
      trimBox?: TrimBox;
    }
  | { kind: 'jpg'; source: Awaited<ReturnType<PDFDocument['embedJpg']>>; width: number; height: number };

// Essaie d'abord la version PDF vectorielle de l'item (qualité et couleurs fidèles
// à l'original, indépendamment de la résolution), puis se rabat sur le JPEG si aucun PDF
// n'existe pour cette référence.
const embedItem = async (
  pdfDoc: PDFDocument,
  item: LabelItem,
  pdfFolder: string,
  imgFolder: string
): Promise<EmbeddedItem | null> => {
  try {
    const res = await fetch(getItemPdfCandidate(item, pdfFolder));
    if (res.ok) {
      const bytes = await res.arrayBuffer();
      const srcDoc = await PDFDocument.load(bytes);
      if (srcDoc.getPageCount() > 0) {
        const srcPage = srcDoc.getPage(0);
        // La page source contient une marge de fond perdu et des traits de
        // coupe pour l'imprimerie : sa MediaBox est plus grande que la taille
        // réelle de l'item une fois coupé, définie par sa TrimBox. On intègre
        // la page complète (marge + traits de coupe conservés pour le
        // massicot), mais le ratio d'ajustement et le centrage plus bas se
        // basent sur la TrimBox pour que la zone de coupe finale fasse
        // exactement la taille cible, peu importe la taille de la marge autour.
        const [embedded] = await pdfDoc.embedPdf(srcDoc, [0]);
        const tb = srcPage.getTrimBox();
        return {
          kind: 'pdf',
          source: embedded,
          width: embedded.width,
          height: embedded.height,
          trimBox: { x: tb.x, y: tb.y, width: tb.width, height: tb.height },
        };
      }
    }
  } catch {
    // Pas de PDF exploitable pour cette référence : on se rabat sur le JPEG.
  }

  for (const src of getItemImageCandidates(item, imgFolder)) {
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
// suivie d'une page par exemplaire commandé de chaque item (étiquette ou fanion).
export const generatePrinterPDF = async (items: LabelItem[], stores: StoreItem[], kind: PrintableKind = 'labels') => {
  const config = KIND_CONFIG[kind];
  const itemWidthPt = config.widthIn * 72;
  const itemHeightPt = config.heightIn * 72;

  const orderedItems = items.filter((l) => (l.quantity ?? 0) > 0);
  if (orderedItems.length === 0) {
    throw new Error(`Aucun${kind === 'fanions' ? '' : 'e'} ${config.noun} n'a de quantité renseignée.`);
  }

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);

  const total = orderedItems.reduce((sum, l) => sum + (l.quantity ?? 0), 0);
  const storeNames = Array.from(
    new Set(
      orderedItems
        .flatMap((item) => item.stores.map((id) => stores.find((s) => s.id === id)?.name))
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

  // Page de garde — simple récapitulatif : nombre d'items et magasins concernés
  const coverPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawText(coverPage, config.coverTitle, MARGIN_MM, MARGIN_MM + 5, 18, fontBold);
  drawText(
    coverPage,
    `Généré le ${new Date().toLocaleDateString('fr-CA')} — ${orderedItems.length} référence(s), ${total} ${config.noun}(s) au total`,
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

  // Pages d'items : une page par exemplaire commandé, sans légende superflue
  const missingItems: string[] = [];
  for (const item of orderedItems) {
    const qty = item.quantity ?? 0;
    const embedded = await embedItem(pdfDoc, item, config.pdfFolder, config.imgFolder);
    if (!embedded) {
      missingItems.push(item.reference);
      continue;
    }

    // Le ratio d'ajustement se base sur la TrimBox (la taille réelle une fois
    // coupée) quand elle est disponible, pas sur la page entière — sinon la
    // marge de fond perdu serait comptée dans le calcul et l'item rétrécirait
    // en trop. Repli sur les dimensions de la page si l'item (PDF ou JPEG)
    // n'a pas de TrimBox distincte.
    const trimBox = embedded.kind === 'pdf' ? embedded.trimBox : undefined;
    const refWidth = trimBox?.width ?? embedded.width;
    const refHeight = trimBox?.height ?? embedded.height;
    const ratio = Math.min(itemWidthPt / refWidth, itemHeightPt / refHeight);
    const w = embedded.width * ratio;
    const h = embedded.height * ratio;

    // On centre la TrimBox sur la page (pas le coin de la page entière),
    // pour que la marge de fond perdu et les traits de coupe restent
    // répartis également autour de l'item et exploitables au massicot.
    let x: number;
    let y: number;
    if (trimBox) {
      x = PAGE_WIDTH / 2 - (trimBox.x + trimBox.width / 2) * ratio;
      y = PAGE_HEIGHT / 2 - (trimBox.y + trimBox.height / 2) * ratio;
    } else {
      x = (PAGE_WIDTH - w) / 2;
      y = (PAGE_HEIGHT - h) / 2;
    }

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
  a.download = `commande_impression_${config.fileSlug}_${new Date().toISOString().slice(0, 10)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);

  return {
    missingLabels: missingItems,
    summary: {
      totalReferences: orderedItems.length,
      totalQuantity: total,
      storeNames,
      items: orderedItems.map((item) => ({
        reference: item.reference,
        quantity: item.quantity ?? 0,
        storeNames: item.stores
          .map((id) => stores.find((s) => s.id === id)?.name)
          .filter((name): name is string => Boolean(name)),
      })),
    },
  };
};
