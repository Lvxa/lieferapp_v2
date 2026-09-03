import fs from 'fs';

const indexFile = new URL('../frontend/index.html', import.meta.url);
const stamp = Date.now();
const backup = new URL(`../frontend/index-before-order-filter-fix-${stamp}.html`, import.meta.url);

if (!fs.existsSync(indexFile)) throw new Error('frontend/index.html nicht gefunden.');
fs.copyFileSync(indexFile, backup);

let html = fs.readFileSync(indexFile, 'utf8');
const before = html;

// Lagerbestellungen dürfen auch Produkte enthalten, die nicht im normalen Verkaufs-/POS-Katalog aktiv sind.
// Entscheidend ist orderEnabled; die API liefert für Bierbuden bereits nur die für den jeweiligen Stand erlaubten Produkte.
html = html.replaceAll(
  'products.filter(p => p.stock > 0 && p.isActive !== false)',
  'products.filter(p => p.stock > 0 && p.orderEnabled !== false)'
);
html = html.replaceAll(
  'products.filter(p => p.isActive !== false && p.stock > 0)',
  'products.filter(p => p.orderEnabled !== false && p.stock > 0)'
);

if (html === before) {
  if (html.includes('p.orderEnabled !== false')) {
    console.log('Bestellfilter war bereits korrigiert. Keine Änderung nötig.');
  } else {
    throw new Error('Der erwartete Bestellfilter wurde nicht gefunden; index.html blieb unverändert.');
  }
} else {
  fs.writeFileSync(indexFile, html);
  console.log('Bestellfilter korrigiert: orderEnabled statt isActive.');
}

console.log(`Backup: ${backup.pathname}`);
console.log('0,2-l- und 1-l-Lagerprodukte können jetzt angezeigt werden, wenn sie für den Stand erlaubt, bestellbar und auf Lager sind.');
