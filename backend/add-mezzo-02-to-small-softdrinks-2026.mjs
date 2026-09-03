import fs from 'fs';

const dbFile = new URL('./data/db.json', import.meta.url);
const serverFile = new URL('./server.js', import.meta.url);
const stamp = Date.now();

const dbBackup = new URL(`./data/db-before-mezzo-02-${stamp}.json`, import.meta.url);
const serverBackup = new URL(`./server-before-mezzo-02-${stamp}.js`, import.meta.url);
fs.copyFileSync(dbFile, dbBackup);
fs.copyFileSync(serverFile, serverBackup);

const d = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
d.products ||= [];
const mezzo = d.products.find(p => Number(p.id) === 24);
if (!mezzo) throw new Error('Mezzo Mix 0,2 l (Produkt 24) fehlt in db.json.');
mezzo.orderEnabled = true;
fs.writeFileSync(dbFile, JSON.stringify(d, null, 2));

let server = fs.readFileSync(serverFile, 'utf8');

const replacements = [
  ["'vip-all-beer-small-softdrinks-toeftes': [1,2,3,4,5,6,7,8,9,10,11,12,15,18,21,27,28,29]", "'vip-all-beer-small-softdrinks-toeftes': [1,2,3,4,5,6,7,8,9,10,11,12,15,18,21,24,27,28,29]"],
  ["'mitglieder-bottled-beer-small-softdrinks-toeftes': [3,4,5,6,7,8,9,10,11,12,15,18,21,27,28,29]", "'mitglieder-bottled-beer-small-softdrinks-toeftes': [3,4,5,6,7,8,9,10,11,12,15,18,21,24,27,28,29]"],
  ["'sponsor-bottled-beer-small-softdrinks': [3,4,5,6,7,8,9,10,11,12,15,18,21]", "'sponsor-bottled-beer-small-softdrinks': [3,4,5,6,7,8,9,10,11,12,15,18,21,24]"]
];

let changed = 0;
for (const [from, to] of replacements) {
  if (server.includes(from)) {
    server = server.replace(from, to);
    changed++;
  } else if (!server.includes(to)) {
    console.warn(`Regel nicht gefunden: ${from}`);
  }
}

// Presse hatte Mezzo 0,2 bereits in der Liste; falls nicht, ergänzen.
const pressOld = "'presse-small-softdrinks-toeftes': [12,15,18,21,27,28,29]";
const pressNew = "'presse-small-softdrinks-toeftes': [12,15,18,21,24,27,28,29]";
if (server.includes(pressOld)) {
  server = server.replace(pressOld, pressNew);
  changed++;
}

fs.writeFileSync(serverFile, server);

console.log(`DB-Backup: ${dbBackup.pathname}`);
console.log(`Server-Backup: ${serverBackup.pathname}`);
console.log(`Mezzo Mix 0,2 l ist jetzt bestellbar und bei allen Ständen mit kleinem Softdrink-Sortiment ergänzt.`);
console.log(`Backend-Regeln geändert: ${changed}`);
