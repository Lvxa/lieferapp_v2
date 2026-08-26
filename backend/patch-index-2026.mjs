import fs from 'fs';

const file = new URL('../frontend/index.html', import.meta.url);
let html = fs.readFileSync(file, 'utf8');
const backup = new URL(`../frontend/index-before-2026-links-${Date.now()}.html`, import.meta.url);
fs.copyFileSync(file, backup);

html = html.replace(
`            <strong>Demo-Zugänge:</strong><br>\n            Admin: admin / admin123<br>\n            Bierbude: bude1 / bude123<br>\n            Lieferant: lieferant / lieferant123`,
`            <strong>Benutzer:</strong><br>\n            Admin · Lieferant · Schlossplatz · Abreiteplatz · Plateu`
);

const adminHeading = `                <h2>Admin Panel - Bestandsverwaltung</h2>`;
if (!html.includes('href="/analytics.html"')) {
  html = html.replace(adminHeading, adminHeading + `\n                <div style="margin:12px 0 18px;display:flex;gap:10px;flex-wrap:wrap;">\n                    <a href="/analytics.html" class="btn btn-primary" style="text-decoration:none;">📊 Auswertungen</a>\n                    <a href="/preise.html" class="btn btn-success" style="text-decoration:none;">💰 Einkauf & Verkauf</a>\n                </div>`);
}

const standHeading = `                <h2>Bierbude - Bestellung aufgeben</h2>`;
if (!html.includes('href="/kasse.html"')) {
  html = html.replace(standHeading, standHeading + `\n                <div style="margin:12px 0 18px;">\n                    <a href="/kasse.html" class="btn btn-success" style="text-decoration:none;width:100%;display:block;text-align:center;font-size:1.1rem;">💶 Kassenrechner öffnen</a>\n                </div>`);
}

fs.writeFileSync(file, html);
console.log(`Backup: ${backup.pathname}`);
console.log('Frontend index patched for 2026 links/users.');
