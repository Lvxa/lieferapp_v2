import fs from 'fs';

const dbFile = new URL('./data/db.json', import.meta.url);
const serverFile = new URL('./server.js', import.meta.url);
const indexFile = new URL('../frontend/index.html', import.meta.url);
const kasseFile = new URL('../frontend/kasse.html', import.meta.url);
const stamp = Date.now();

const dbBackup = new URL(`./data/db-before-final-stand-assortments-${stamp}.json`, import.meta.url);
const serverBackup = new URL(`./server-before-final-stand-assortments-${stamp}.js`, import.meta.url);
fs.copyFileSync(dbFile, dbBackup);
fs.copyFileSync(serverFile, serverBackup);
if (fs.existsSync(indexFile)) fs.copyFileSync(indexFile, new URL(`../frontend/index-before-final-stand-assortments-${stamp}.html`, import.meta.url));
if (fs.existsSync(kasseFile)) fs.copyFileSync(kasseFile, new URL(`../frontend/kasse-before-final-stand-assortments-${stamp}.html`, import.meta.url));

const d = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
d.users ||= [];
d.stands ||= [];
d.products ||= [];

const product = id => d.products.find(p => Number(p.id) === Number(id));
const stand = code => d.stands.find(s => String(s.code || '').toLowerCase() === String(code).toLowerCase());
const unique = arr => [...new Set(arr.map(Number))];

// ------------------------------------------------------------
// Final 2026 assortment definitions
// ------------------------------------------------------------
const kegBeerIds = [1, 2];
const bottledBeerIds = [3, 4, 5, 6, 7, 8, 9, 10, 11];
const allBeerIds = [...kegBeerIds, ...bottledBeerIds];

// Cola, Cola Zero, Fanta, Sprite in 0.2-l glass format.
const smallSoftIds = [12, 15, 18, 21];
// Presse also gets the existing 0.2-l Mezzo Mix product.
const pressSmallSoftIds = [12, 15, 18, 21, 24];
const toeftesIds = [27, 28, 29];

// 1-l softdrinks + 1-l water. Product 30/31 are corrected below from 0.75 l to 1 l.
const litreIds = [14, 17, 20, 23, 26, 30, 31, 32, 33];

const profiles = {
  vip: {
    profile: 'vip-all-beer-small-softdrinks-toeftes',
    ids: unique([...allBeerIds, ...smallSoftIds, ...toeftesIds])
  },
  helfer: {
    profile: 'helfer-1l-only',
    ids: unique(litreIds)
  },
  mitglieder: {
    profile: 'mitglieder-bottled-beer-small-softdrinks-toeftes',
    ids: unique([...bottledBeerIds, ...smallSoftIds, ...toeftesIds])
  },
  teilnehmer: {
    profile: 'teilnehmer-bottled-beer-and-1l',
    ids: unique([...bottledBeerIds, ...litreIds])
  },
  sponsorenzelt: {
    profile: 'sponsor-bottled-beer-small-softdrinks',
    ids: unique([...bottledBeerIds, ...smallSoftIds])
  },
  presse: {
    profile: 'presse-small-softdrinks-toeftes',
    ids: unique([...pressSmallSoftIds, ...toeftesIds])
  }
};

// ------------------------------------------------------------
// Product master data: make all explicitly allowed products orderable.
// ------------------------------------------------------------
const water30 = product(30);
if (water30) {
  water30.name = 'Salvus Classic Glas 1l';
  water30.package = '12 x 1 l Glas';
}
const water31 = product(31);
if (water31) {
  water31.name = 'Salvus Classic Sanft 1l';
  water31.package = '12 x 1 l Glas';
}

const allSpecialIds = unique(Object.values(profiles).flatMap(x => x.ids));
for (const id of allSpecialIds) {
  const p = product(id);
  if (p) p.orderEnabled = true;
}

// ------------------------------------------------------------
// Assign exact stand profiles.
// ------------------------------------------------------------
const missingStands = [];
for (const [code, cfg] of Object.entries(profiles)) {
  const s = stand(code);
  if (!s) {
    missingStands.push(code);
    continue;
  }
  s.orderProfile = cfg.profile;
  s.posEnabled = false;
}
if (missingStands.length) {
  throw new Error(`Diese Stände fehlen in db.json: ${missingStands.join(', ')}. Bitte vorher die Stand-Migrationen ausführen.`);
}

// Slushbude is renamed only by display/login name. Stable code 'slush' stays untouched,
// so historic orders/sales and all references continue to work.
const colaStand = stand('slush');
if (!colaStand) throw new Error("Stand mit Code 'slush' fehlt; Cola-Bude konnte nicht umbenannt werden.");
colaStand.name = 'Cola-Bude';
colaStand.posEnabled = true;
colaStand.posProfile = colaStand.posProfile || 'slush';

const oldSlushUser = d.users.find(u => String(u.username || '').toLowerCase() === 'slushbude');
let colaUser = d.users.find(u => String(u.username || '').toLowerCase() === 'cola-bude');
if (oldSlushUser && !colaUser) {
  oldSlushUser.username = 'Cola-Bude';
  oldSlushUser.role = 'bierbude';
  oldSlushUser.standort = 'slush';
  colaUser = oldSlushUser;
} else if (colaUser) {
  colaUser.role = 'bierbude';
  colaUser.standort = 'slush';
  if (oldSlushUser && oldSlushUser !== colaUser) {
    d.users = d.users.filter(u => u !== oldSlushUser);
  }
} else {
  const nextId = d.users.reduce((m, u) => Math.max(m, Number(u.id) || 0), 0) + 1;
  d.users.push({ id: nextId, username: 'Cola-Bude', password: 'bude123', role: 'bierbude', standort: 'slush' });
}

fs.writeFileSync(dbFile, JSON.stringify(d, null, 2));

// ------------------------------------------------------------
// Replace the entire ordering helper with one canonical implementation.
// This also restores canStandSellPosProduct, which older migration scripts could
// accidentally remove when replacing the neighboring function block.
// ------------------------------------------------------------
let server = fs.readFileSync(serverFile, 'utf8');
const start = server.indexOf('function canStandOrderProduct(stand, product) {');
const end = server.indexOf('function productForResponse(product, forBierbude = false) {');
if (start < 0 || end < 0 || end <= start) {
  throw new Error('Produkt-Sortimentsblock konnte in server.js nicht sicher gefunden werden.');
}

const replacement = `function canStandOrderProduct(stand, product) {
  if (!stand || !product || product.orderEnabled === false) return false;

  const profile = stand.orderProfile || null;
  const id = Number(product.id);
  const category = String(product.category || '').toLowerCase();

  const exact = {
    'vip-all-beer-small-softdrinks-toeftes': [1,2,3,4,5,6,7,8,9,10,11,12,15,18,21,27,28,29],
    'helfer-1l-only': [14,17,20,23,26,30,31,32,33],
    'mitglieder-bottled-beer-small-softdrinks-toeftes': [3,4,5,6,7,8,9,10,11,12,15,18,21,27,28,29],
    'teilnehmer-bottled-beer-and-1l': [3,4,5,6,7,8,9,10,11,14,17,20,23,26,30,31,32,33],
    'sponsor-bottled-beer-small-softdrinks': [3,4,5,6,7,8,9,10,11,12,15,18,21],
    'presse-small-softdrinks-toeftes': [12,15,18,21,24,27,28,29]
  };

  if (profile && exact[profile]) return exact[profile].includes(id);

  // Cola-Bude keeps the former Slushbude warehouse rule: no beer.
  if (stand.code === 'slush' && category.startsWith('bier')) return false;

  const wanted = stand.assortment || 'sales';
  const scope = product.orderScope || (product.isActive === false ? 'unassigned' : 'sales');
  return scope === 'both' || scope === wanted;
}

function canStandSellPosProduct(stand, pos) {
  if (!stand || !pos || pos.isActive === false) return false;
  const category = String(pos.category || '').trim().toLowerCase();
  const isBeer = category.includes('bier');
  const isSlush = category === 'slush';
  // Code remains 'slush' for backwards compatibility even though the stand is now Cola-Bude.
  if (stand.code === 'slush' || stand.posProfile === 'slush') return !isBeer;
  return !isSlush;
}
`;

server = server.slice(0, start) + replacement + server.slice(end);

// Ensure the stand DTO exposes the profile for admin diagnostics/UI if it did not already.
if (!server.includes('orderProfile: s.orderProfile || null')) {
  const oldDto = `  return { id: s.id, name: s.name, code: s.code, type: s.type || 'sales', assortment: s.assortment || 'sales', posEnabled: s.posEnabled !== false };`;
  const newDto = `  return { id: s.id, name: s.name, code: s.code, type: s.type || 'sales', assortment: s.assortment || 'sales', posEnabled: s.posEnabled !== false, orderProfile: s.orderProfile || null };`;
  if (server.includes(oldDto)) server = server.replace(oldDto, newDto);
}

// If this server has not yet been made stand-aware for admin product lists, patch the original route.
if (!server.includes('/* admin stand-aware product list */')) {
  const oldProductsRoute = `app.get('/api/products', authenticateToken, (req, res) => {\n  if (req.user.role === 'bierbude') {\n    const stand = standForUser(req.user);\n    return res.json(db.products.filter(p => canStandOrderProduct(stand, p)).map(p => productForResponse(p, true)));\n  }\n  res.json(db.products.map(p => productForResponse(p, false)));\n});`;
  const newProductsRoute = `app.get('/api/products', authenticateToken, (req, res) => {\n  /* admin stand-aware product list */\n  let stand = null;\n  if (req.user.role === 'bierbude') {\n    stand = standForUser(req.user);\n  } else if (req.user.role === 'admin') {\n    const raw = req.headers['x-impersonate-stand'] || req.query.standId || req.query.standort;\n    if (raw) stand = findStand(raw);\n  }\n  if (stand) return res.json(db.products.filter(p => canStandOrderProduct(stand, p)).map(p => productForResponse(p, true)));\n  res.json(db.products.map(p => productForResponse(p, false)));\n});`;
  if (server.includes(oldProductsRoute)) server = server.replace(oldProductsRoute, newProductsRoute);
}

fs.writeFileSync(serverFile, server);

// Rename stale static labels in frontend source. Dynamic selectors already use /api/stands.
for (const file of [indexFile, kasseFile]) {
  if (!fs.existsSync(file)) continue;
  let html = fs.readFileSync(file, 'utf8');
  html = html.replaceAll('Slushbude', 'Cola-Bude');
  fs.writeFileSync(file, html);
}

const names = ids => ids.map(id => product(id)?.name || `Produkt ${id}`);
for (const [code, cfg] of Object.entries(profiles)) {
  console.log(`\n${stand(code)?.name || code}:`);
  console.table(names(cfg.ids).map(Produkt => ({ Produkt })));
}
console.log('\nCola-Bude: bisherige Slushbude umbenannt; Stand-Code slush und Historie bleiben erhalten.');
console.log('Login wurde von Slushbude auf Cola-Bude umbenannt; bestehendes Passwort bleibt erhalten.');
console.log(`\nDB-Backup: ${dbBackup.pathname}`);
console.log(`Server-Backup: ${serverBackup.pathname}`);
