// Export de toutes les collections Firestore vers des fichiers JSON.
// Usage : node export-firestore.mjs <chemin-cle-service.json> <dossier-sortie>
// La clé de service (Console Firebase > Paramètres > Comptes de service) ne doit JAMAIS être commitée.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const admin = require('firebase-admin'); // npm i firebase-admin (hors dépôt)

const [keyPath, outDir = './export'] = process.argv.slice(2);
if (!keyPath) {
  console.error('Usage : node export-firestore.mjs <cle-service.json> [dossier-sortie]');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
const db = admin.firestore();
mkdirSync(outDir, { recursive: true });

const COLLECTIONS = [
  'stores', 'labels', 'proPack', 'fanionsItems', 'users',
  'repQuantitiesLabels', 'repQuantitiesProPack', 'repQuantitiesFanions',
  'printHistory', 'proPackPrintHistory', 'fanionsItemsPrintHistory',
];

const plain = (v) => {
  if (v && typeof v.toDate === 'function') return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
};

for (const name of COLLECTIONS) {
  const snap = await db.collection(name).get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...plain(d.data()) }));
  writeFileSync(`${outDir}/${name}.json`, JSON.stringify(rows, null, 2));
  console.log(`${name}: ${rows.length} documents`);
}
