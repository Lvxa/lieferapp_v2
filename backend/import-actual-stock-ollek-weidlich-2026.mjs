import fs from 'fs';

const dbFile = new URL('./data/db.json', import.meta.url);
const backup = new URL(`./data/db-before-actual-stock-${Date.now()}.json`, import.meta.url);
const d = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
fs.copyFileSync(dbFile, backup);

d.products ||= [];
d.stockMovements ||= [];

const nextId = arr => arr.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;

// Tatsächliche Ausgangsbestände 2026 laut den bestätigten Mengen aus
// - Bestellung S+K Ollek Events Turnier der Sieger 2026
// - Bestellung Weidlich Turnier der Sieger 2026
// Die Werte werden ABSOLUT gesetzt, nicht addiert. Dadurch ist das Skript auch bei erneutem Lauf sicher.
const stock = {
  // Weidlich
  1: 6,
  2: 40,
  3: 65,
  4: 25,
  5: 25,
  6: 25,
  7: 25,
  8: 10,
  9: 1,
  10: 20,
  11: 15,

  // Ollek
  12: 45,
  13: 60,
  14: 30,
  15: 45,
  16: 40,
  17: 25,
  18: 15,
  19: 20,
  20: 10,
  21: 15,
  22: 20,
  23: 10,
  24: 20,
  25: 20,
  26: 20,
  27: 56,
  28: 28,
  29: 28
};

const sourceFor = id => id <= 11 ? 'Weidlich 2026' : 'Ollek 2026';

for (const [idRaw, wantedRaw] of Object.entries(stock)) {
  const id = Number(idRaw);
  const wanted = Number(wantedRaw);
  const p = d.products.find(x => Number(x.id) === id);
  if (!p) throw new Error(`Produkt-ID ${id} fehlt in db.json`);

  const before = Number(p.stock) || 0;
  const delta = wanted - before;
  p.stock = wanted;

  if (delta !== 0) {
    d.stockMovements.push({
      id: nextId(d.stockMovements),
      productId: id,
      productName: p.name,
      delta,
      stockAfter: wanted,
      reason: 'initial_stock_2026_documents',
      orderId: null,
      standort: null,
      note: `Tatsächlicher Ausgangsbestand laut ${sourceFor(id)}`,
      createdBy: 'migration',
      createdAt: new Date().toISOString()
    });
  }
}

fs.writeFileSync(dbFile, JSON.stringify(d, null, 2));

console.log(`Backup: ${backup.pathname}`);
console.log('Tatsächliche Ausgangsbestände aus Ollek + Weidlich gesetzt.');
console.table(Object.entries(stock).map(([id, qty]) => {
  const p = d.products.find(x => Number(x.id) === Number(id));
  return { id: Number(id), produkt: p?.name, bestand: qty, quelle: sourceFor(Number(id)) };
}));
console.log('Hinweis: Selters 0,25 l wurde NICHT gesetzt, weil Weidlich nur „1 Palette, halb classic/halb still“ ohne Kistenzahl nennt.');
console.log('Hinweis: Das separate Salvus-Dokument wurde hier NICHT zusätzlich addiert.');
