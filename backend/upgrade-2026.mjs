import fs from 'fs';

const file = new URL('./data/db.json', import.meta.url);
const backup = new URL(`./data/db-before-2026-catalog-${Date.now()}.json`, import.meta.url);
const d = JSON.parse(fs.readFileSync(file, 'utf8'));
fs.copyFileSync(file, backup);

// Preserve users/stands, but reset operational 2025 data.
d.orders = [];
d.idempotency = {};
d.stockMovements = [];

// price = selling value per stock/order unit (crate or keg).
// Items not listed on the 2026 sales price list remain inventory-only (isActive:false, price:0).
d.products = [
  { id: 1,  name: 'Brinkhoff’s No. 1 30l Fass', category: 'bier', unit: 'Fass', package: '30 l', price: 450, stock: 0, minStock: 0, isActive: true },
  { id: 2,  name: 'Brinkhoff’s No. 1 50l Fass', category: 'bier', unit: 'Fass', package: '50 l', price: 750, stock: 0, minStock: 0, isActive: true },
  { id: 3,  name: 'Brinkhoff’s Radler naturtrüb 0,33l', category: 'bier', unit: 'Kiste', package: '24 x 0,33 l', price: 96, stock: 0, minStock: 0, isActive: true },
  { id: 4,  name: 'Brinkhoff’s No. 1 Flasche 0,33l', category: 'bier', unit: 'Kiste', package: '24 x 0,33 l', price: 96, stock: 0, minStock: 0, isActive: true },
  { id: 5,  name: 'Brinkhoff’s 0,0% 0,33l', category: 'bier_alkoholfrei', unit: 'Kiste', package: '24 x 0,33 l', price: 96, stock: 0, minStock: 0, isActive: true },
  { id: 6,  name: 'Jever Fun Zitrone 0,33l', category: 'bier_alkoholfrei', unit: 'Kiste', package: '24 x 0,33 l', price: 96, stock: 0, minStock: 0, isActive: true },
  { id: 7,  name: 'Schöfferhofer Grapefruit 0,33l', category: 'bier', unit: 'Kiste', package: '24 x 0,33 l', price: 96, stock: 0, minStock: 0, isActive: true },
  { id: 8,  name: 'Schöfferhofer Grapefruit alkoholfrei 0,33l', category: 'bier_alkoholfrei', unit: 'Kiste', package: '24 x 0,33 l', price: 96, stock: 0, minStock: 0, isActive: true },
  { id: 9,  name: 'Hövels 0,5l', category: 'bier', unit: 'Kiste', package: '20 x 0,5 l', price: 0, stock: 0, minStock: 0, isActive: false },
  { id: 10, name: 'Schöfferhofer Hefeweizen 0,5l', category: 'bier', unit: 'Kiste', package: '20 x 0,5 l', price: 130, stock: 0, minStock: 0, isActive: true },
  { id: 11, name: 'Schöfferhofer Hefeweizen alkoholfrei 0,5l', category: 'bier_alkoholfrei', unit: 'Kiste', package: '20 x 0,5 l', price: 130, stock: 0, minStock: 0, isActive: true },

  { id: 12, name: 'Coca Cola 0,2l Glas', category: 'softdrinks', unit: 'Kiste', package: '24 x 0,2 l Glas', price: 0, stock: 0, minStock: 0, isActive: false },
  { id: 13, name: 'Coca Cola 0,33l Glas', category: 'softdrinks', unit: 'Kiste', package: '24 x 0,33 l Glas', price: 96, stock: 0, minStock: 0, isActive: true },
  { id: 14, name: 'Coca Cola 1l Mehrweg', category: 'softdrinks', unit: 'Kiste', package: '12 x 1 l Mehrweg', price: 0, stock: 0, minStock: 0, isActive: false },
  { id: 15, name: 'Coca Cola Zero 0,2l Glas', category: 'softdrinks', unit: 'Kiste', package: '24 x 0,2 l Glas', price: 0, stock: 0, minStock: 0, isActive: false },
  { id: 16, name: 'Coca Cola Zero 0,33l Glas', category: 'softdrinks', unit: 'Kiste', package: '24 x 0,33 l Glas', price: 96, stock: 0, minStock: 0, isActive: true },
  { id: 17, name: 'Coca Cola Zero 1l Mehrweg', category: 'softdrinks', unit: 'Kiste', package: '12 x 1 l Mehrweg', price: 0, stock: 0, minStock: 0, isActive: false },
  { id: 18, name: 'Fanta Orange 0,2l Glas', category: 'softdrinks', unit: 'Kiste', package: '24 x 0,2 l Glas', price: 0, stock: 0, minStock: 0, isActive: false },
  { id: 19, name: 'Fanta Orange 0,33l Glas', category: 'softdrinks', unit: 'Kiste', package: '24 x 0,33 l Glas', price: 96, stock: 0, minStock: 0, isActive: true },
  { id: 20, name: 'Fanta Orange 1l Mehrweg', category: 'softdrinks', unit: 'Kiste', package: '12 x 1 l Mehrweg', price: 0, stock: 0, minStock: 0, isActive: false },
  { id: 21, name: 'Sprite 0,2l Glas', category: 'softdrinks', unit: 'Kiste', package: '24 x 0,2 l Glas', price: 0, stock: 0, minStock: 0, isActive: false },
  { id: 22, name: 'Sprite 0,33l Glas', category: 'softdrinks', unit: 'Kiste', package: '24 x 0,33 l Glas', price: 96, stock: 0, minStock: 0, isActive: true },
  { id: 23, name: 'Sprite 1l Mehrweg', category: 'softdrinks', unit: 'Kiste', package: '12 x 1 l Mehrweg', price: 0, stock: 0, minStock: 0, isActive: false },
  { id: 24, name: 'Mezzo Mix 0,2l Glas', category: 'softdrinks', unit: 'Kiste', package: '24 x 0,2 l Glas', price: 0, stock: 0, minStock: 0, isActive: false },
  { id: 25, name: 'Mezzo Mix 0,33l Glas', category: 'softdrinks', unit: 'Kiste', package: '24 x 0,33 l Glas', price: 96, stock: 0, minStock: 0, isActive: true },
  { id: 26, name: 'Lift Apfelschorle 1l Mehrweg', category: 'softdrinks', unit: 'Kiste', package: '12 x 1 l Mehrweg', price: 0, stock: 0, minStock: 0, isActive: false },

  { id: 27, name: 'Töftes mit Kribbel 0,33l', category: 'wasser', unit: 'Kiste', package: '20 x 0,33 l Glas', price: 70, stock: 0, minStock: 0, isActive: true },
  { id: 28, name: 'Töftes ohne Kribbel 0,33l', category: 'wasser', unit: 'Kiste', package: '20 x 0,33 l Glas', price: 70, stock: 0, minStock: 0, isActive: true },
  { id: 29, name: 'Töftes Apfelschorle 0,33l', category: 'softdrinks', unit: 'Kiste', package: '20 x 0,33 l Glas', price: 80, stock: 0, minStock: 0, isActive: true },
  { id: 30, name: 'Salvus Classic Glas 0,75l', category: 'wasser', unit: 'Kiste', package: '12 x 0,75 l Glas', price: 0, stock: 0, minStock: 0, isActive: false },
  { id: 31, name: 'Salvus Classic Sanft 0,75l', category: 'wasser', unit: 'Kiste', package: '12 x 0,75 l Glas', price: 0, stock: 0, minStock: 0, isActive: false },
  { id: 32, name: 'Salvus Classic 1l PET', category: 'wasser', unit: 'Kiste', package: '20 x 1 l PET', price: 0, stock: 0, minStock: 0, isActive: false },
  { id: 33, name: 'Salvus Naturelle 1l PET', category: 'wasser', unit: 'Kiste', package: '20 x 1 l PET', price: 0, stock: 0, minStock: 0, isActive: false },
  { id: 34, name: 'Selters Glas classic 0,25l', category: 'wasser', unit: 'Kiste', package: '20 x 0,25 l', price: 0, stock: 0, minStock: 0, isActive: false },
  { id: 35, name: 'Selters Glas still 0,25l', category: 'wasser', unit: 'Kiste', package: '20 x 0,25 l', price: 0, stock: 0, minStock: 0, isActive: false }
];

fs.writeFileSync(file, JSON.stringify(d, null, 2));
console.log(`Backup: ${backup.pathname}`);
console.log(`2026 catalog written: ${d.products.length} products, ${d.orders.length} orders, stocks reset to 0.`);
console.table(d.products.map(p => ({ id: p.id, name: p.name, unit: p.unit, price: p.price, stock: p.stock, active: p.isActive })));
