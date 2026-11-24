// Noms de sous-catégories (voir LabelItem.category dans store.ts) partagés entre
// Sidebar (filtrage des sous-menus) et printerExport (format d'impression cible) :
// centralisés ici pour qu'un utilitaire non-UI (printerExport.ts) n'ait pas à
// dépendre d'un composant React (Sidebar.tsx).
export const PEUPLIER_CATEGORY = 'Produits en peuplier';
export const SIZE_2X225_CATEGORY = '2 x 2,25';
export const SIZE_2X325_CATEGORY = '2 x 3,25';

// Format d'impression cible (pouce) par sous-catégorie de dimension : remplace le
// format fixe par défaut des étiquettes (2 x 3,25 po, voir KIND_CONFIG dans
// printerExport.ts) pour les items tagués avec l'une de ces catégories.
export const LABEL_SIZE_BY_CATEGORY: Record<string, { widthIn: number; heightIn: number }> = {
  [SIZE_2X225_CATEGORY]: { widthIn: 2, heightIn: 2.25 },
  [SIZE_2X325_CATEGORY]: { widthIn: 2, heightIn: 3.25 },
};

// Suffixe de format ajouté aux références d'étiquettes (ex. "BM0961325_3-25") : il sert à
// retrouver les fichiers (public/labels*/<référence>.*) mais n'a pas à être montré à l'écran.
const LABEL_SIZE_SUFFIX_RE = /_(2|3)-25$/;

// Nom d'étiquette à afficher : la référence sans son suffixe _2-25 / _3-25.
// Affichage seulement : la référence réelle (fichiers, Firestore, PDF, CSV) reste intacte.
export const getDisplayReference = (reference: string): string =>
  reference.replace(LABEL_SIZE_SUFFIX_RE, '');

// Libellé de format d'une étiquette : la sous-catégorie de dimension détectée dans le PDF
// si elle existe, sinon déduite du suffixe de la référence. undefined si inconnu.
export const getLabelSizeLabel = (reference: string, category?: string): string | undefined => {
  if (category && LABEL_SIZE_BY_CATEGORY[category]) return `${category} po`;
  const match = reference.match(LABEL_SIZE_SUFFIX_RE);
  if (match?.[1] === '2') return `${SIZE_2X225_CATEGORY} po`;
  if (match?.[1] === '3') return `${SIZE_2X325_CATEGORY} po`;
  return undefined;
};
