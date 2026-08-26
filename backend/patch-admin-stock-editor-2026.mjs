import fs from 'fs';

const file = new URL('../frontend/index.html', import.meta.url);
const backup = new URL(`../frontend/index-before-stock-editor-${Date.now()}.html`, import.meta.url);
let html = fs.readFileSync(file, 'utf8');
fs.copyFileSync(file, backup);

const marker = '/* 2026-direct-stock-editor */';
if (!html.includes(marker)) {
  const injection = `
${marker}
window.adjustStock = async function(productId, adjustment) {
  try {
    const p = products.find(x => Number(x.id) === Number(productId));
    if (!p) throw new Error('Produkt nicht gefunden');
    const next = Math.max(0, (Number(p.stock) || 0) + Number(adjustment || 0));
    await apiCall(\`/products/\${productId}/stock\`, {
      method: 'PATCH',
      body: JSON.stringify({ stock: next, reason: 'admin_correction', note: 'Bestandsänderung im Adminpanel' })
    });
    await loadStockList();
    if (typeof loadAdminStats === 'function') await loadAdminStats();
    showNotification('Bestand aktualisiert');
  } catch (error) {
    showNotification(error.message, 'error');
  }
};

window.setExactStock = async function(productId) {
  const input = document.getElementById(\`stock-set-\${productId}\`);
  const value = Number(input?.value);
  if (!Number.isFinite(value) || value < 0) {
    showNotification('Bitte einen gültigen Bestand eingeben', 'error');
    return;
  }
  try {
    await apiCall(\`/products/\${productId}/stock\`, {
      method: 'PATCH',
      body: JSON.stringify({ stock: value, reason: 'admin_correction', note: 'Bestand direkt im Adminpanel gesetzt' })
    });
    await loadStockList();
    if (typeof loadAdminStats === 'function') await loadAdminStats();
    showNotification('Bestand gesetzt');
  } catch (error) {
    showNotification(error.message, 'error');
  }
};

window.loadStockList = async function() {
  showLoading('stock-list');
  try {
    await loadProducts();
    const stockListHtml = products.map(product => \`
      <div class="order-item \${Number(product.stock) <= Number(product.minStock || 0) ? 'pending' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <div style="min-width:220px;flex:1;">
            <strong>\${product.name}</strong><br>
            <small>\${product.category || ''} · \${product.unit || ''} \${product.package || ''}</small>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
            <button class="btn btn-danger" onclick="adjustStock(\${product.id}, -1)" style="padding:7px 11px;margin:0;">−</button>
            <input id="stock-set-\${product.id}" type="number" min="0" step="1" value="\${Number(product.stock) || 0}" style="width:85px;padding:8px;border:1px solid #cbd5e0;border-radius:8px;font-size:16px;text-align:center;">
            <button class="btn btn-primary" onclick="adjustStock(\${product.id}, 1)" style="padding:7px 11px;margin:0;">+</button>
            <button class="btn btn-success" onclick="setExactStock(\${product.id})" style="padding:7px 11px;margin:0;">Setzen</button>
          </div>
        </div>
      </div>
    \`).join('');
    document.getElementById('stock-list').innerHTML = stockListHtml || '<p>Keine Produkte vorhanden</p>';
  } catch (error) {
    document.getElementById('stock-list').innerHTML = '<p>Fehler beim Laden der Bestände</p>';
    showNotification(error.message, 'error');
  }
};
`;

  const pos = html.lastIndexOf('</script>');
  if (pos < 0) throw new Error('</script> nicht gefunden');
  html = html.slice(0, pos) + injection + '\n' + html.slice(pos);
  fs.writeFileSync(file, html);
  console.log('Admin-Bestandseditor ergänzt.');
} else {
  console.log('Admin-Bestandseditor ist bereits vorhanden.');
}

console.log(`Backup: ${backup.pathname}`);
