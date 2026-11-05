// src/utils/matchReference.ts

// Aucune référence du catalogue ne contient la lettre O (seulement le chiffre 0,
// voir public/labels-pdf). Une lettre O lue par l'OCR est donc soit un 0 mal
// lu (ex: "MMO96" pour "MM096"), soit un parasite inséré (ex: "MMO0960191" pour
// "MM0960191", observé sur les archives 2020). On teste les deux lectures ;
// la référence complète doit de toute façon apparaître à l'identique.
const alnum = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const asZero = (s: string): string => s.replace(/O/g, '0');
const withoutO = (s: string): string => s.replace(/O/g, '');

// Croisement STRICT : une référence n'est reconnue que si elle apparaît
// intégralement et à l'identique (hors espaces, ponctuation et lettre O parasite ou confondue avec 0)
// dans le texte OCR de la page. Aucune correspondance approchante : sans
// référence identique dans le catalogue, on renvoie null (pas d'association).
// En cas de plusieurs références présentes (l'une contenue dans l'autre, ex.
// MM0961 et MM09612), on retient la plus longue.
export const matchReference = (ocrText: string, knownReferences: string[]): string | null => {
  const text = alnum(ocrText);
  const textAsZero = asZero(text);
  const textWithoutO = withoutO(text);
  let best: string | null = null;
  let bestLength = 0;
  for (const ref of knownReferences) {
    const cleanedRef = alnum(ref);
    if (cleanedRef.length === 0) continue;
    const found = textAsZero.includes(asZero(cleanedRef)) || textWithoutO.includes(withoutO(cleanedRef));
    if (found && cleanedRef.length > bestLength) {
      best = ref;
      bestLength = cleanedRef.length;
    }
  }
  return best;
};
