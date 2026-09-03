import fs from 'fs';

const dbFile = new URL('./data/db.json', import.meta.url);
const serverFile = new URL('./server.js', import.meta.url);
const stamp = Date.now();

const dbBackup = new URL(`./data/db-before-richter-presse-selters-${stamp}.json`, import.meta.url);
const serverBackup = new URL(`./server-before-richter-presse-selters-${stamp}.js`, import.meta.url);
fs.copyFileSync(dbFile, dbBackup);
fs.copyFileSync(serverFile, serverBackup);

const d = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
d.users ||= [];
d.stands ||= [];
d.products ||= [];

const nextId = arr => arr.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;
const product = id => d.products.find(p => Number(p.id) === Number(id));
const findStand = code => d.stands.find(s => String(s.code || '').toLowerCase() === String(code).toLowerCase());

function upsertStand(data) {
  let s = findStand(data.code);
  if (!s) {
    s = { id: nextId(d.stands), ...data };
    d.stands.push(s);
  } else {
    Object.assign(s, data);
  }
  return s;
}

function ensureUser(username, standort) {
  let u = d.users.find(x => String(x.username || '').toLowerCase() === username.toLowerCase());
  if (!u) {
    u = { id: nextId(d.users), username, password: 'bude123', role: 'bierbude', standort };
    d.users.push(u);
  } else {
    u.role = 'bierbude';
    u.standort = standort;
  }
  return u;
}

// 1-l Softdrinks + 1-l Wasser.
const litreIds = [14, 17, 20, 23, 26, 30, 31, 32, 33];
// Presse: 0,2-l Softdrinks inkl. Mezzo + kleine Selters-Flaschen classic/still.
const pressIds = [12, 15, 18, 21, 24, 34, 35];

for (const id of [...new Set([...litreIds, ...pressIds])]) {
  const p = product(id);
  if (p) p.orderEnabled = true;
}

// Neuer Stand Richter: ausschließlich Literware, keine Kasse.
upsertStand({
  code: 'richter',
  name: 'Richter',
  type: 'sponsor',
  assortment: 'sponsor',
  posEnabled: false,
  orderProfile: 'richter-1l-only'
});
ensureUser('Richter', 'richter');

// Presse: keine Töftes mehr, dafür kleine Selters-Flaschen.
const presse = findStand('presse');
if (!presse) throw new Error("Pressezelt (Code 'presse') fehlt in db.json.");
presse.orderProfile = 'presse-small-softdrinks-selters';
presse.posEnabled = false;

fs.writeFileSync(dbFile, JSON.stringify(d, null, 2));

let server = fs.readFileSync(serverFile, 'utf8');

// Richter-Regel in die kanonische Exact-Map einfügen.
if (!server.includes("'richter-1l-only'")) {
  const marker = 'const exact = {';
  if (!server.includes(marker)) throw new Error('Exact-Sortimentsmap in server.js nicht gefunden.');
  server = server.replace(
    marker,
    `${marker}\n    'richter-1l-only': [14,17,20,23,26,30,31,32,33],`
  );
}

// Presse-Regel von Töftes auf kleine Selters umstellen.
const oldPressRules = [
  "'presse-small-softdrinks-toeftes': [12,15,18,21,24,27,28,29]",
  "'presse-small-softdrinks-toeftes': [12,15,18,21,27,28,29]"
];
const newPressRule = "'presse-small-softdrinks-selters': [12,15,18,21,24,34,35]";
let pressChanged = false;
for (const oldRule of oldPressRules) {
  if (server.includes(oldRule)) {
    server = server.replace(oldRule, newPressRule);
    pressChanged = true;
    break;
  }
}
if (!pressChanged && !server.includes(newPressRule)) {
  throw new Error('Presse-Sortimentsregel in server.js nicht gefunden.');
}

fs.writeFileSync(serverFile, server);

const names = ids => ids.map(id => product(id)?.name || `Produkt ${id}`);
console.log(`DB-Backup: ${dbBackup.pathname}`);
console.log(`Server-Backup: ${serverBackup.pathname}`);
console.log('\nRichter darf bestellen (nur Literware):');
console.table(names(litreIds).map(Produkt => ({ Produkt })));
console.log('\nPresse darf bestellen (0,2 l + kleine Selters, kein Töftes):');
console.table(names(pressIds).map(Produkt => ({ Produkt })));
console.log('\nLogin Richter: Richter / bude123 (bei Neuanlage)');
console.log('Hinweis: Produkte mit Lagerbestand 0 werden in der Bestellansicht weiterhin nicht auswählbar angezeigt.');
