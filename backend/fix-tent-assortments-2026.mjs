import fs from 'fs';

const dbFile = new URL('./data/db.json', import.meta.url);
const serverFile = new URL('./server.js', import.meta.url);
const stamp = Date.now();
const dbBackup = new URL(`./data/db-before-tent-assortment-fix-${stamp}.json`, import.meta.url);
const serverBackup = new URL(`./server-before-tent-assortment-fix-${stamp}.js`, import.meta.url);

const d = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
fs.copyFileSync(dbFile, dbBackup);
fs.copyFileSync(serverFile, serverBackup);

d.stands ||= [];
d.products ||= [];

function stand(code) {
  return d.stands.find(s => String(s.code || '').toLowerCase() === String(code).toLowerCase());
}
function product(id) {
  return d.products.find(p => Number(p.id) === Number(id));
}
function enable(ids) {
  for (const id of ids) {
    const p = product(id);
    if (p) p.orderEnabled = true;
  }
}

// ---------- Produktstammdaten ----------
// Laut aktueller Vorgabe sind diese großen Wassergebinde 1-l-Ware.
const water30 = product(30);
if (water30) {
  water30.name = 'Salvus Classic Glas 1l';
  water30.package = '12 x 1 l Glas';
  water30.orderEnabled = true;
}
const water31 = product(31);
if (water31) {
  water31.name = 'Salvus Classic Sanft 1l';
  water31.package = '12 x 1 l Glas';
  water31.orderEnabled = true;
}

// ---------- Standprofile ----------
const sponsor = stand('sponsorenzelt');
if (sponsor) {
  sponsor.orderProfile = 'sponsor-small-softdrinks-selters';
  sponsor.posEnabled = false;
}

const participant = stand('teilnehmer');
if (participant) {
  participant.orderProfile = 'teilnehmer-bottled-beer-and-1l';
  participant.posEnabled = false;
}

const members = stand('mitglieder');
if (members) {
  members.orderProfile = 'mitglieder-all-beer-and-1l';
  members.posEnabled = false;
}

const press = stand('presse');
if (press) {
  press.orderProfile = 'presse-small-softdrinks-toeftes';
  press.posEnabled = false;
}

// Sponsorenzelt: 0,2 l Cola/Zero/Fanta/Sprite + Selters 0,25 classic/still.
const sponsorIds = [12, 15, 18, 21, 34, 35];
// Presse: alle 0,2-l-Softdrinks + die drei Töftes-Produkte.
const pressIds = [12, 15, 18, 21, 24, 27, 28, 29];
// 1-l Softdrinks/Wasser.
const litreIds = [14, 17, 20, 23, 26, 30, 31, 32, 33];
// Bierflaschen/-kisten, aber keine Fässer (IDs 1/2 sind Fässer).
const bottledBeerIds = [3, 4, 5, 6, 7, 8, 9, 10, 11];
// Mitglieder dürfen zusätzlich auch beide Fassgrößen.
const allBeerIds = [1, 2, ...bottledBeerIds];

enable([...new Set([...sponsorIds, ...pressIds, ...litreIds, ...allBeerIds])]);

fs.writeFileSync(dbFile, JSON.stringify(d, null, 2));

// ---------- Backend-Regeln ----------
let server = fs.readFileSync(serverFile, 'utf8');

const start = server.indexOf('function canStandOrderProduct(stand, product) {');
const end = server.indexOf('function productForResponse(product, forBierbude = false) {');
if (start < 0 || end < 0 || end <= start) {
  throw new Error('canStandOrderProduct-Block konnte in server.js nicht sicher gefunden werden. DB wurde bereits gesichert; server.js blieb unverändert.');
}

const replacement = `function canStandOrderProduct(stand, product) {
  if (!stand || !product || product.orderEnabled === false) return false;

  const profile = stand.orderProfile || null;
  const id = Number(product.id);
  const category = String(product.category || '').toLowerCase();
  const text = String(product.name || '') + ' ' + String(product.package || '') + ' ' + String(product.unit || '');
  const isBeer = category.startsWith('bier');
  const isKeg = String(product.unit || '').toLowerCase() === 'fass' || /\\bfass\\b/i.test(text);
  const isBottledBeer = isBeer && !isKeg;
  const isOneLiter = /\\b1\\s*l\\b/i.test(text);

  // Sponsorenzelt: 0,2-l Cola/Zero/Fanta/Sprite + Selters 0,25, sonst nichts.
  if (profile === 'sponsor-small-softdrinks-selters') {
    return [12, 15, 18, 21, 34, 35].includes(id);
  }

  // Teilnehmerzelt: Bier nur Flaschen/Kisten, keine Fässer; sonst ausschließlich 1-l-Ware.
  if (profile === 'teilnehmer-bottled-beer-and-1l') {
    return isBottledBeer || (!isBeer && isOneLiter);
  }

  // Mitgliederzelt: sämtliches Bier inklusive Fässer; Softdrinks/Wasser ausschließlich 1 l.
  if (profile === 'mitglieder-all-beer-and-1l') {
    return isBeer || (!isBeer && isOneLiter);
  }

  // Pressezelt: 0,2-l Softdrinks + Töftes, sonst nichts.
  if (profile === 'presse-small-softdrinks-toeftes') {
    return [12, 15, 18, 21, 24, 27, 28, 29].includes(id);
  }

  // Slushbude behält ihre bestehende Sonderregel: kein Bier in der Lagerbestellung.
  if (stand.code === 'slush' && category.startsWith('bier')) return false;

  const wanted = stand.assortment || 'sales';
  const scope = product.orderScope || (product.isActive === false ? 'unassigned' : 'sales');
  return scope === 'both' || scope === wanted;
}
`;

server = server.slice(0, start) + replacement + server.slice(end);
fs.writeFileSync(serverFile, server);

function names(ids) {
  return ids.map(id => product(id)?.name).filter(Boolean);
}

console.log(`DB-Backup: ${dbBackup.pathname}`);
console.log(`Server-Backup: ${serverBackup.pathname}`);
console.log('\nSponsorenzelt:');
console.table(names(sponsorIds).map(Produkt => ({ Produkt })));
console.log('\nTeilnehmerzelt: Bierflaschen + 1-l-Ware:');
console.table(names([...bottledBeerIds, ...litreIds]).map(Produkt => ({ Produkt })));
console.log('\nMitgliederzelt: alles Bier + 1-l-Ware:');
console.table(names([...allBeerIds, ...litreIds]).map(Produkt => ({ Produkt })));
console.log('\nPressezelt:');
console.table(names(pressIds).map(Produkt => ({ Produkt })));
console.log('\nWasser korrigiert: Produkt 30/31 jetzt als 1-l-Glasware bezeichnet.');
