import fs from 'fs';

const dbFile = new URL('./data/db.json', import.meta.url);
const dbBackup = new URL(`./data/db-before-stands-suppliers-${Date.now()}.json`, import.meta.url);
const d = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
fs.copyFileSync(dbFile, dbBackup);

d.users ||= [];
d.stands ||= [];
d.products ||= [];

function upsertStand(data) {
  let s = d.stands.find(x => x.code === data.code);
  if (!s) {
    s = { id: d.stands.reduce((m,x)=>Math.max(m,Number(x.id)||0),0)+1, ...data };
    d.stands.push(s);
  } else Object.assign(s, data);
  return s;
}

upsertStand({ code:'bude1', name:'Schlossplatz', type:'sales', assortment:'sales', posEnabled:true });
upsertStand({ code:'bude2', name:'Abreiteplatz', type:'sales', assortment:'sales', posEnabled:true });
upsertStand({ code:'bude3', name:'Plateu', type:'sales', assortment:'sales', posEnabled:true });
upsertStand({ code:'presse', name:'Pressezelt', type:'sponsor', assortment:'sponsor', posEnabled:false });
upsertStand({ code:'vip', name:'VIP-Zelt', type:'sponsor', assortment:'sponsor', posEnabled:false });

function ensureUser(username, role, standort = null, password = null) {
  let u = d.users.find(x => x.username === username);
  if (!u) {
    u = { id:d.users.reduce((m,x)=>Math.max(m,Number(x.id)||0),0)+1, username, role, standort };
    d.users.push(u);
  }
  u.role = role;
  u.standort = standort;
  if (password) {
    u.password = password;
    // Plaintext fallback is intentionally used because the existing deployment already enables it.
    delete u.passwordHash;
  }
}

ensureUser('Pressezelt', 'bierbude', 'presse', 'bude123');
ensureUser('VIP-Zelt', 'bierbude', 'vip', 'bude123');
ensureUser('lieferant1', 'lieferant', null, 'lieferant123');
ensureUser('lieferant2', 'lieferant', null, 'lieferant123');
ensureUser('lieferant3', 'lieferant', null, 'lieferant123');

// Prepare assortment classification without guessing sponsor products.
// Current sellable products stay in the sales assortment. Products that were inactive
// remain unassigned until the real sponsor/sales assortment is supplied.
for (const p of d.products) {
  if (!p.orderScope) p.orderScope = p.isActive === false ? 'unassigned' : 'sales';
  if (p.orderEnabled == null) p.orderEnabled = p.isActive !== false;
}

fs.writeFileSync(dbFile, JSON.stringify(d, null, 2));
console.log(`Backup: ${dbBackup.pathname}`);
console.log('Stände:', d.stands.map(s=>`${s.name} (${s.assortment}, Kasse ${s.posEnabled?'ja':'nein'})`).join(' | '));
console.log('Neue Nutzer vorhanden: Pressezelt, VIP-Zelt, lieferant1, lieferant2, lieferant3');
console.log('Sponsor-Sortiment ist absichtlich noch leer/unassigned, bis die echte Zuordnung vorliegt.');
