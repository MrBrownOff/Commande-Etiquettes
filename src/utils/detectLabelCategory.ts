import { PDFDocument } from 'pdf-lib';
import { LABEL_SIZE_BY_CATEGORY } from '../constants/categories';

const PT_PER_IN = 72;
// Tolérance de mesure : absorbe les écarts d'arrondi du fabricant sur la TrimBox
// sans confondre deux formats réellement différents (2 x 2,25 vs 2 x 3,25 po).
const TOLERANCE_IN = 0.05;

// Déduit la sous-catégorie de dimension (voir constants/categories.ts) d'une
// référence à partir de la TrimBox de son PDF maître déjà présent dans
// public/<pdfFolder>/ (le même fichier que celui utilisé à l'impression dans
// printerExport.ts). Retourne undefined si le PDF maître est introuvable ou si
// sa taille ne correspond à aucune sous-catégorie connue : l'item garde alors
// le format par défaut.
export const detectLabelCategoryByReference = async (
  reference: string,
  pdfFolder: string
): Promise<string | undefined> => {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}${pdfFolder}/${reference}.pdf`);
    if (!res.ok) return undefined;

    const bytes = await res.arrayBuffer();
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    if (doc.getPageCount() === 0) return undefined;

    const trimBox = doc.getPage(0).getTrimBox();
    const widthIn = trimBox.width / PT_PER_IN;
    const heightIn = trimBox.height / PT_PER_IN;

    for (const [category, size] of Object.entries(LABEL_SIZE_BY_CATEGORY)) {
      if (
        Math.abs(size.widthIn - widthIn) <= TOLERANCE_IN &&
        Math.abs(size.heightIn - heightIn) <= TOLERANCE_IN
      ) {
        return category;
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
};
