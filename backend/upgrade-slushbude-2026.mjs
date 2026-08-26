import fs from 'fs';

const dbFile = new URL('./data/db.json', import.meta.url);
const serverFile = new URL('./server.js', import.meta.url);
const stamp = Date.now();
const dbBackup = new URL(`./data/db-before-slushbude-${stamp}.json`, import.meta.url);
const serverBackup = new URL(`./server-before-slushbude-${stamp}.js`, import.meta.url);

const d = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
fs.copyFileSync(dbFile, dbBackup);
fs.copyFileSync(serverFile, serverBackup);

d.users ||= [];
d.stands ||= [];

const nextId = arr => arr.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;

function upsertStand(data) {
  let s = d.stands.find(x => x.code === data.code || x.name === data.name);
  if (!s) {
    s = { id: nextId(d.stands), ...data };
    d.stands.push(s);
  } else {
    Object.assign(s, data);
  }
  return s;
}

function ensureUser(username, role, standort, password) {
  let u = d.users.find(x => x.username === username);
  if (!u) {
    u = { id: nextId(d.users), username, role, standort };
    d.users.push(u);
  }
  u.role = role;
  u.standort = standort;
  u.password = password;
  delete u.passwordHash;
  return u;
}

upsertStand({
  code: 'slush',
  name: 'Slushbude',
  type: 'sales',
  assortment: 'sales',
  posEnabled: true,
  posProfile: 'slush'
});
ensureUser('Slushbude', 'bierbude', 'slush', 'bude123');

fs.writeFileSync(dbFile, JSON.stringify(d, null, 2));

let server = fs.readFileSync(serverFile, 'utf8');

// 1) Slushbude darf im Lager keine Bierprodukte bestellen.
if (!server.includes("stand.code === 'slush' && String(product.category || '').toLowerCase().startsWith('bier')")) {
  const oldCanOrder = `function canStandOrderProduct(stand, product) {\n  if (!stand || !product || product.orderEnabled === false) return false;\n  const wanted = stand.assortment || 'sales';\n  const scope = product.orderScope || (product.isActive === false ? 'unassigned' : 'sales');\n  return scope === 'both' || scope === wanted;\n}`;
  const newCanOrder = `function canStandOrderProduct(stand, product) {\n  if (!stand || !product || product.orderEnabled === false) return false;\n  if (stand.code === 'slush' && String(product.category || '').toLowerCase().startsWith('bier')) return false;\n  const wanted = stand.assortment || 'sales';\n  const scope = product.orderScope || (product.isActive === false ? 'unassigned' : 'sales');\n  return scope === 'both' || scope === wanted;\n}`;
  if (!server.includes(oldCanOrder)) throw new Error('canStandOrderProduct-Block nicht gefunden; server.js wurde nicht verändert.');
  server = server.replace(oldCanOrder, newCanOrder);
}

// 2) Kassensortiment pro Stand: Slush nur Slushbude; Slushbude ohne jede Bier-Kategorie.
if (!server.includes('function canStandSellPosProduct(stand, pos)')) {
  const marker = `function productForResponse(product, forBierbude = false) {`;
  const helper = `function canStandSellPosProduct(stand, pos) {\n  if (!stand || !pos || pos.isActive === false) return false;\n  const category = String(pos.category || '').trim().toLowerCase();\n  const isBeer = category.includes('bier');\n  const isSlush = category === 'slush';\n  if (stand.code === 'slush' || stand.posProfile === 'slush') return !isBeer;\n  return !isSlush;\n}\n`;
  if (!server.includes(marker)) throw new Error('productForResponse-Marker nicht gefunden; server.js wurde nicht verändert.');
  server = server.replace(marker, helper + marker);
}

const oldPosGet = `app.get('/api/pos/products', authenticateToken, (req, res) => {\n  if (!['bierbude', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });\n  if (req.user.role === 'bierbude') {\n    const stand = standForUser(req.user);\n    if (!stand || stand.posEnabled === false) return res.status(403).json({ error: 'Für diesen Standort ist kein Kassensystem aktiviert.' });\n  }\n  res.json(db.posProducts.filter(p => p.isActive !== false));\n});`;

const newPosGet = `app.get('/api/pos/products', authenticateToken, (req, res) => {\n  if (!['bierbude', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });\n  let rows = db.posProducts.filter(p => p.isActive !== false);\n  if (req.user.role === 'bierbude') {\n    const stand = standForUser(req.user);\n    if (!stand || stand.posEnabled === false) return res.status(403).json({ error: 'Für diesen Standort ist kein Kassensystem aktiviert.' });\n    rows = rows.filter(p => canStandSellPosProduct(stand, p));\n  } else {\n    const raw = req.query.standId || req.query.standort;\n    const stand = raw ? findStand(raw) : null;\n    if (stand) rows = rows.filter(p => canStandSellPosProduct(stand, p));\n  }\n  res.json(rows);\n});`;

if (server.includes(oldPosGet)) {
  server = server.replace(oldPosGet, newPosGet);
} else if (!server.includes("rows = rows.filter(p => canStandSellPosProduct(stand, p))")) {
  throw new Error('/api/pos/products-Block nicht in erwarteter Form gefunden; server.js wurde nicht verändert.');
}

const saleNeedle = `    if (!pos || pos.isActive === false) return res.status(400).json({ error: \`Unknown POS product \${raw.posProductId ?? raw.id}\` });\n    if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: 'Invalid sale quantity' });`;
const saleReplacement = `    if (!pos || pos.isActive === false) return res.status(400).json({ error: \`Unknown POS product \${raw.posProductId ?? raw.id}\` });\n    if (!canStandSellPosProduct(stand, pos)) return res.status(400).json({ error: \`\${pos.name} darf an \${stand.name} nicht verkauft werden.\` });\n    if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: 'Invalid sale quantity' });`;

if (!server.includes('darf an ${stand.name} nicht verkauft werden')) {
  if (!server.includes(saleNeedle)) throw new Error('Sale-Prüfung nicht gefunden; server.js wurde nicht verändert.');
  server = server.replace(saleNeedle, saleReplacement);
}

fs.writeFileSync(serverFile, server);

console.log(`DB-Backup: ${dbBackup.pathname}`);
console.log(`Server-Backup: ${serverBackup.pathname}`);
console.log('Slushbude angelegt: Kasse ja, Lager-Sortiment sales, Bier in Bestellung gesperrt.');
console.log('Kasse: Slush/Frozen Aperol nur Slushbude; Slushbude sieht keine Bier-/alkoholfreien Bierartikel.');
console.log('Login: Slushbude / bude123');
console.log(`Stände gesamt: ${d.stands.length}, Nutzer gesamt: ${d.users.length}`);
