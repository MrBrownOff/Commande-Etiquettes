// src/utils/matchReference.ts

// Aucune référence du catalogue ne contient la lettre O (que des chiffres 0) :
// un O éventuellement lu par l'OCR est toujours lu comme un 0.
const alnum = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const asZero = (s: string): string => s.replace(/O/g, '0');

// Croisement STRICT : une référence n'est reconnue que si elle apparaît
// intégralement et à l'identique (hors espaces, ponctuation, et O lu comme 0)
// dans le texte OCR de la page. Aucune correspondance approchante : sans
// référence identique dans le catalogue, on renvoie null (pas d'association).
// En cas de plusieurs références présentes (l'une contenue dans l'autre, ex.
// MM0961 et MM09612), on retient la plus longue.
export const matchReference = (ocrText: string, knownReferences: string[]): string | null => {
  const text = alnum(ocrText);
  const textAsZero = asZero(text);
  let best: string | null = null;
  let bestLength = 0;
  for (const ref of knownReferences) {
    const cleanedRef = alnum(ref);
    if (cleanedRef.length === 0) continue;
    const found = textAsZero.includes(asZero(cleanedRef));
    if (found && cleanedRef.length > bestLength) {
      best = ref;
      bestLength = cleanedRef.length;
    }
  }
  return best;
};
