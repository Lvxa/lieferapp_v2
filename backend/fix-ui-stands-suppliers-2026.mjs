import fs from 'fs';

const indexFile = new URL('../frontend/index.html', import.meta.url);
const kasseFile = new URL('../frontend/kasse.html', import.meta.url);
const stamp = Date.now();

// ---------- Lieferanten-Dashboard ----------
let index = fs.readFileSync(indexFile, 'utf8');
fs.copyFileSync(indexFile, new URL(`../frontend/index-before-ui-fix-${stamp}.html`, import.meta.url));

// Ensure the filter is visibly present, independent of previous patch state.
if (!index.includes('id="supplier-stand-filter"')) {
  const heading = /(<h3>\s*Eingehende Bestellungen\s*<\/h3>)/i;
  index = index.replace(heading, `$1
                    <div class="form-group" style="margin:12px 0;">
                        <label for="supplier-stand-filter"><strong>📍 Standort filtern</strong></label>
                        <select id="supplier-stand-filter" style="width:100%;padding:12px;border:2px solid #e2e8f0;border-radius:8px;font-size:1rem;">
                            <option value="">Alle Standorte</option>
                        </select>
                    </div>`);
}

// Add a robust runtime override. This also works when there are zero orders.
if (!index.includes('/* supplier-filter-ui-fix-v2 */')) {
  const js = `
        /* supplier-filter-ui-fix-v2 */
        let supplierStatusFilter = '';

        async function loadSupplierStandOptionsV2() {
            const sel = document.getElementById('supplier-stand-filter');
            if (!sel) return;
            try {
                const current = sel.value;
                const stands = await apiCall('/stands');
                sel.innerHTML = '<option value="">Alle Standorte</option>' + stands.map(s =>
                    '<option value="' + s.code + '">' + s.name + '</option>'
                ).join('');
                if ([...sel.options].some(o => o.value === current)) sel.value = current;
                sel.onchange = () => loadOrdersV2(supplierStatusFilter);
            } catch (e) {
                console.error('Standorte konnten nicht geladen werden:', e);
                sel.innerHTML = '<option value="">Standorte konnten nicht geladen werden</option>';
            }
        }

        async function loadOrdersV2(status = '') {
            supplierStatusFilter = status || '';
            showLoading('orders-list');
            try {
                const params = new URLSearchParams();
                if (supplierStatusFilter) params.set('status', supplierStatusFilter);
                const stand = document.getElementById('supplier-stand-filter')?.value || '';
                if (stand) params.set('standort', stand);
                const rows = await apiCall('/orders/all' + (params.toString() ? '?' + params.toString() : ''));

                const html = rows.map(order => \`
                    <div class="order-item \${order.status}">
                        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;gap:10px;">
                            <div>
                                <strong>Bestellung #\${order.id}</strong>
                                <span class="status-badge status-\${order.status}">\${getStatusText(order.status)}</span><br>
                                <small>von: <strong>\${order.standName || order.standort}</strong></small>
                                \${order.claimedBy ? \`<br><small>Bearbeitung: <strong>\${order.claimedBy}</strong></small>\` : ''}
                            </div>
                            <div style="text-align:right;"><strong>€\${Number(order.total || 0).toFixed(2)}</strong><br><small>\${new Date(order.createdAt).toLocaleString('de-DE')}</small></div>
                        </div>
                        <div style="margin-bottom:12px;"><strong>Artikel:</strong><br>
                            \${order.items.map(item => \`<div style="margin-left:15px;">\${item.quantity}x \${item.productName}</div>\`).join('')}
                        </div>
                        \${order.notes ? \`<div style="margin-bottom:12px;"><strong>Notizen:</strong> \${order.notes}</div>\` : ''}
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            \${order.status === 'pending' ? \`<button class="btn btn-success" onclick="updateOrderStatus(\${order.id}, 'approved')">✓ Bestätigen</button><button class="btn btn-danger" onclick="updateOrderStatus(\${order.id}, 'rejected')">✗ Ablehnen</button>\` : ''}
                            \${order.status === 'approved' ? \`<button class="btn btn-primary" onclick="updateOrderStatus(\${order.id}, 'processing')">🚛 Übernehmen</button>\` : ''}
                            \${order.status === 'processing' ? \`<button class="btn btn-success" onclick="updateOrderStatus(\${order.id}, 'delivered')">✓ Geliefert</button>\` : ''}
                        </div>
                    </div>
                \`).join('');
                document.getElementById('orders-list').innerHTML = html || '<p>Keine Bestellungen für diesen Filter vorhanden.</p>';
            } catch (e) {
                document.getElementById('orders-list').innerHTML = '<p>Fehler beim Laden: ' + e.message + '</p>';
            }
        }

        async function loadSupplierStatsV2() {
            try {
                const stand = document.getElementById('supplier-stand-filter')?.value || '';
                const data = await apiCall('/analytics/supplier' + (stand ? '?standort=' + encodeURIComponent(stand) : ''));
                document.getElementById('lieferant-stats').innerHTML = \`
                    <div class="stat-card"><div class="stat-number">\${data.pendingOrders}</div><div class="stat-label">Ausstehend</div></div>
                    <div class="stat-card"><div class="stat-number">\${data.approvedOrders}</div><div class="stat-label">Bestätigt</div></div>
                    <div class="stat-card"><div class="stat-number">\${data.processingOrders}</div><div class="stat-label">In Bearbeitung</div></div>
                    <div class="stat-card"><div class="stat-number">\${data.deliveredToday}</div><div class="stat-label">Heute geliefert</div></div>
                \`;
            } catch (e) { console.error(e); }
        }

        // Override the old functions used by buttons/switchRole.
        loadOrders = loadOrdersV2;
        loadLieferantStats = loadSupplierStatsV2;
        loadLieferantData = async function() {
            await loadSupplierStandOptionsV2();
            await loadOrdersV2('');
            await loadSupplierStatsV2();
        };
`;
  index = index.replace(/\n\s*<\/script>/i, js + '\n    </script>');
}

fs.writeFileSync(indexFile, index);

// ---------- Kassenrechner ----------
let kasse = fs.readFileSync(kasseFile, 'utf8');
fs.copyFileSync(kasseFile, new URL(`../frontend/kasse-before-ui-fix-${stamp}.html`, import.meta.url));

if (!kasse.includes('id="back-home"')) {
  kasse = kasse.replace(
    /<header class="top">/i,
    `<header class="top"><button id="back-home" onclick="location.href='/'" style="border:0;background:#374151;color:#fff;border-radius:10px;padding:10px 14px;font-weight:800;font-size:14px;margin-bottom:10px;">← Zurück zur Übersicht</button>`
  );
}

fs.writeFileSync(kasseFile, kasse);

console.log('UI-Fix fertig: Lieferanten-Standortfilter + sichtbarer Zurück-Button in der Kasse.');
