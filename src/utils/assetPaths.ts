// Emplacements des fichiers statiques (JPEG et PDF) de public/.
//
// Les étiquettes sont rangées par format dans des sous-dossiers :
//   public/labels/{3_25,2_25}/<référence>.jpg
//   public/labels-pdf/{3_25,2_25}/<référence>.pdf
// Les autres types (pro-pack, fanions) restent à plat dans leur dossier.
//
// Le dossier de format d'une référence n'est pas connu à l'avance (detectLabelCategory
// s'appuie justement sur le PDF pour le déduire) : on essaie donc chaque sous-dossier
// dans l'ordre, puis l'ancien emplacement à plat en dernier recours.

const SIZE_SUBFOLDERS_BY_FOLDER: Record<string, string[]> = {
  labels: ['3_25', '2_25'],
  'labels-pdf': ['3_25', '2_25'],
};

const withBase = (path: string): string => `${import.meta.env.BASE_URL}${path}`;

// URL candidates d'un fichier d'un dossier de public/, dans l'ordre d'essai :
// sous-dossiers de format (s'il y en a pour ce dossier), puis dossier à plat.
export const getAssetUrlCandidates = (
  folder: string,
  reference: string,
  extension: 'jpg' | 'pdf'
): string[] => {
  const subfolders = SIZE_SUBFOLDERS_BY_FOLDER[folder] ?? [];
  return [
    ...subfolders.map((sub) => withBase(`${folder}/${sub}/${reference}.${extension}`)),
    withBase(`${folder}/${reference}.${extension}`),
  ];
};

// Idem pour un JPEG, avec en plus l'ancien emplacement historique à la racine de public/.
export const getImageUrlCandidates = (folder: string, reference: string): string[] => [
  ...getAssetUrlCandidates(folder, reference, 'jpg'),
  withBase(`${reference}.jpg`),
];

// À appeler dans le onError d'un <img> : passe à la prochaine URL candidate non encore
// essayée. Le rang de la prochaine tentative est mémorisé sur l'élément lui-même.
export const advanceImageFallback = (img: HTMLImageElement, candidates: string[]): void => {
  let next = Number(img.dataset['fallbackIndex'] ?? '0');
  while (next < candidates.length) {
    const candidate = candidates[next];
    next += 1;
    // Ne pas réessayer l'URL qui vient justement d'échouer.
    if (new URL(candidate, window.location.href).href === img.src) continue;
    img.dataset['fallbackIndex'] = String(next);
    img.src = candidate;
    return;
  }
  img.dataset['fallbackIndex'] = String(next);
};
