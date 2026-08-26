import fs from 'fs';

const indexFile = new URL('../frontend/index.html', import.meta.url);
const kasseFile = new URL('../frontend/kasse.html', import.meta.url);
const stamp = Date.now();

// ---- index.html ----
let index = fs.readFileSync(indexFile, 'utf8');
fs.copyFileSync(indexFile, new URL(`../frontend/index-before-stands-suppliers-${stamp}.html`, import.meta.url));

index = index.replace(
  'Admin · Lieferant · Schlossplatz · Abreiteplatz · Plateu',
  'Admin · Lieferanten · Schlossplatz · Abreiteplatz · Plateu · Pressezelt · VIP-Zelt'
);

// Mark the cash-register link so sponsor stands can hide it.
index = index.replace(
  '<div style="margin:12px 0 18px;">\n                    <a href="/kasse.html"',
  '<div id="pos-link-wrap" style="margin:12px 0 18px;">\n                    <a href="/kasse.html"'
);

// Supplier stand filter.
if (!index.includes('id="supplier-stand-filter"')) {
  index = index.replace(
    '                    <h3>Eingehende Bestellungen</h3>\n                    <div style="margin-bottom: 15px;">',
    `                    <h3>Eingehende Bestellungen</h3>\n                    <div class="form-group" style="margin-bottom:12px;">\n                        <label>Standort filtern</label>\n                        <select id="supplier-stand-filter" onchange="loadOrders(); loadLieferantStats();">\n                            <option value="">Alle Standorte</option>\n                        </select>\n                    </div>\n                    <div style="margin-bottom: 15px;">`
  );
}

// Add overrides just before the script closes. This is intentionally idempotent.
if (!index.includes('/* 2026 supplier/stand overrides */')) {
  const overrides = `\n        /* 2026 supplier/stand overrides */\n        async function loadBierbudeData() {\n            const posWrap = document.getElementById('pos-link-wrap');\n            if (posWrap) posWrap.style.display = currentUser && currentUser.posEnabled === false ? 'none' : 'block';\n            loadAvailableProducts();\n            loadMyOrders();\n        }\n\n        async function ensureSupplierStandFilter() {\n            const sel = document.getElementById('supplier-stand-filter');\n            if (!sel || sel.dataset.loaded === '1') return;\n            try {\n                const stands = await apiCall('/stands');\n                sel.innerHTML = '<option value="">Alle Standorte</option>' + stands.map(s => \\`<option value="\${s.code}">\${s.name}</option>\\`).join('');\n                sel.dataset.loaded = '1';\n            } catch (e) { console.error('Standfilter konnte nicht geladen werden', e); }\n        }\n\n        async function loadLieferantData() {\n            await ensureSupplierStandFilter();\n            loadOrders();\n            loadLieferantStats();\n        }\n\n        async function loadLieferantStats() {\n            try {\n                const stand = document.getElementById('supplier-stand-filter')?.value || '';\n                const endpoint = '/analytics/supplier' + (stand ? '?standort=' + encodeURIComponent(stand) : '');\n                const stats = await apiCall(endpoint);\n                document.getElementById('lieferant-stats').innerHTML = \\`\n                    <div class="stat-card"><div class="stat-number">\${stats.pendingOrders}</div><div class="stat-label">Ausstehend</div></div>\n                    <div class="stat-card"><div class="stat-number">\${stats.approvedOrders}</div><div class="stat-label">Bestätigt</div></div>\n                    <div class="stat-card"><div class="stat-number">\${stats.processingOrders}</div><div class="stat-label">In Bearbeitung</div></div>\n                    <div class="stat-card"><div class="stat-number">\${stats.deliveredToday}</div><div class="stat-label">Heute geliefert</div></div>\n                \\`;\n            } catch (error) { console.error('Error loading supplier stats:', error); }\n        }\n\n        async function loadOrders(status = null) {\n            showLoading('orders-list');\n            try {\n                const params = new URLSearchParams();\n                if (status) params.set('status', status);\n                const stand = document.getElementById('supplier-stand-filter')?.value || '';\n                if (stand) params.set('standort', stand);\n                const endpoint = '/orders/all' + (params.toString() ? '?' + params.toString() : '');\n                const ordersList = await apiCall(endpoint);\n                const ordersHtml = ordersList.map(order => \\`\n                    <div class="order-item \${order.status}">\n                        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:15px;">\n                            <div><strong>Bestellung #\${order.id}</strong> <span class="status-badge status-\${order.status}">\${getStatusText(order.status)}</span><br>\n                            <small>von: <strong>\${order.standName || order.standort}</strong></small>\n                            \${order.claimedBy ? \\`<br><small>Bearbeitung: <strong>\${order.claimedBy}</strong></small>\\` : ''}</div>\n                            <div style="text-align:right;"><strong>€\${Number(order.total||0).toFixed(2)}</strong><br><small>\${new Date(order.createdAt).toLocaleString('de-DE')}</small></div>\n                        </div>\n                        <div style="margin-bottom:15px;"><strong>Artikel:</strong><br>\${order.items.map(item => \\`<div style="margin-left:15px;">\${item.quantity}x \${item.productName}</div>\\`).join('')}</div>\n                        \${order.notes ? \\`<div style="margin-bottom:15px;"><strong>Notizen:</strong> \${order.notes}</div>\\` : ''}\n                        <div style="display:flex;gap:10px;flex-wrap:wrap;">\n                            \${order.status === 'pending' ? \\`<button class="btn btn-success" onclick="updateOrderStatus(\${order.id}, 'approved')">✓ Bestätigen</button><button class="btn btn-danger" onclick="updateOrderStatus(\${order.id}, 'rejected')">✗ Ablehnen</button>\\` : ''}\n                            \${order.status === 'approved' ? \\`<button class="btn btn-primary" onclick="updateOrderStatus(\${order.id}, 'processing')">🚛 Übernehmen / In Bearbeitung</button>\\` : ''}\n                            \${order.status === 'processing' ? \\`<button class="btn btn-success" onclick="updateOrderStatus(\${order.id}, 'delivered')">✓ Geliefert</button>\\` : ''}\n                        </div>\n                    </div>\n                \\`).join('');\n                document.getElementById('orders-list').innerHTML = ordersHtml || '<p>Keine Bestellungen vorhanden</p>';\n            } catch (error) { document.getElementById('orders-list').innerHTML = '<p>Fehler beim Laden der Bestellungen: ' + error.message + '</p>'; }\n        }\n`;
  index = index.replace('\n    </script>\n</body>', overrides + '\n    </script>\n</body>');
}

fs.writeFileSync(indexFile, index);

// ---- kasse.html ----
let kasse = fs.readFileSync(kasseFile, 'utf8');
fs.copyFileSync(kasseFile, new URL(`../frontend/kasse-before-back-${stamp}.html`, import.meta.url));
if (!kasse.includes('class="back"')) {
  kasse = kasse.replace('.logout{border:0;background:#374151;color:#fff;border-radius:10px;padding:9px 12px;font-weight:700}', '.logout,.back{border:0;background:#374151;color:#fff;border-radius:10px;padding:9px 12px;font-weight:700}.back{margin-right:8px}');
  kasse = kasse.replace('<header class="top"><div class="topline"><div><h1>💶 Kassenrechner</h1>', '<header class="top"><div class="topline"><div style="display:flex;align-items:center;"><button class="back" onclick="location.href=\'/\'">← Zurück</button><div><h1>💶 Kassenrechner</h1>');
  kasse = kasse.replace('<div id="who" class="who"></div></div><button class="logout"', '<div id="who" class="who"></div></div></div><button class="logout"');
}
// Admin should only see cash-enabled stands in the POS selector.
kasse = kasse.replace("stands.map(s=>`<option value=\"${s.code}\">${s.name}</option>`)", "stands.filter(s=>s.posEnabled!==false).map(s=>`<option value=\"${s.code}\">${s.name}</option>`)");
fs.writeFileSync(kasseFile, kasse);

console.log('Frontend patched: POS back button, sponsor POS visibility, supplier stand filter.');
