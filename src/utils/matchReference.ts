// src/utils/matchReference.ts

// Aucune référence du catalogue ne contient la lettre O (seulement le chiffre 0,
// voir public/labels-pdf) : normaliser O -> 0 corrige une confusion OCR très
// fréquente (ex: "MMO96" lu pour "MM096") sans risque de faux positif.
const cleanToken = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0');

const levenshtein = (a: string, b: string): number => {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
};

export interface ReferenceMatch {
  reference: string;
  exact: boolean;
}

// Le texte OCR d'une page entière mélange la référence avec le reste du
// contenu (titre, dimensions, mentions légales) et peut comporter des erreurs
// de reconnaissance (chiffres manqués, etc.) — on cherche donc d'abord une
// correspondance exacte (la référence complète apparaît telle quelle dans le
// texte nettoyé), puis on retombe sur la référence connue la plus proche
// (distance d'édition) d'un des fragments alphanumériques extraits.
export const matchReference = (ocrText: string, knownReferences: string[]): ReferenceMatch | null => {
  const cleanedText = cleanToken(ocrText);
  const exact = knownReferences.find((ref) => cleanedText.includes(cleanToken(ref)));
  if (exact) return { reference: exact, exact: true };

  // La référence est souvent scindée par l'OCR en deux fragments adjacents
  // (ex: "MM096" puis "0191", affichés sur deux lignes sur l'étiquette) : on
  // teste donc aussi chaque paire de tokens consécutifs concaténés, pas
  // seulement chaque token isolé.
  const rawTokens = ocrText.toUpperCase().match(/[A-Z0-9]{2,}/g) ?? [];
  const candidates = [...rawTokens];
  for (let i = 0; i < rawTokens.length - 1; i++) {
    candidates.push(rawTokens[i] + rawTokens[i + 1]);
  }

  let best: { reference: string; distance: number } | null = null;
  for (const candidate of candidates) {
    const cleanedCandidate = cleanToken(candidate);
    if (cleanedCandidate.length < 5) continue;
    for (const ref of knownReferences) {
      const distance = levenshtein(cleanedCandidate, cleanToken(ref));
      if (distance <= 2 && (!best || distance < best.distance)) {
        best = { reference: ref, distance };
      }
    }
  }
  return best ? { reference: best.reference, exact: false } : null;
};
