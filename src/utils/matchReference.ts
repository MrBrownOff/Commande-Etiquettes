// src/utils/matchReference.ts

// Aucune référence du catalogue ne contient la lettre O (seulement le chiffre 0,
// voir public/labels-pdf) : normaliser O -> 0 corrige une confusion OCR très
// fréquente (ex: "MMO96" lu pour "MM096") sans risque de faux positif.
const cleanToken = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0');

// Croisement STRICT : une référence n'est reconnue que si elle apparaît
// intégralement et à l'identique (hors espaces, ponctuation et confusion O/0)
// dans le texte OCR de la page. Aucune correspondance approchante : sans
// référence identique dans le catalogue, on renvoie null (pas d'association).
// En cas de plusieurs références présentes (l'une contenue dans l'autre, ex.
// MM0961 et MM09612), on retient la plus longue.
export const matchReference = (ocrText: string, knownReferences: string[]): string | null => {
  const cleanedText = cleanToken(ocrText);
  let best: string | null = null;
  let bestLength = 0;
  for (const ref of knownReferences) {
    const cleanedRef = cleanToken(ref);
    if (cleanedRef.length === 0 || !cleanedText.includes(cleanedRef)) continue;
    if (cleanedRef.length > bestLength) {
      best = ref;
      bestLength = cleanedRef.length;
    }
  }
  return best;
};
