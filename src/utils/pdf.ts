import * as pdfjsLib from 'pdfjs-dist';
import { initOCR, extractReferenceFromImage, preprocessCanvas } from './ocr';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface ScannedPdfPage {
  pageNumber: number;
  thumbnailDataUrl: string;
  ocrText: string;
  // Référence reconnue par `matcher` (null si aucune passe n'en a trouvé).
  reference: string | null;
}

interface FullPageOcrOptions {
  // Appelé sur le texte de chaque passe : renvoie la référence du catalogue
  // trouvée (croisement strict) ou null.
  matcher: (ocrText: string) => string | null;
  // Caractères autorisés à l'OCR (voir buildOcrAlphabet).
  alphabet?: string;
  // Échelles de rendu essayées dans l'ordre, jusqu'à la première qui donne une
  // référence reconnue.
  scales?: number[];
}

// Alphabet OCR restreint aux seuls caractères pouvant apparaître dans une
// référence du catalogue (lettres présentes dans les références, sans O, et
// chiffres) : l'OCR ne peut plus produire un caractère qui ne serait de toute
// façon dans aucune référence (O, Q...), sans changer la rigueur du croisement.
export const buildOcrAlphabet = (references: string[]): string => {
  const letters = new Set<string>();
  for (const ref of references) {
    for (const ch of ref.toUpperCase()) {
      if (ch >= 'A' && ch <= 'Z' && ch !== 'O') letters.add(ch);
    }
  }
  return [...letters].sort().join('') + '0123456789';
};

// Contrairement à processPDF (qui OCRise une zone recadrée précise, calibrée sur
// le gabarit d'étiquette actuel), cette fonction OCRise la page entière : utile
// pour des PDF plus anciens dont la référence n'est pas forcément au même
// endroit (voir PdfImportView, qui recherche ensuite la référence dans tout le
// texte extrait plutôt que de dépendre d'une position fixe).
//
// Les gabarits d'archive sont petits (ex. 193 x 283 pt) : à faible résolution un
// « 9 » est parfois lu « S », et la lecture varie selon l'échelle de rendu et le
// navigateur. Une page non reconnue est donc relue à des échelles plus fortes ;
// chaque passe est évaluée séparément et strictement par `matcher`.
export const extractPagesWithFullPageOCR = async (
  file: File,
  onProgress: (current: number, total: number) => void,
  { matcher, alphabet, scales = [2, 3, 4] }: FullPageOcrOptions
): Promise<ScannedPdfPage[]> => {
  const workerInstance = await initOCR();
  if (alphabet) {
    await workerInstance.setParameters({ tessedit_char_whitelist: alphabet });
  }
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: ScannedPdfPage[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    let thumbnailDataUrl = '';
    let reference: string | null = null;
    const texts: string[] = [];

    for (let pass = 0; pass < scales.length && !reference; pass++) {
      const viewport = page.getViewport({ scale: scales[pass] });
      // Garde-fou mémoire/temps : pas de passe supplémentaire sur de très grandes pages.
      if (pass > 0 && viewport.width > 3200) break;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) break;

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;

      if (pass === 0) {
        const thumbCanvas = document.createElement('canvas');
        const thumbScale = 160 / canvas.width;
        thumbCanvas.width = 160;
        thumbCanvas.height = Math.round(canvas.height * thumbScale);
        thumbCanvas.getContext('2d')?.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
        thumbnailDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.75);
      }

      // L'OCR tourne sur une copie binarisée (voir preprocessCanvas) pour ne pas
      // abîmer la vignette couleur affichée à l'utilisateur pour vérification.
      const ocrCanvas = document.createElement('canvas');
      ocrCanvas.width = canvas.width;
      ocrCanvas.height = canvas.height;
      ocrCanvas.getContext('2d')?.drawImage(canvas, 0, 0);
      const { data } = await workerInstance.recognize(preprocessCanvas(ocrCanvas));
      texts.push(data.text);
      reference = matcher(data.text);
    }

    pages.push({
      pageNumber: pageNum,
      thumbnailDataUrl,
      ocrText: texts.join('\n— autre passe (résolution supérieure) —\n'),
      reference,
    });

    onProgress(pageNum, pdf.numPages);
  }

  return pages;
};

export const processPDF = async (
  file: File,
  onProgress: (current: number, total: number) => void
) => {
  const workerInstance = await initOCR();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const extractedLabels = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) continue;

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: ctx, viewport }).promise;

    // Appel conforme à la version qui accepte workerInstance
    const ocrResult = await extractReferenceFromImage(canvas, workerInstance);

    extractedLabels.push({
      id: crypto.randomUUID(),
      ...ocrResult,
      stores: [],
      isValidated: false
    });

    onProgress(pageNum, pdf.numPages);
  }

  return extractedLabels;
};