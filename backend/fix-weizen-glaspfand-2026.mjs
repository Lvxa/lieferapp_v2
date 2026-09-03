import fs from 'fs';

const dbFile = new URL('./data/db.json', import.meta.url);
const stamp = Date.now();
fs.copyFileSync(dbFile, new URL(`./data/db-before-weizen-glaspfand-${stamp}.json`, import.meta.url));

const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
db.posProducts ||= [];

const targets = [
  'schöfferhofer weizen',
  'schöfferhofer hefeweizen',
  'schöfferhofer weizen alkoholfrei',
  'schöfferhofer hefeweizen alkoholfrei',
  'hefeweizen alkoholfrei'
];

let changed = 0;
for (const p of db.posProducts) {
  const name = String(p.name || '').trim().toLowerCase();
  const isWeizen = targets.some(t => name === t) || (name.includes('schöfferhofer') && name.includes('weizen'));
  if (!isWeizen) continue;
  p.depositType = 'glass';
  p.depositPrice = 2;
  changed++;
}

if (changed < 2) {
  console.warn(`WARNUNG: Nur ${changed} passende Weizen-POS-Produkte gefunden.`);
}

fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
console.log(`Weizen-POS-Produkte auf Glas + 2,00 EUR Pfand gesetzt: ${changed}`);
console.log('DB-Backup wurde angelegt.');
