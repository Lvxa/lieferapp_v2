import fs from 'fs';

const file = new URL('./data/db.json', import.meta.url);
const backup = new URL(`./data/db-before-pos-pricing-${Date.now()}.json`, import.meta.url);
const d = JSON.parse(fs.readFileSync(file, 'utf8'));
fs.copyFileSync(file, backup);

d.sales = d.sales || [];
d.posProducts = d.posProducts || [];

// Einkaufspreis is kept per Lager-Einheit (Kiste/Fass). We do NOT invent these values.
// retailPrice is the customer price per bottle/glass/0.3l serving from the 2026 price list.
const meta = {
  1:  { retailPrice: 4.50, retailUnit: '0,3 l vom Fass', retailUnitsPerStockUnit: 100, depositType: 'glass', depositPrice: 2 },
  2:  { retailPrice: 4.50, retailUnit: '0,3 l vom Fass', retailUnitsPerStockUnit: 50 / 0.3, depositType: 'glass', depositPrice: 2 },
  3:  { retailPrice: 4.00, retailUnit: 'Flasche 0,33 l', retailUnitsPerStockUnit: 24, depositType: 'bottle', depositPrice: 1 },
  4:  { retailPrice: 4.00, retailUnit: 'Flasche 0,33 l', retailUnitsPerStockUnit: 24, depositType: 'bottle', depositPrice: 1 },
  5:  { retailPrice: 4.00, retailUnit: 'Flasche 0,33 l', retailUnitsPerStockUnit: 24, depositType: 'bottle', depositPrice: 1 },
  6:  { retailPrice: 4.00, retailUnit: 'Flasche 0,33 l', retailUnitsPerStockUnit: 24, depositType: 'bottle', depositPrice: 1 },
  7:  { retailPrice: 4.00, retailUnit: 'Flasche 0,33 l', retailUnitsPerStockUnit: 24, depositType: 'bottle', depositPrice: 1 },
  8:  { retailPrice: 4.00, retailUnit: 'Flasche 0,33 l', retailUnitsPerStockUnit: 24, depositType: 'bottle', depositPrice: 1 },
  10: { retailPrice: 6.50, retailUnit: 'Flasche 0,5 l', retailUnitsPerStockUnit: 20, depositType: 'bottle', depositPrice: 1 },
  11: { retailPrice: 6.50, retailUnit: 'Flasche 0,5 l', retailUnitsPerStockUnit: 20, depositType: 'bottle', depositPrice: 1 },
  13: { retailPrice: 4.00, retailUnit: 'Flasche 0,33 l', retailUnitsPerStockUnit: 24, depositType: 'bottle', depositPrice: 1 },
  16: { retailPrice: 4.00, retailUnit: 'Flasche 0,33 l', retailUnitsPerStockUnit: 24, depositType: 'bottle', depositPrice: 1 },
  19: { retailPrice: 4.00, retailUnit: 'Flasche 0,33 l', retailUnitsPerStockUnit: 24, depositType: 'bottle', depositPrice: 1 },
  22: { retailPrice: 4.00, retailUnit: 'Flasche 0,33 l', retailUnitsPerStockUnit: 24, depositType: 'bottle', depositPrice: 1 },
  25: { retailPrice: 4.00, retailUnit: 'Flasche 0,33 l', retailUnitsPerStockUnit: 24, depositType: 'bottle', depositPrice: 1 },
  27: { retailPrice: 3.50, retailUnit: 'Flasche 0,33 l', retailUnitsPerStockUnit: 20, depositType: 'bottle', depositPrice: 1 },
  28: { retailPrice: 3.50, retailUnit: 'Flasche 0,33 l', retailUnitsPerStockUnit: 20, depositType: 'bottle', depositPrice: 1 },
  29: { retailPrice: 4.00, retailUnit: 'Flasche 0,33 l', retailUnitsPerStockUnit: 20, depositType: 'bottle', depositPrice: 1 }
};

for (const p of d.products || []) {
  if (p.purchasePrice === undefined) p.purchasePrice = null;
  const m = meta[p.id];
  if (m) Object.assign(p, m);
  else {
    p.retailPrice = p.retailPrice ?? null;
    p.retailUnit = p.retailUnit ?? null;
    p.retailUnitsPerStockUnit = p.retailUnitsPerStockUnit ?? null;
    p.depositType = p.depositType ?? null;
    p.depositPrice = p.depositPrice ?? 0;
  }
}

// Separate mobile till catalog. Central warehouse stock is NOT reduced by a customer sale;
// it was already reduced when the crate/keg was delivered to the stand.
d.posProducts = [
  { id: 1,  productId: 2,  name: 'Brinkhoff’s No. 1 vom Fass', category: 'Bier', retailPrice: 4.50, retailUnit: '0,3 l', depositType: 'glass', depositPrice: 2, isActive: true },
  { id: 2,  productId: 4,  name: 'Brinkhoff’s No. 1 Flasche', category: 'Bier', retailPrice: 4.00, retailUnit: '0,33 l', depositType: 'bottle', depositPrice: 1, isActive: true },
  { id: 3,  productId: 3,  name: 'Brinkhoff’s Radler Naturtrüb', category: 'Bier', retailPrice: 4.00, retailUnit: '0,33 l', depositType: 'bottle', depositPrice: 1, isActive: true },
  { id: 4,  productId: 7,  name: 'Schöfferhofer Grapefruit', category: 'Bier', retailPrice: 4.00, retailUnit: '0,33 l', depositType: 'bottle', depositPrice: 1, isActive: true },
  { id: 5,  productId: 10, name: 'Schöfferhofer Weizen', category: 'Bier', retailPrice: 6.50, retailUnit: '0,5 l', depositType: 'bottle', depositPrice: 1, isActive: true },

  { id: 6,  productId: 5,  name: 'Brinkhoff’s 0,0%', category: 'Alkoholfreies Bier', retailPrice: 4.00, retailUnit: '0,33 l', depositType: 'bottle', depositPrice: 1, isActive: true },
  { id: 7,  productId: 6,  name: 'Jever Fun Zitrone', category: 'Alkoholfreies Bier', retailPrice: 4.00, retailUnit: '0,33 l', depositType: 'bottle', depositPrice: 1, isActive: true },
  { id: 8,  productId: 8,  name: 'Schöfferhofer Grapefruit alkoholfrei', category: 'Alkoholfreies Bier', retailPrice: 4.00, retailUnit: '0,33 l', depositType: 'bottle', depositPrice: 1, isActive: true },
  { id: 9,  productId: 11, name: 'Schöfferhofer Weizen alkoholfrei', category: 'Alkoholfreies Bier', retailPrice: 6.50, retailUnit: '0,5 l', depositType: 'bottle', depositPrice: 1, isActive: true },

  { id: 10, productId: 13, name: 'Coca-Cola', category: 'Softdrinks', retailPrice: 4.00, retailUnit: '0,33 l', depositType: 'bottle', depositPrice: 1, isActive: true },
  { id: 11, productId: 16, name: 'Coca-Cola Zero', category: 'Softdrinks', retailPrice: 4.00, retailUnit: '0,33 l', depositType: 'bottle', depositPrice: 1, isActive: true },
  { id: 12, productId: 25, name: 'Mezzo Mix', category: 'Softdrinks', retailPrice: 4.00, retailUnit: '0,33 l', depositType: 'bottle', depositPrice: 1, isActive: true },
  { id: 13, productId: 19, name: 'Fanta', category: 'Softdrinks', retailPrice: 4.00, retailUnit: '0,33 l', depositType: 'bottle', depositPrice: 1, isActive: true },
  { id: 14, productId: 22, name: 'Sprite', category: 'Softdrinks', retailPrice: 4.00, retailUnit: '0,33 l', depositType: 'bottle', depositPrice: 1, isActive: true },
  { id: 15, productId: 29, name: 'Töftes Apfel', category: 'Softdrinks', retailPrice: 4.00, retailUnit: '0,33 l', depositType: 'bottle', depositPrice: 1, isActive: true },

  { id: 16, productId: 27, name: 'Töftes mit Kribbel', category: 'Wasser', retailPrice: 3.50, retailUnit: '0,33 l', depositType: 'bottle', depositPrice: 1, isActive: true },
  { id: 17, productId: 28, name: 'Töftes ohne Kribbel', category: 'Wasser', retailPrice: 3.50, retailUnit: '0,33 l', depositType: 'bottle', depositPrice: 1, isActive: true },

  { id: 18, productId: null, name: 'Slushi alkoholfrei für Kids', category: 'Slush', retailPrice: 4.00, retailUnit: 'Becher', depositType: 'glass', depositPrice: 2, isActive: true },
  { id: 19, productId: null, name: 'Frozen Aperol', category: 'Slush', retailPrice: 7.50, retailUnit: 'Becher', depositType: 'glass', depositPrice: 2, isActive: true }
];

fs.writeFileSync(file, JSON.stringify(d, null, 2));
console.log(`Backup: ${backup.pathname}`);
console.log(`POS/price upgrade complete: ${d.products.length} inventory products, ${d.posProducts.length} POS products, ${d.sales.length} existing sales preserved.`);
console.table(d.posProducts.map(p => ({ id: p.id, name: p.name, price: p.retailPrice, pfand: p.depositPrice })));
