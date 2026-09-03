import fs from 'fs';

const dbFile = new URL('./data/db.json', import.meta.url);
const serverFile = new URL('./server.js', import.meta.url);
const kasseFile = new URL('../frontend/kasse.html', import.meta.url);
const stamp = Date.now();

fs.copyFileSync(dbFile, new URL(`./data/db-before-kasse-safe-v3-${stamp}.json`, import.meta.url));
fs.copyFileSync(serverFile, new URL(`./server-before-kasse-safe-v3-${stamp}.js`, import.meta.url));
fs.copyFileSync(kasseFile, new URL(`../frontend/kasse-before-safe-v3-${stamp}.html`, import.meta.url));

// 1) POS-Daten: Glas/Becher immer 2 EUR Pfand.
const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
db.posProducts ||= [];
let changed = 0;
for (const p of db.posProducts) {
  const t = String(p.depositType || '').toLowerCase();
  if (['glass','glas','cup'].includes(t) && Number(p.depositPrice) !== 2) {
    p.depositPrice = 2;
    changed++;
  }
}
fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));

// 2) Backend: eigene Route NUR für reine Pfandrückgabe. Bestehende /api/sales-Route bleibt unangetastet.
let server = fs.readFileSync(serverFile, 'utf8');
const backendMarker = '/* deposit-return-only-safe-v3 */';
if (!server.includes(backendMarker)) {
  const anchor = "app.post('/api/sales', authenticateToken";
  const pos = server.indexOf(anchor);
  if (pos < 0) throw new Error('POST /api/sales nicht gefunden. Es wurde nichts am Server verändert.');

  const route = `${backendMarker}\napp.post('/api/sales/deposit-return', authenticateToken, (req, res) => {\n  if (!['bierbude', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });\n  const standort = resolveTargetStand(req);\n  const stand = findStand(standort);\n  if (!standort) return res.status(400).json({ error: 'No stand context' });\n  if (!stand || stand.posEnabled === false) return res.status(403).json({ error: 'Für diesen Standort ist kein Kassensystem aktiviert.' });\n\n  const depositReturns = req.body?.depositReturns || {};\n  const bottle = Math.max(0, Number(depositReturns.bottle) || 0);\n  const glass = Math.max(0, Number(depositReturns.glass) || 0);\n  if (bottle === 0 && glass === 0) return res.status(400).json({ error: 'Keine Pfandrückgabe angegeben.' });\n\n  const returned = money(bottle * 1 + glass * 2);\n  const now = new Date().toISOString();\n  const sale = {\n    id: nextId(db.sales),\n    standort: stand.code,\n    items: [],\n    drinksTotal: 0,\n    depositCharged: 0,\n    depositReturned: returned,\n    depositReturns: { bottle, glass },\n    total: money(-returned),\n    createdBy: req.user.username,\n    createdAt: now\n  };\n  db.sales.push(sale);\n  saveDB();\n  res.json(sale);\n});\n\n`;

  server = server.slice(0, pos) + route + server.slice(pos);
}
fs.writeFileSync(serverFile, server);

// 3) Frontend: nur CSS + sichere Wrapper. Keine existierenden Funktionen werden ersetzt.
let html = fs.readFileSync(kasseFile, 'utf8');
const cssMarker = '/* kasse-safe-compact-v3 */';
if (!html.includes(cssMarker)) {
  const css = `\n${cssMarker}\n.grid{gap:7px!important}\n.product{min-height:78px!important;padding:9px 10px!important;border-radius:11px!important}\n.product .name{font-size:13px!important;line-height:1.1!important;padding-right:24px!important}\n.product .unit{font-size:10px!important;margin-top:2px!important}\n.product .price{font-size:16px!important;margin-top:4px!important}\n.product .pfand{font-size:9px!important;line-height:1.1!important}\n.plus{width:24px!important;height:24px!important;font-size:17px!important;right:7px!important;top:7px!important}\n@media(min-width:700px){.grid{grid-template-columns:repeat(5,minmax(0,1fr))!important}}\n`;
  const styleEnd = html.indexOf('</style>');
  if (styleEnd < 0) throw new Error('</style> in kasse.html nicht gefunden.');
  html = html.slice(0, styleEnd) + css + html.slice(styleEnd);
}

const jsMarker = '/* kasse-safe-return-wrapper-v3 */';
if (!html.includes(jsMarker)) {
  const bootAnchor = '\nboot();';
  const bootPos = html.lastIndexOf(bootAnchor);
  if (bootPos < 0) throw new Error('boot(); in kasse.html nicht gefunden.');

  const wrapper = `\n${jsMarker}\nconst __renderCartOriginalV3 = renderCart;\nrenderCart = function(){\n  __renderCartOriginalV3();\n  const btn = document.getElementById('saveBtn');\n  if (btn) btn.disabled = (cart.size===0 && returns.bottle===0 && returns.glass===0);\n};\n\nconst __saveSaleOriginalV3 = saveSale;\nsaveSale = async function(){\n  const onlyReturns = cart.size===0 && (returns.bottle>0 || returns.glass>0);\n  if (!onlyReturns) return __saveSaleOriginalV3();\n\n  const body = { depositReturns: { bottle: returns.bottle, glass: returns.glass } };\n  if (user.role==='admin') {\n    const s = document.getElementById('adminStand').value;\n    if (!s) { toast('Bitte zuerst eine Bude auswählen.','error'); return; }\n    body.standort = s;\n  }\n\n  try {\n    const sale = await call('/sales/deposit-return', { method:'POST', body:JSON.stringify(body) });\n    toast(\`Pfandrückgabe #\${sale.id} · \${euro(sale.total)}\`);\n    clearCart();\n  } catch(e) {\n    toast(e.message,'error');\n  }\n};\n`;

  html = html.slice(0, bootPos) + wrapper + html.slice(bootPos);
}

fs.writeFileSync(kasseFile, html);

// Selbsttest: nur Marker und Syntaxanker prüfen, keine weiteren Umbauten.
const checkServer = fs.readFileSync(serverFile, 'utf8');
const checkHtml = fs.readFileSync(kasseFile, 'utf8');
if (!checkServer.includes(backendMarker) || !checkServer.includes("/api/sales/deposit-return")) throw new Error('SELFTEST Backend fehlgeschlagen');
if (!checkHtml.includes(cssMarker) || !checkHtml.includes(jsMarker)) throw new Error('SELFTEST Frontend fehlgeschlagen');
if (!checkHtml.includes('__renderCartOriginalV3') || !checkHtml.includes('__saveSaleOriginalV3')) throw new Error('SELFTEST Wrapper fehlen');

console.log(`Glas-/Becherpfand korrigiert: ${changed} POS-Produkte`);
console.log('Kassenlayout kompakter: aktiv');
console.log('Reine Pfandrückgabe über separate Route: aktiv');
console.log('Bestehende /api/sales-Route: NICHT verändert');
console.log('SELFTEST OK');
