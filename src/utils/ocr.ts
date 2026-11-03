import Tesseract from 'tesseract.js';

let worker: Tesseract.Worker | null = null;

export const initOCR = async () => {
  if (!worker) {
    worker = await Tesseract.createWorker();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    // SINGLE_BLOCK (plutôt que le mode AUTO par défaut) donne des résultats
    // nettement plus fiables sur nos étiquettes : texte dense, peu de mise en
    // page complexe à segmenter — validé sur un vrai PDF d'archive (2020).
    await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK });
  }
  return worker;
};

export const preprocessCanvas = (canvas: HTMLCanvasElement): string => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas.toDataURL();
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    // Canal le plus sombre plutôt que la luminance : un texte jaune/doré (ex:
    // gabarit « QUART DE ROND ») a une luminance > 150 et disparaissait en blanc,
    // alors que son canal bleu reste bas. Le blanc du fond reste blanc.
    const darkest = Math.min(data[i], data[i + 1], data[i + 2]);
    const color = darkest > 150 ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = color;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/jpeg', 1.0);
};

export const extractReferenceFromImage = async (
  fullPageCanvas: HTMLCanvasElement,
  workerInstance: Tesseract.Worker
) => {
  const cropConfig = { x: fullPageCanvas.width * 0.25, y: fullPageCanvas.height * 0.02, width: fullPageCanvas.width * 0.50, height: fullPageCanvas.height * 0.15 };
  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = cropConfig.width; croppedCanvas.height = cropConfig.height;
  const ctx = croppedCanvas.getContext('2d');
  ctx?.drawImage(fullPageCanvas, cropConfig.x, cropConfig.y, cropConfig.width, cropConfig.height, 0, 0, cropConfig.width, cropConfig.height);

  const { data } = await workerInstance.recognize(preprocessCanvas(croppedCanvas));
  return {
    reference: data.text.replace(/[\s\n]+/g, '').replace(/[^A-Za-z0-9-]/g, '').trim(),
    confidence: data.confidence,
    thumbnailUrl: preprocessCanvas(croppedCanvas)
  };
};