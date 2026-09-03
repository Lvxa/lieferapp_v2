import fs from 'fs';

const dbFile = new URL('./data/db.json', import.meta.url);
const serverFile = new URL('./server.js', import.meta.url);
const stamp = Date.now();
const dbBackup = new URL(`./data/db-before-teilnehmer-faesser-${stamp}.json`, import.meta.url);
const serverBackup = new URL(`./server-before-teilnehmer-faesser-${stamp}.js`, import.meta.url);

fs.copyFileSync(dbFile, dbBackup);
fs.copyFileSync(serverFile, serverBackup);

const d = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
d.stands ||= [];
d.products ||= [];

const teilnehmer = d.stands.find(s => String(s.code || '').toLowerCase() === 'teilnehmer');
if (!teilnehmer) throw new Error('Teilnehmerzelt (Code teilnehmer) fehlt in db.json.');

// Profilname bleibt bestehen; nur die erlaubte Produktmenge wird erweitert.
teilnehmer.orderProfile = 'teilnehmer-bottled-beer-and-1l';

// 30L + 50L Fässer ausdrücklich bestellbar machen.
for (const id of [1, 2]) {
  const p = d.products.find(x => Number(x.id) === id);
  if (!p) throw new Error(`Bierfass Produkt-ID ${id} fehlt.`);
  p.orderEnabled = true;
}

fs.writeFileSync(dbFile, JSON.stringify(d, null, 2));

let server = fs.readFileSync(serverFile, 'utf8');
const oldRule = `'teilnehmer-bottled-beer-and-1l': [3,4,5,6,7,8,9,10,11,14,17,20,23,26,30,31,32,33]`;
const newRule = `'teilnehmer-bottled-beer-and-1l': [1,2,3,4,5,6,7,8,9,10,11,14,17,20,23,26,30,31,32,33]`;

if (server.includes(oldRule)) {
  server = server.replace(oldRule, newRule);
} else if (!server.includes(newRule)) {
  throw new Error('Teilnehmer-Sortimentsregel nicht in erwarteter Form gefunden; server.js wurde nicht verändert.');
}

fs.writeFileSync(serverFile, server);

console.log(`DB-Backup: ${dbBackup.pathname}`);
console.log(`Server-Backup: ${serverBackup.pathname}`);
console.log('Teilnehmerzelt darf jetzt 30L- und 50L-Fässer + alle bisherigen Flaschenbiere + 1-L-Ware bestellen.');
