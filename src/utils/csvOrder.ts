import { LabelItem, StoreItem } from '../store/store';

// Commande par fichier CSV : une ligne par référence (reference ; quantite ;
// magasins). Le croisement avec le catalogue est strict, comme pour l'import
// d'un ancien PDF : une référence est retrouvée seulement si elle est identique
// (casse, espaces et ponctuation ignorés, la lettre O lue comme 0 puisqu'aucune
// référence n'en contient) ; sinon elle est signalée comme introuvable.

const HEADERS = ['reference', 'quantite', 'magasins'];

const stripAccents = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const normalizeText = (s: string): string => stripAccents(s).toLowerCase().replace(/\s+/g, ' ').trim();
const normalizeReference = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0');

// Décodage tolérant : Excel enregistre souvent les « CSV » en Windows-1252.
export const decodeCsvBytes = (bytes: ArrayBuffer): string => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
};

// Analyse CSV minimale (guillemets, séparateur « ; » « , » ou tabulation détecté
// sur la première ligne). Renvoie toutes les lignes, vides comprises, pour que
// les numéros de ligne signalés correspondent à ceux du fichier.
export const parseCsv = (text: string): string[][] => {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [';', ',', '\t'].reduce(
    (best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best),
    ';'
  );

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += c;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
};

const csvCell = (value: string): string => (/[;"\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

// Contenu du fichier modèle : en-tête + deux lignes d'exemple prises dans le
// catalogue et les magasins réels, pour qu'il soit utilisable tel quel.
export const buildCsvTemplate = (items: LabelItem[], stores: StoreItem[]): string => {
  const rows: string[][] = [
    ['reference', 'quantite', 'magasins'],
    [items[0]?.reference ?? 'REFERENCE1', '5', stores[0]?.name ?? 'Nom du magasin'],
    [
      items[1]?.reference ?? 'REFERENCE2',
      '10',
      [stores[0]?.name, stores[1]?.name].filter(Boolean).join('|') || 'Magasin A|Magasin B',
    ],
  ];
  return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
};

export interface CsvOrderResult {
  matched: { item: LabelItem; quantity: number; storeIds: string[] | null }[];
  notFound: { line: number; reference: string }[];
  invalidQuantity: { line: number; reference: string; value: string }[];
  unknownStores: { line: number; reference: string; name: string }[];
}

export const resolveCsvOrder = (rows: string[][], items: LabelItem[], stores: StoreItem[]): CsvOrderResult => {
  const header = (rows[0] ?? []).map((h) => normalizeText(h));
  const col = (names: string[]) => header.findIndex((h) => names.includes(h));
  const refCol = col(['reference', 'ref']);
  const qtyCol = col(['quantite', 'qte', 'quantity']);
  const storesCol = col(['magasins', 'magasin', 'stores']);

  if (refCol === -1) {
    throw new Error(
      `Colonne « reference » introuvable. La première ligne doit contenir les en-têtes : ${HEADERS.join(' ; ')}.`
    );
  }

  const itemByRef = new Map<string, LabelItem>();
  items.forEach((item) => {
    const key = normalizeReference(item.reference);
    if (key && !itemByRef.has(key)) itemByRef.set(key, item);
  });
  const storeByName = new Map(stores.map((s) => [normalizeText(s.name), s.id]));

  const result: CsvOrderResult = { matched: [], notFound: [], invalidQuantity: [], unknownStores: [] };
  const indexByItemId = new Map<string, number>();

  rows.slice(1).forEach((row, i) => {
    const line = i + 2;
    const reference = (row[refCol] ?? '').trim();
    if (!reference) return; // ligne vide

    const item = itemByRef.get(normalizeReference(reference));
    if (!item) {
      result.notFound.push({ line, reference });
      return;
    }

    let quantity = 1;
    const rawQty = qtyCol === -1 ? '' : (row[qtyCol] ?? '').trim();
    if (rawQty !== '') {
      const n = Number(rawQty);
      if (!Number.isInteger(n) || n < 1 || n > 99) {
        result.invalidQuantity.push({ line, reference, value: rawQty });
        return;
      }
      quantity = n;
    }

    let storeIds: string[] | null = null;
    const rawStores = storesCol === -1 ? '' : (row[storesCol] ?? '').trim();
    if (rawStores !== '') {
      storeIds = [];
      rawStores
        .split('|')
        .map((n) => n.trim())
        .filter(Boolean)
        .forEach((name) => {
          const id = storeByName.get(normalizeText(name));
          if (id) {
            if (!storeIds!.includes(id)) storeIds!.push(id);
          } else {
            result.unknownStores.push({ line, reference, name });
          }
        });
    }

    // Une référence répétée dans le fichier : la dernière ligne l'emporte.
    const entry = { item, quantity, storeIds };
    const existing = indexByItemId.get(item.id);
    if (existing === undefined) {
      indexByItemId.set(item.id, result.matched.length);
      result.matched.push(entry);
    } else {
      result.matched[existing] = entry;
    }
  });

  return result;
};
