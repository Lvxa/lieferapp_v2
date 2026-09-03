import fs from 'fs';

const dbFile = new URL('./data/db.json', import.meta.url);
const serverFile = new URL('./server.js', import.meta.url);
const kasseFile = new URL('../frontend/kasse.html', import.meta.url);
const stamp = Date.now();

fs.copyFileSync(dbFile, new URL(`./data/db-before-kasse-pfand-${stamp}.json`, import.meta.url));
fs.copyFileSync(serverFile, new URL(`./server-before-kasse-pfand-${stamp}.js`, import.meta.url));
fs.copyFileSync(kasseFile, new URL(`../frontend/kasse-before-pfand-${stamp}.html`, import.meta.url));

// 1) Glaspfand zentral auf 2 EUR setzen.
const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
db.posProducts ||= [];
let glassChanged = 0;
for (const p of db.posProducts) {
  if (String(p.depositType || '').toLowerCase() === 'glass' && Number(p.depositPrice) !== 2) {
    p.depositPrice = 2;
    glassChanged++;
  }
}
fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));

// 2) Backend: reine Pfandrückgabe ohne Artikel erlauben.
let server = fs.readFileSync(serverFile, 'utf8');

// rawItems muss ein Array sein, darf aber leer sein, wenn Pfand zurückgegeben wird.
const oldValidation = /if \(!Array\.isArray\(rawItems\) \|\| !rawItems\.length\) return res\.status\(400\)\.json\(\{ error: ['\"]([^'\"]*)['\"] \}\);/;
if (oldValidation.test(server)) {
  server = server.replace(oldValidation, `if (!Array.isArray(rawItems)) return res.status(400).json({ error: 'Items must be an array' });\n  const depositReturns = req.body?.depositReturns || {};\n  const returnBottle = Math.max(0, Number(depositReturns.bottle) || 0);\n  const returnGlass = Math.max(0, Number(depositReturns.glass) || 0);\n  if (!rawItems.length && returnBottle === 0 && returnGlass === 0) return res.status(400).json({ error: 'Sale must contain items or deposit returns' });`);
} else if (!server.includes("Sale must contain items or deposit returns")) {
  // Alternative, falls der aktuelle Live-Server eine leicht andere Fehlermeldung verwendet.
  const anchor = `  const rawItems = req.body?.items;`;
  if (!server.includes(anchor)) throw new Error('Sales-Route: rawItems-Anker nicht gefunden. server.js blieb unverändert.');
  server = server.replace(anchor, `${anchor}\n  const depositReturns = req.body?.depositReturns || {};\n  const returnBottle = Math.max(0, Number(depositReturns.bottle) || 0);\n  const returnGlass = Math.max(0, Number(depositReturns.glass) || 0);`);
  server = server.replace(/\n\s*if \(!Array\.isArray\(rawItems\)[^\n]*\n/, `\n  if (!Array.isArray(rawItems)) return res.status(400).json({ error: 'Items must be an array' });\n  if (!rawItems.length && returnBottle === 0 && returnGlass === 0) return res.status(400).json({ error: 'Sale must contain items or deposit returns' });\n`);
}

// Falls die Route depositReturns später noch einmal deklariert, Doppeldefinition vermeiden.
server = server.replace(/\n\s*const depositReturns = req\.body\?\.depositReturns \|\| \{\};\n(?!\s*const returnBottle)/g, '\n');

fs.writeFileSync(serverFile, server);

// 3) Frontend kompakter + reine Pfandrückgabe speicherbar.
let html = fs.readFileSync(kasseFile, 'utf8');

html = html.replace(
  '.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}',
  '.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}'
);
html = html.replace(
  '.product{min-height:104px;border:0;border-radius:16px;background:#fff;padding:14px;text-align:left;box-shadow:0 2px 10px #0001;position:relative}',
  '.product{min-height:82px;border:0;border-radius:12px;background:#fff;padding:10px 11px;text-align:left;box-shadow:0 1px 6px #0001;position:relative}'
);
html = html.replace(
  '.product .name{font-weight:850;font-size:16px;line-height:1.15;padding-right:28px}',
  '.product .name{font-weight:850;font-size:14px;line-height:1.12;padding-right:25px}'
);
html = html.replace(
  '.product .unit{font-size:12px;color:#6b7280;margin-top:5px}',
  '.product .unit{font-size:11px;color:#6b7280;margin-top:3px}'
);
html = html.replace(
  '.product .price{font-size:20px;font-weight:900;margin-top:9px}',
  '.product .price{font-size:17px;font-weight:900;margin-top:5px}'
);
html = html.replace(
  '.product .pfand{font-size:11px;color:#6b7280}',
  '.product .pfand{font-size:10px;color:#6b7280;line-height:1.15}'
);
html = html.replace(
  '.plus{position:absolute;right:10px;top:10px;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:#111827;color:#fff;font-size:22px;font-weight:900}',
  '.plus{position:absolute;right:8px;top:8px;width:25px;height:25px;border-radius:50%;display:grid;place-items:center;background:#111827;color:#fff;font-size:18px;font-weight:900}'
);
html = html.replace(
  '@media(min-width:700px){.grid{grid-template-columns:repeat(4,minmax(0,1fr))}',
  '@media(min-width:700px){.grid{grid-template-columns:repeat(5,minmax(0,1fr))}'
);

// Save-Button aktivieren, sobald Ware ODER Pfandrückgabe vorhanden ist.
html = html.replace(
  "document.getElementById('saveBtn').disabled=cart.size===0",
  "document.getElementById('saveBtn').disabled=cart.size===0&&returns.bottle===0&&returns.glass===0"
);

// saveSale nicht mehr abbrechen, wenn nur Pfand zurückkommt.
html = html.replace(
  "async function saveSale(){if(!cart.size)return;const body=",
  "async function saveSale(){if(!cart.size&&returns.bottle===0&&returns.glass===0)return;const body="
);

fs.writeFileSync(kasseFile, html);

console.log(`Glaspfand-Produkte auf 2,00 EUR korrigiert: ${glassChanged}`);
console.log('Kassenlayout kompakter gemacht.');
console.log('Reine Pfandrückgabe ohne Produkt ist jetzt im Frontend und Backend erlaubt.');
console.log('Backups von db.json, server.js und kasse.html wurden angelegt.');
