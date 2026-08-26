import fs from 'fs';

const indexFile = new URL('../frontend/index.html', import.meta.url);
const kasseFile = new URL('../frontend/kasse.html', import.meta.url);
const stamp = Date.now();

// ---------------- index.html ----------------
let index = fs.readFileSync(indexFile, 'utf8');
fs.copyFileSync(indexFile, new URL(`../frontend/index-before-sponsor-pos-fix-${stamp}.html`, import.meta.url));

// Give the cash-register link a stable id, regardless of previous wrapper patches.
index = index.replace(/<a\s+href="\/kasse\.html"(?![^>]*\bid=)/, '<a id="cash-register-link" href="/kasse.html"');

if (!index.includes('function applyCashRegisterAccess2026()')) {
  const helper = `\n        // 2026: VIP/Presse have no POS access.\n        function applyCashRegisterAccess2026() {\n            const link = document.getElementById('cash-register-link') || document.querySelector('a[href="/kasse.html"]');\n            const wrap = document.getElementById('pos-link-wrap');\n            const disabled = currentUser && currentUser.role === 'bierbude' && (currentUser.posEnabled === false || currentUser.assortment === 'sponsor' || currentUser.stand?.posEnabled === false);\n            if (wrap) wrap.style.display = disabled ? 'none' : '';\n            if (link) link.style.display = disabled ? 'none' : '';\n        }\n`;
  index = index.replace('// Authentication', helper + '\n        // Authentication');
}

// Apply immediately after a fresh login.
index = index.replace(
  /currentUser = response\.user;(?!\s*applyCashRegisterAccess2026\(\);)/,
  'currentUser = response.user;\n                applyCashRegisterAccess2026();'
);

// Apply when restoring an existing session.
index = index.replace(
  /currentUser = JSON\.parse\(user\);(?!\s*applyCashRegisterAccess2026\(\);)/,
  'currentUser = JSON.parse(user);\n                applyCashRegisterAccess2026();'
);

// Also apply whenever the Bierbude dashboard loads. This survives older cached session data as long as login data is current.
if (!index.includes('/* sponsor POS visibility hook 2026 */')) {
  const hook = `\n        /* sponsor POS visibility hook 2026 */\n        document.addEventListener('DOMContentLoaded', applyCashRegisterAccess2026);\n        window.addEventListener('pageshow', applyCashRegisterAccess2026);\n`;
  index = index.replace('\n    </script>\n</body>', hook + '\n    </script>\n</body>');
}

fs.writeFileSync(indexFile, index);

// ---------------- kasse.html ----------------
let kasse = fs.readFileSync(kasseFile, 'utf8');
fs.copyFileSync(kasseFile, new URL(`../frontend/kasse-before-sponsor-pos-fix-${stamp}.html`, import.meta.url));

// Refresh the complete user object from the backend when restoring a session.
kasse = kasse.replace(
  "if(token&&user){try{await call('/auth/me');await start();return}catch{}}",
  "if(token&&user){try{const me=await call('/auth/me');user=me.user;sessionStorage.setItem('currentUser',JSON.stringify(user));await start();return}catch{}}"
);

// Sponsor stands must never render the POS. Direct URL access returns to the overview.
kasse = kasse.replace(
  "async function start(){if(!['bierbude','admin'].includes(user.role)){sessionStorage.clear();throw new Error('Kassenrechner ist nur für Bierbuden/Admin verfügbar.')}",
  "async function start(){if(!['bierbude','admin'].includes(user.role)){sessionStorage.clear();throw new Error('Kassenrechner ist nur für Bierbuden/Admin verfügbar.')}if(user.role==='bierbude'&&(user.posEnabled===false||user.assortment==='sponsor'||user.stand?.posEnabled===false)){location.replace('/');return;}"
);

// Admin selector should never offer sponsor-only stands.
kasse = kasse.replace(
  "stands.map(s=>`<option value=\"${s.code}\">${s.name}</option>`)",
  "stands.filter(s=>s.posEnabled!==false).map(s=>`<option value=\"${s.code}\">${s.name}</option>`)")
;

fs.writeFileSync(kasseFile, kasse);

console.log('Sponsor POS access fixed: button hidden for VIP/Presse; direct POS access redirects to overview.');
