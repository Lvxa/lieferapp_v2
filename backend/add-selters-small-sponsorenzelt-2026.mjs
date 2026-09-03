import fs from 'fs';

const dbFile = new URL('./data/db.json', import.meta.url);
const serverFile = new URL('./server.js', import.meta.url);
const stamp = Date.now();
const dbBackup = new URL(`./data/db-before-sponsor-selters-${stamp}.json`, import.meta.url);
const serverBackup = new URL(`./server-before-sponsor-selters-${stamp}.js`, import.meta.url);

fs.copyFileSync(dbFile, dbBackup);
fs.copyFileSync(serverFile, serverBackup);

const d = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
d.products ||= [];
d.stands ||= [];

for (const id of [34,35]) {
  const p = d.products.find(x => Number(x.id) === id);
  if (p) p.orderEnabled = true;
}

const sponsor = d.stands.find(s => String(s.code || '').toLowerCase() === 'sponsorenzelt');
if (!sponsor) throw new Error('Sponsorenzelt fehlt in db.json');
// Profilname bleibt gleich; Backend-Liste wird erweitert.

fs.writeFileSync(dbFile, JSON.stringify(d, null, 2));

let server = fs.readFileSync(serverFile, 'utf8');
const from = "'sponsor-bottled-beer-small-softdrinks': [3,4,5,6,7,8,9,10,11,12,15,18,21,24]";
const to = "'sponsor-bottled-beer-small-softdrinks': [3,4,5,6,7,8,9,10,11,12,15,18,21,24,34,35]";
if (server.includes(from)) {
  server = server.replace(from, to);
} else if (!server.includes(to)) {
  throw new Error('Sponsorenzelt-Regel in server.js nicht gefunden.');
}

fs.writeFileSync(serverFile, server);

console.log(`DB-Backup: ${dbBackup.pathname}`);
console.log(`Server-Backup: ${serverBackup.pathname}`);
console.log('Sponsorenzelt darf jetzt zusätzlich Selters klein classic/sprudel und still (Produkte 34/35) bestellen.');
