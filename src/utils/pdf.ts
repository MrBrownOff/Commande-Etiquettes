import * as pdfjsLib from 'pdfjs-dist';
import { initOCR, extractReferenceFromImage, preprocessCanvas } from './ocr';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface ScannedPdfPage {
  pageNumber: number;
  thumbnailDataUrl: string;
  ocrText: string;
}

// Contrairement à processPDF (qui OCRise une zone recadrée précise, calibrée sur
// le gabarit d'étiquette actuel), cette fonction OCRise la page entière : utile
// pour des PDF plus anciens dont la référence n'est pas forcément au même
// endroit (voir PdfImportView, qui recherche ensuite la référence dans tout le
// texte extrait plutôt que de dépendre d'une position fixe).
export const extractPagesWithFullPageOCR = async (
  file: File,
  onProgress: (current: number, total: number) => void
): Promise<ScannedPdfPage[]> => {
  const workerInstance = await initOCR();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: ScannedPdfPage[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;

    // L'OCR tourne sur une copie binarisée (voir preprocessCanvas) pour ne pas
    // abîmer la vignette couleur affichée à l'utilisateur pour vérification.
    const ocrCanvas = document.createElement('canvas');
    ocrCanvas.width = canvas.width;
    ocrCanvas.height = canvas.height;
    ocrCanvas.getContext('2d')?.drawImage(canvas, 0, 0);
    const { data } = await workerInstance.recognize(preprocessCanvas(ocrCanvas));

    const thumbCanvas = document.createElement('canvas');
    const thumbScale = 160 / canvas.width;
    thumbCanvas.width = 160;
    thumbCanvas.height = Math.round(canvas.height * thumbScale);
    thumbCanvas.getContext('2d')?.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);

    pages.push({
      pageNumber: pageNum,
      thumbnailDataUrl: thumbCanvas.toDataURL('image/jpeg', 0.75),
      ocrText: data.text,
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