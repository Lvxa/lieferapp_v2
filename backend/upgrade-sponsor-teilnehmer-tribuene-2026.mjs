import fs from 'fs';

const dbFile = new URL('./data/db.json', import.meta.url);
const serverFile = new URL('./server.js', import.meta.url);
const indexFile = new URL('../frontend/index.html', import.meta.url);
const stamp = Date.now();

const dbBackup = new URL(`./data/db-before-sponsor-teilnehmer-tribuene-${stamp}.json`, import.meta.url);
const serverBackup = new URL(`./server-before-sponsor-teilnehmer-tribuene-${stamp}.js`, import.meta.url);
const indexBackup = new URL(`../frontend/index-before-sponsor-teilnehmer-tribuene-${stamp}.html`, import.meta.url);

const d = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
fs.copyFileSync(dbFile, dbBackup);
fs.copyFileSync(serverFile, serverBackup);
if (fs.existsSync(indexFile)) fs.copyFileSync(indexFile, indexBackup);

d.users ||= [];
d.stands ||= [];
d.products ||= [];

const nextId = arr => arr.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;

function upsertStand(data) {
  let stand = d.stands.find(s => String(s.code || '').toLowerCase() === String(data.code).toLowerCase());
  if (!stand) {
    stand = { id: nextId(d.stands), ...data };
    d.stands.push(stand);
  } else {
    Object.assign(stand, data);
  }
  return stand;
}

function ensureUser(username, standort) {
  let user = d.users.find(u => String(u.username || '').toLowerCase() === username.toLowerCase());
  if (!user) {
    user = {
      id: nextId(d.users),
      username,
      password: 'bude123',
      role: 'bierbude',
      standort
    };
    d.users.push(user);
  } else {
    user.username = username;
    user.role = 'bierbude';
    user.standort = standort;
  }
  return user;
}

// Schlossplatz wird nur namentlich umbenannt. Der stabile Code bude1 bleibt erhalten,
// damit bestehende Bestellungen, Bewegungen und Auswertungen weiter funktionieren.
let tribuene = d.stands.find(s => s.code === 'bude1') || d.stands.find(s => s.name === 'Schlossplatz') || d.stands.find(s => s.name === 'Tribüne');
if (tribuene) {
  tribuene.code = tribuene.code || 'bude1';
  tribuene.name = 'Tribüne';
} else {
  tribuene = upsertStand({ code: 'bude1', name: 'Tribüne', type: 'sales', assortment: 'sales', posEnabled: true });
}

const oldSchlossUser = d.users.find(u => u.username === 'Schlossplatz');
const existingTribueneUser = d.users.find(u => u.username === 'Tribüne');
if (oldSchlossUser && !existingTribueneUser) {
  oldSchlossUser.username = 'Tribüne';
  oldSchlossUser.role = 'bierbude';
  oldSchlossUser.standort = 'bude1';
} else if (existingTribueneUser) {
  existingTribueneUser.role = 'bierbude';
  existingTribueneUser.standort = 'bude1';
} else {
  ensureUser('Tribüne', 'bude1');
}

// Sponsorenzelt: exakt die sieben vom Nutzer genannten kleinen Getränke, keine Kasse.
upsertStand({
  code: 'sponsorenzelt',
  name: 'Sponsorenzelt',
  type: 'sponsor',
  assortment: 'sponsor',
  posEnabled: false,
  orderProfile: 'sponsor-small-softdrinks'
});
ensureUser('Sponsorenzelt', 'sponsorenzelt');

// Teilnehmerzelt: sämtliches Bier + ausschließlich 1-l-Ware aus dem übrigen Sortiment, keine Kasse.
upsertStand({
  code: 'teilnehmer',
  name: 'Teilnehmerzelt',
  type: 'sponsor',
  assortment: 'sponsor',
  posEnabled: false,
  orderProfile: 'teilnehmer-beer-and-1l'
});
ensureUser('Teilnehmerzelt', 'teilnehmer');

const sponsorSmallIds = new Set([13, 16, 19, 22, 27, 28, 29]);
function isBeerProduct(p) {
  return String(p.category || '').toLowerCase().startsWith('bier');
}
function isOneLiterProduct(p) {
  return /\b1\s*l\b/i.test(`${p.name || ''} ${p.package || ''}`);
}

// Sonderprofile sollen ihre vorgesehenen Produkte auch dann bestellen können,
// wenn diese im allgemeinen Sortiment bisher nicht bestellbar waren.
for (const p of d.products) {
  if (sponsorSmallIds.has(Number(p.id)) || isBeerProduct(p) || isOneLiterProduct(p)) {
    p.orderEnabled = true;
  }
}

fs.writeFileSync(dbFile, JSON.stringify(d, null, 2));

let server = fs.readFileSync(serverFile, 'utf8');

// Expose profile for diagnostics/admin UI. Existing consumers ignore the extra field.
if (!server.includes('orderProfile: s.orderProfile || null')) {
  const oldStandDto = `  return { id: s.id, name: s.name, code: s.code, type: s.type || 'sales', assortment: s.assortment || 'sales', posEnabled: s.posEnabled !== false };`;
  const newStandDto = `  return { id: s.id, name: s.name, code: s.code, type: s.type || 'sales', assortment: s.assortment || 'sales', posEnabled: s.posEnabled !== false, orderProfile: s.orderProfile || null };`;
  if (server.includes(oldStandDto)) server = server.replace(oldStandDto, newStandDto);
}

// Stand-specific assortment rules. This is enforced for both product listing and order creation.
if (!server.includes('/* 2026 special tent order profiles */')) {
  const needle = `function canStandOrderProduct(stand, product) {\n  if (!stand || !product || product.orderEnabled === false) return false;\n`;
  const replacement = `function canStandOrderProduct(stand, product) {\n  if (!stand || !product || product.orderEnabled === false) return false;\n  /* 2026 special tent order profiles */\n  const profile = stand.orderProfile || null;\n  if (profile === 'sponsor-small-softdrinks') {\n    return [13, 16, 19, 22, 27, 28, 29].includes(Number(product.id));\n  }\n  if (profile === 'teilnehmer-beer-and-1l') {\n    const category = String(product.category || '').toLowerCase();\n    const text = \\`${'${product.name || \'\'} ${product.package || \'\'}'}\\`;\n    return category.startsWith('bier') || /\\b1\\s*l\\b/i.test(text);\n  }\n`;
  if (!server.includes(needle)) throw new Error('canStandOrderProduct-Start nicht gefunden; server.js wurde nicht verändert.');
  server = server.replace(needle, replacement);
}

// When an admin supplies stand context, return the same filtered product list the stand itself sees.
if (!server.includes('/* admin stand-aware product list */')) {
  const oldProductsRoute = `app.get('/api/products', authenticateToken, (req, res) => {\n  if (req.user.role === 'bierbude') {\n    const stand = standForUser(req.user);\n    return res.json(db.products.filter(p => canStandOrderProduct(stand, p)).map(p => productForResponse(p, true)));\n  }\n  res.json(db.products.map(p => productForResponse(p, false)));\n});`;
  const newProductsRoute = `app.get('/api/products', authenticateToken, (req, res) => {\n  /* admin stand-aware product list */\n  let stand = null;\n  if (req.user.role === 'bierbude') {\n    stand = standForUser(req.user);\n  } else if (req.user.role === 'admin') {\n    const raw = req.headers['x-impersonate-stand'] || req.query.standId || req.query.standort;\n    if (raw) stand = findStand(raw);\n  }\n  if (stand) return res.json(db.products.filter(p => canStandOrderProduct(stand, p)).map(p => productForResponse(p, true)));\n  res.json(db.products.map(p => productForResponse(p, false)));\n});`;
  if (server.includes(oldProductsRoute)) server = server.replace(oldProductsRoute, newProductsRoute);
}

fs.writeFileSync(serverFile, server);

// Rename visible static labels/login hints in the local frontend source. Dynamic stand lists come from /api/stands.
if (fs.existsSync(indexFile)) {
  let index = fs.readFileSync(indexFile, 'utf8');
  index = index.replaceAll('Schlossplatz', 'Tribüne');
  fs.writeFileSync(indexFile, index);
}

const sponsorProducts = d.products.filter(p => sponsorSmallIds.has(Number(p.id))).map(p => p.name);
const participantProducts = d.products.filter(p => isBeerProduct(p) || isOneLiterProduct(p)).map(p => p.name);

console.log(`DB-Backup: ${dbBackup.pathname}`);
console.log(`Server-Backup: ${serverBackup.pathname}`);
console.log('Tribüne: bisheriger Schlossplatz, Code bude1 bleibt erhalten.');
console.log('Login Tribüne: vorhandenes Schlossplatz-Passwort bleibt erhalten (bei Neuanlage bude123).');
console.log('Login Sponsorenzelt: Sponsorenzelt / bude123 (bei Neuanlage).');
console.log('Login Teilnehmerzelt: Teilnehmerzelt / bude123 (bei Neuanlage).');
console.log('\nSponsorenzelt darf bestellen:');
console.table(sponsorProducts.map(name => ({ Produkt: name })));
console.log('\nTeilnehmerzelt darf bestellen:');
console.table(participantProducts.map(name => ({ Produkt: name })));
console.log(`\nStände gesamt: ${d.stands.length}, Nutzer gesamt: ${d.users.length}`);
