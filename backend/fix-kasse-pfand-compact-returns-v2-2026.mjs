import fs from 'fs';

const dbFile = new URL('./data/db.json', import.meta.url);
const serverFile = new URL('./server.js', import.meta.url);
const kasseFile = new URL('../frontend/kasse.html', import.meta.url);
const stamp = Date.now();

fs.copyFileSync(dbFile, new URL(`./data/db-before-kasse-v2-${stamp}.json`, import.meta.url));
fs.copyFileSync(serverFile, new URL(`./server-before-kasse-v2-${stamp}.js`, import.meta.url));
fs.copyFileSync(kasseFile, new URL(`../frontend/kasse-before-v2-${stamp}.html`, import.meta.url));

// --- DB: glass/cup deposit = 2 EUR ---
const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
db.posProducts ||= [];
let depositChanged = 0;
for (const p of db.posProducts) {
  const type = String(p.depositType || '').toLowerCase();
  if ((type === 'glass' || type === 'cup' || type === 'glas') && Number(p.depositPrice) !== 2) {
    p.depositPrice = 2;
    depositChanged++;
  }
}
fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));

// --- FRONTEND ---
let html = fs.readFileSync(kasseFile, 'utf8');

// Compact CSS via marker override, independent of earlier CSS state.
if (!html.includes('/* kasse-compact-v2 */')) {
  html = html.replace('</style>', `
/* kasse-compact-v2 */
.grid{gap:7px!important;grid-template-columns:repeat(2,minmax(0,1fr))!important}
.product{min-height:76px!important;border-radius:11px!important;padding:9px 10px!important;box-shadow:0 1px 5px #0001!important}
.product .name{font-size:13px!important;line-height:1.08!important;padding-right:23px!important}
.product .unit{font-size:10px!important;margin-top:2px!important}
.product .price{font-size:16px!important;margin-top:4px!important}
.product .pfand{font-size:9px!important;line-height:1.1!important;margin-top:1px!important}
.plus{right:7px!important;top:7px!important;width:23px!important;height:23px!important;font-size:16px!important}
@media(min-width:700px){.grid{grid-template-columns:repeat(5,minmax(0,1fr))!important}}
</style>`);
}

// Enable save when either products OR returns exist.
html = html.replace(/document\.getElementById\(['"]saveBtn['"]\)\.disabled\s*=\s*[^;]+/g,
  "document.getElementById('saveBtn').disabled=(cart.size===0&&returns.bottle===0&&returns.glass===0)");

// Replace saveSale wholesale so deposit-only works for sure.
html = html.replace(/async function saveSale\(\)\{[\s\S]*?\}\nboot\(\);/, `async function saveSale(){
  if(!cart.size && returns.bottle===0 && returns.glass===0) return;
  const body={
    items:[...cart.entries()].map(([posProductId,quantity])=>({posProductId,quantity})),
    depositReturns:returns
  };
  if(user.role==='admin'){
    const s=document.getElementById('adminStand').value;
    if(!s){toast('Bitte zuerst eine Bude auswählen.','error');return}
    body.standort=s;
  }
  try{
    const sale=await call('/sales',{method:'POST',body:JSON.stringify(body)});
    toast(\`Vorgang #\${sale.id} · \${euro(sale.total)}\`);
    clearCart();
  }catch(e){toast(e.message,'error')}
}
boot();`);

if (!html.includes('kasse-compact-v2')) throw new Error('Kompakt-Layout konnte nicht injiziert werden.');
if (!html.includes("returns.bottle===0&&returns.glass===0")) throw new Error('Pfandrückgabe-Buttonlogik wurde nicht aktualisiert.');
fs.writeFileSync(kasseFile, html);

// --- BACKEND ---
let server = fs.readFileSync(serverFile, 'utf8');
const salesStart = server.indexOf("app.post('/api/sales'");
if (salesStart < 0) throw new Error('POST /api/sales nicht gefunden.');
const nextRoute = server.indexOf("app.get('/api/sales'", salesStart);
const salesEnd = nextRoute > salesStart ? nextRoute : server.indexOf('\napp.', salesStart + 20);
if (salesEnd < 0) throw new Error('Ende der Sales-Route nicht gefunden.');

let block = server.slice(salesStart, salesEnd);

// Make rawItems validation accept [] but not missing/non-array.
block = block.replace(/if\s*\(!Array\.isArray\(rawItems\)\s*\|\|\s*!rawItems\.length\)[^;]*;/g,
  "if (!Array.isArray(rawItems)) return res.status(400).json({ error: 'Items must be an array' });");

// If no explicit depositReturns parsing exists, inject directly after rawItems.
if (!/const\s+depositReturns\s*=/.test(block)) {
  block = block.replace(/const\s+rawItems\s*=\s*req\.body\?\.items\s*;/,
    m => m + "\n  const depositReturns = req.body?.depositReturns || {};\n  const returnBottle = Math.max(0, Number(depositReturns.bottle) || 0);\n  const returnGlass = Math.max(0, Number(depositReturns.glass) || 0);");
}

// Normalize any later return calculation to the same values.
block = block.replace(/const\s+returned\s*=\s*[^;]+;/g,
  'const returned = returnBottle * 1 + returnGlass * 2;');

// Add guard: empty sale only invalid if there are no returns either.
if (!block.includes('Sale must contain items or deposit returns')) {
  const validationAnchor = "if (!Array.isArray(rawItems)) return res.status(400).json({ error: 'Items must be an array' });";
  if (!block.includes(validationAnchor)) throw new Error('Items-Validierung konnte nicht normiert werden.');
  block = block.replace(validationAnchor, validationAnchor + "\n  if (!rawItems.length && returnBottle === 0 && returnGlass === 0) return res.status(400).json({ error: 'Sale must contain items or deposit returns' });");
}

// Some old implementations still have another `if (!rawItems.length)` guard.
block = block.replace(/\n\s*if\s*\(!rawItems\.length\)[^;]*;/g, '');

server = server.slice(0, salesStart) + block + server.slice(salesEnd);
fs.writeFileSync(serverFile, server);

// Self-test source text.
const checkHtml = fs.readFileSync(kasseFile, 'utf8');
const checkServer = fs.readFileSync(serverFile, 'utf8');
if (!checkHtml.includes('kasse-compact-v2')) throw new Error('SELFTEST: compact marker missing');
if (!checkHtml.includes("cart.size===0&&returns.bottle===0&&returns.glass===0")) throw new Error('SELFTEST: return-only frontend missing');
if (!checkServer.includes('Sale must contain items or deposit returns')) throw new Error('SELFTEST: return-only backend missing');

console.log(`Glas-/Becherpfand auf 2,00 EUR korrigiert: ${depositChanged} POS-Produkte`);
console.log('Kassenlayout V2: kompakt aktiv.');
console.log('Reine Pfandrückgabe: Frontend + Backend aktiv.');
console.log('SELFTEST OK');
