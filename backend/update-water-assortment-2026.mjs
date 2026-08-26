import fs from 'fs';

const dbFile = new URL('./data/db.json', import.meta.url);
const backup = new URL(`./data/db-before-water-assortment-${Date.now()}.json`, import.meta.url);
const d = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
fs.copyFileSync(dbFile, backup);

d.products ||= [];

function setScope(id, scope, enabled = true) {
  const p = d.products.find(x => Number(x.id) === Number(id));
  if (!p) throw new Error(`Produkt ${id} fehlt`);
  p.orderScope = scope;
  p.orderEnabled = enabled;
  return p;
}

// 2026 rule confirmed by operations:
// - small water bottles -> sales stands
// - large water bottles/PET -> sponsor stands
// - 30L Brinkhoff's keg can be used everywhere
setScope(1, 'both', true); // Brinkhoff's No. 1 30l Fass

// Small water bottles -> sales
setScope(27, 'sales', true); // Töftes mit Kribbel 0,33l
setScope(28, 'sales', true); // Töftes ohne Kribbel 0,33l
setScope(34, 'sales', true); // Selters Glas classic 0,25l
setScope(35, 'sales', true); // Selters Glas still 0,25l

// Large water -> sponsor areas (VIP, Presse, Helfer, Mitglieder)
setScope(30, 'sponsor', true); // Salvus Classic Glas 0,75l
setScope(31, 'sponsor', true); // Salvus Classic Sanft 0,75l
setScope(32, 'sponsor', true); // Salvus Classic 1l PET
setScope(33, 'sponsor', true); // Salvus Naturelle 1l PET

fs.writeFileSync(dbFile, JSON.stringify(d, null, 2));
console.log(`Backup: ${backup.pathname}`);
console.log('Wasser-Sortiment 2026 aktualisiert:');
for (const id of [1,27,28,30,31,32,33,34,35]) {
  const p = d.products.find(x => Number(x.id) === id);
  console.log(`${id}: ${p.name} -> ${p.orderScope} (orderEnabled=${p.orderEnabled})`);
}
