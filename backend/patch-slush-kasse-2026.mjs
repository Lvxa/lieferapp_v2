import fs from 'fs';

const file = new URL('../frontend/kasse.html', import.meta.url);
const backup = new URL(`../frontend/kasse-before-slush-${Date.now()}.html`, import.meta.url);
let html = fs.readFileSync(file, 'utf8');
fs.copyFileSync(file, backup);

if (!html.includes('__slushAdminFilter2026')) {
  const loadNeedle = `posProducts=await call('/pos/products');renderChips();renderProducts();renderCart()`;
  const loadReplacement = `posProducts=user.role==='admin'?[]:await call('/pos/products');renderChips();renderProducts();renderCart()`;
  if (!html.includes(loadNeedle)) throw new Error('POS-Ladezeile nicht gefunden. Bitte Datei nicht manuell verändern und Ausgabe schicken.');
  html = html.replace(loadNeedle, loadReplacement);

  const bootNeedle = `boot();`;
  const injection = `// __slushAdminFilter2026\n(function(){\n  const timer=setInterval(()=>{\n    if(!user||user.role!=='admin')return;\n    const sel=document.getElementById('adminStand');\n    if(!sel)return;\n    clearInterval(timer);\n    sel.addEventListener('change',async()=>{\n      try{\n        const code=sel.value;\n        cart.clear();returns={bottle:0,glass:0};category='Alle';\n        posProducts=code?await call('/pos/products?standort='+encodeURIComponent(code)):[];\n        renderChips();renderProducts();renderCart();\n      }catch(e){toast(e.message,'error')}\n    });\n  },100);\n  setTimeout(()=>clearInterval(timer),10000);\n})();\nboot();`;
  if (!html.includes(bootNeedle)) throw new Error('boot()-Marker nicht gefunden.');
  html = html.replace(bootNeedle, injection);
}

fs.writeFileSync(file, html);
console.log(`Backup: ${backup.pathname}`);
console.log('Admin-Kasse aktualisiert: Sortiment wird nach ausgewähltem Stand geladen.');
