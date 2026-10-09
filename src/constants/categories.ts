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
