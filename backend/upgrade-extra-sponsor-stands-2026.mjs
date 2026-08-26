import fs from 'fs';

const dbFile = new URL('./data/db.json', import.meta.url);
const dbBackup = new URL(`./data/db-before-extra-sponsor-stands-${Date.now()}.json`, import.meta.url);
const d = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
fs.copyFileSync(dbFile, dbBackup);

d.users ||= [];
d.stands ||= [];
d.products ||= [];

function nextId(arr) {
  return arr.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;
}

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
  if (password) {
    u.password = password;
    delete u.passwordHash;
  }
  return u;
}

upsertStand({ code: 'helfer', name: 'Helferzelt', type: 'sponsor', assortment: 'sponsor', posEnabled: false });
upsertStand({ code: 'mitglieder', name: 'Mitgliederzelt', type: 'sponsor', assortment: 'sponsor', posEnabled: false });

ensureUser('Helferzelt', 'bierbude', 'helfer', 'bude123');
ensureUser('Mitgliederzelt', 'bierbude', 'mitglieder', 'bude123');

function setScope(id, scope, enabled = true) {
  const p = d.products.find(x => Number(x.id) === Number(id));
  if (!p) return;
  p.orderScope = scope;
  p.orderEnabled = enabled;
}

// 30-l Brinkhoff's is usable everywhere, although it is ordered less often.
setScope(1, 'both', true);

// 2026 water logic after Germeta was dropped:
// small 0.33-l bottles for sales stands, litre formats for sponsor areas.
setScope(27, 'sales', true);   // Töftes mit Kribbel 0,33 l
setScope(28, 'sales', true);   // Töftes ohne Kribbel 0,33 l
setScope(32, 'sponsor', true); // Salvus Classic 1 l PET
setScope(33, 'sponsor', true); // Salvus Naturelle 1 l PET

fs.writeFileSync(dbFile, JSON.stringify(d, null, 2));

console.log(`Backup: ${dbBackup.pathname}`);
console.log('Sponsor-Stände ergänzt: Helferzelt, Mitgliederzelt (keine Kasse).');
console.log('Nutzer ergänzt: Helferzelt, Mitgliederzelt / Passwort bude123.');
console.log("30-l Brinkhoff's: beides; 0,33-l Töftes: Verkaufsware; 1-l Salvus PET: Sponsorware.");
console.log(`Stände gesamt: ${d.stands.length}, Nutzer gesamt: ${d.users.length}`);
