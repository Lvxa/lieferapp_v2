// server.full-flex.v4.js — 2026 stock, POS calculator, pricing and analytics
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express from 'express';
import http from 'http';
import cors from 'cors';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { Server as SocketIOServer } from 'socket.io';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const ALLOW_PLAINTEXT = String(process.env.ALLOW_PLAINTEXT_PASSWORDS || '1') !== '0';

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: true, credentials: true } });

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

const DATA_DIR = path.resolve(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
fs.mkdirSync(DATA_DIR, { recursive: true });
let db = { users: [], stands: [], products: [], orders: [], idempotency: {}, stockMovements: [], sales: [], posProducts: [] };
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { console.error('db.json parse error:', e.message); }
db.users = db.users || [];
db.stands = db.stands || [];
db.products = db.products || [];
db.orders = db.orders || [];
db.idempotency = db.idempotency || {};
db.stockMovements = db.stockMovements || [];
db.sales = db.sales || [];
db.posProducts = db.posProducts || [];

function saveDB() { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8'); }
const nextId = (arr) => (arr.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1);
const money = (v) => Math.round((Number(v) || 0) * 100) / 100;

function findStand(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (/^\d+$/.test(raw)) {
    const byId = db.stands.find(s => Number(s.id) === Number(raw));
    if (byId) return byId;
  }
  const q = raw.toLowerCase();
  return db.stands.find(s => String(s.code || '').toLowerCase() === q || String(s.name || '').toLowerCase() === q) || null;
}
const standIdToCode = (value) => findStand(value)?.code || null;
const getStand = (value) => findStand(value);
const canonicalStandCode = (value) => findStand(value)?.code || null;
const findProduct = (idOrName) => db.products.find(p => String(p.id) === String(idOrName) || p.name === idOrName);
const findPosProduct = (id) => db.posProducts.find(p => Number(p.id) === Number(id));

function isReservationStatus(status) { return ['pending', 'approved', 'processing'].includes(status); }
function reservedQty(productId, excludeOrderId = null) {
  let total = 0;
  for (const order of db.orders) {
    if (excludeOrderId != null && Number(order.id) === Number(excludeOrderId)) continue;
    if (!isReservationStatus(order.status) || order.stockApplied) continue;
    for (const item of order.items || []) if (Number(item.productId) === Number(productId)) total += Number(item.quantity) || 0;
  }
  return total;
}
function productForResponse(product, forBierbude = false) {
  const physicalStock = Number(product.stock) || 0;
  const reservedStock = reservedQty(product.id);
  const availableStock = Math.max(0, physicalStock - reservedStock);
  const purchasePrice = product.purchasePrice == null ? null : Number(product.purchasePrice);
  const theoreticalRevenue = product.retailPrice != null && product.retailUnitsPerStockUnit != null
    ? money(Number(product.retailPrice) * Number(product.retailUnitsPerStockUnit)) : (Number(product.price) || 0);
  const theoreticalMargin = purchasePrice == null ? null : money(theoreticalRevenue - purchasePrice);
  const base = { ...product, physicalStock, reservedStock, availableStock, purchasePrice, theoreticalRevenue, theoreticalMargin };
  if (forBierbude) return { ...base, stock: availableStock };
  return base;
}
function recordStockMovement({ productId, delta, reason, orderId = null, standort = null, createdBy = null, note = null }) {
  const product = db.products.find(p => Number(p.id) === Number(productId));
  const movement = { id: nextId(db.stockMovements), productId: Number(productId), productName: product?.name || String(productId), delta: Number(delta), stockAfter: Number(product?.stock) || 0, reason, orderId: orderId == null ? null : Number(orderId), standort: standort || null, note: note || null, createdBy: createdBy || null, createdAt: new Date().toISOString() };
  db.stockMovements.push(movement);
  return movement;
}

const signToken = (u) => jwt.sign({ id: u.id, username: u.username, role: u.role, standort: u.standort || null }, JWT_SECRET, { expiresIn: '7d' });
function authenticateToken(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); } catch { return res.status(401).json({ error: 'Invalid token' }); }
}
const requireRole = (...roles) => (req, res, next) => (!req.user || !roles.includes(req.user.role)) ? res.status(403).json({ error: 'Forbidden' }) : next();
function resolveTargetStand(req) {
  if (req.user?.role === 'admin') {
    const header = req.headers['x-impersonate-stand'];
    if (header) return standIdToCode(header);
    if (req.query.standId || req.query.standort) return standIdToCode(req.query.standId || req.query.standort);
    if (req.body?.standort) return standIdToCode(req.body.standort);
  }
  if (req.user?.role === 'bierbude') return canonicalStandCode(req.user.standort);
  return null;
}

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString(), users: db.users.length, stands: db.stands.length, products: db.products.length, orders: db.orders.length, sales: db.sales.length }));
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = db.users.find(x => x.username === username);
  if (!u) return res.status(401).json({ error: 'Invalid credentials' });
  let ok = false;
  const hash = u.passwordHash || '';
  if (hash && hash.startsWith('$2')) { try { ok = bcrypt.compareSync(password || '', hash); } catch {} }
  if (!ok && ALLOW_PLAINTEXT && typeof u.password === 'string') ok = (password === u.password);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ token: signToken(u), user: { id: u.id, username: u.username, role: u.role, standort: u.standort || null } });
});
app.get('/api/auth/me', authenticateToken, (req, res) => res.json({ user: req.user }));
app.get('/api/stands', authenticateToken, requireRole('admin'), (req, res) => res.json(db.stands.map(({ id, name, code, type }) => ({ id, name, code, type: type || 'bierbude' }))));

app.get('/api/products', authenticateToken, (req, res) => {
  const forBierbude = req.user.role === 'bierbude';
  res.json(db.products.map(p => productForResponse(p, forBierbude)));
});
app.patch('/api/products/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const product = findProduct(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const allowed = ['name', 'category', 'unit', 'package', 'minStock', 'isActive', 'barcode', 'purchasePrice', 'price', 'retailPrice', 'retailUnit', 'retailUnitsPerStockUnit', 'depositType', 'depositPrice'];
  for (const key of allowed) if (req.body?.[key] !== undefined) product[key] = req.body[key];
  if (product.purchasePrice === '') product.purchasePrice = null;
  if (product.purchasePrice != null) product.purchasePrice = Number(product.purchasePrice);
  for (const key of ['price', 'retailPrice', 'retailUnitsPerStockUnit', 'depositPrice', 'minStock']) if (product[key] != null) product[key] = Number(product[key]);
  saveDB();
  res.json(productForResponse(product, false));
});

app.get('/api/stocks', authenticateToken, requireRole('admin', 'lieferant'), (req, res) => res.json(db.products.map(p => productForResponse(p, false))));
app.get('/api/stock/movements', authenticateToken, requireRole('admin', 'lieferant'), (req, res) => res.json(db.stockMovements.slice().sort((a, b) => Number(b.id) - Number(a.id))));
app.patch('/api/products/:id/stock', authenticateToken, requireRole('admin', 'lieferant'), (req, res) => {
  const product = findProduct(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const hasStock = req.body?.stock !== undefined;
  const hasDelta = req.body?.delta !== undefined;
  if (hasStock === hasDelta) return res.status(400).json({ error: 'Send exactly one of stock or delta' });
  const before = Number(product.stock) || 0;
  const after = hasStock ? Number(req.body.stock) : before + Number(req.body.delta);
  if (!Number.isFinite(after) || after < 0) return res.status(400).json({ error: 'Invalid stock value' });
  product.stock = after;
  const delta = after - before;
  recordStockMovement({ productId: product.id, delta, reason: req.body?.reason || (delta >= 0 ? 'manual_receipt' : 'manual_correction'), createdBy: req.user.username, note: req.body?.note || null });
  saveDB();
  res.json(productForResponse(product, false));
});

function withItemNames(items) {
  return (items || []).map(it => {
    const prod = db.products.find(p => Number(p.id) === Number(it.productId));
    return { productId: it.productId, quantity: it.quantity, priceAtOrder: it.priceAtOrder, productName: prod ? prod.name : String(it.productId), unit: prod?.unit || null, price: it.priceAtOrder };
  });
}
function serializeOrder(o) { return { ...o, items: withItemNames(o.items) }; }
app.get('/api/orders', authenticateToken, (req, res) => {
  let rows = [];
  if (req.user.role === 'bierbude') {
    const ownCode = canonicalStandCode(req.user.standort);
    rows = db.orders.filter(o => o.standort === ownCode);
  } else if (req.user.role === 'admin' || req.user.role === 'lieferant') {
    const filter = req.query.standId || req.query.standort;
    const code = filter ? standIdToCode(filter) : null;
    rows = filter ? db.orders.filter(o => o.standort === code) : db.orders;
  } else return res.status(403).json({ error: 'Forbidden' });
  res.json(rows.slice().sort((a, b) => Number(b.id) - Number(a.id)).map(serializeOrder));
});
app.get('/api/orders/all', authenticateToken, (req, res) => {
  if (!['lieferant', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
  let rows = db.orders.slice().sort((a, b) => Number(b.id) - Number(a.id));
  const status = (req.query.status || '').toString();
  if (status) rows = rows.filter(o => o.status === status);
  res.json(rows.map(serializeOrder));
});
app.post('/api/orders', authenticateToken, (req, res) => {
  const targetStand = resolveTargetStand(req);
  if (!targetStand) return res.status(403).json({ error: 'No stand context. Admin: X-Impersonate-Stand or body.standort required.' });
  const stand = getStand(targetStand);
  if (!stand) return res.status(400).json({ error: 'Unknown stand' });
  const { items, deliveryTime, notes, idempotencyKey } = req.body || {};
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Order must contain items' });
  if (idempotencyKey && db.idempotency[idempotencyKey]) {
    const existing = db.orders.find(o => Number(o.id) === Number(db.idempotency[idempotencyKey]));
    if (existing) return res.json(serializeOrder(existing));
  }
  let total = 0;
  const normalized = [];
  for (const raw of items) {
    const product = findProduct(raw.productId ?? raw.id);
    const qty = Number(raw.quantity ?? raw.qty);
    if (!product) return res.status(400).json({ error: `Unknown product ${raw.productId}` });
    if (product.isActive === false) return res.status(400).json({ error: `${product.name} is not orderable` });
    if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: 'Invalid quantity' });
    const available = Math.max(0, (Number(product.stock) || 0) - reservedQty(product.id));
    if (qty > available) return res.status(400).json({ error: `Insufficient available stock for ${product.name}. Available: ${available}` });
    const price = Number(product.price) || 0;
    normalized.push({ productId: product.id, quantity: qty, priceAtOrder: price });
    total += qty * price;
  }
  const nowIso = new Date().toISOString();
  const order = { id: nextId(db.orders), standort: stand.code, items: normalized, total: money(total), status: 'pending', stockApplied: false, stockAppliedAt: null, deliveryTime: deliveryTime || null, notes: notes || null, createdBy: req.user.username, createdAt: nowIso, updatedAt: nowIso };
  db.orders.push(order);
  if (idempotencyKey) db.idempotency[idempotencyKey] = order.id;
  saveDB();
  io.to(`stand:${stand.code}`).emit('new_order', serializeOrder(order));
  io.to(`stand:${stand.code}`).emit('order_status_changed', { orderId: order.id, status: order.status, standort: stand.code });
  io.to('lieferant:all').emit('new_order', serializeOrder(order));
  io.to('admin:all').emit('new_order', serializeOrder(order));
  res.json(serializeOrder(order));
});

const ALLOWED_STATUS = ['pending', 'approved', 'rejected', 'processing', 'delivered'];
app.put('/api/orders/:id/status', authenticateToken, (req, res) => {
  if (!['lieferant', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
  const id = Number(req.params.id);
  const { status } = req.body || {};
  if (!ALLOWED_STATUS.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const order = db.orders.find(o => Number(o.id) === id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const previousStatus = order.status;
  if (status === 'delivered' && !order.stockApplied) {
    for (const item of order.items || []) {
      const product = db.products.find(p => Number(p.id) === Number(item.productId));
      if (!product) return res.status(400).json({ error: `Unknown product ${item.productId}` });
      if ((Number(product.stock) || 0) < Number(item.quantity)) return res.status(400).json({ error: `Not enough physical stock to complete delivery: ${product.name}` });
    }
    for (const item of order.items || []) {
      const product = db.products.find(p => Number(p.id) === Number(item.productId));
      product.stock = (Number(product.stock) || 0) - Number(item.quantity);
      recordStockMovement({ productId: product.id, delta: -Number(item.quantity), reason: 'order_delivered', orderId: order.id, standort: order.standort, createdBy: req.user.username });
    }
    order.stockApplied = true;
    order.stockAppliedAt = new Date().toISOString();
  }
  if (previousStatus === 'delivered' && status !== 'delivered' && order.stockApplied) {
    for (const item of order.items || []) {
      const product = db.products.find(p => Number(p.id) === Number(item.productId));
      if (!product) continue;
      product.stock = (Number(product.stock) || 0) + Number(item.quantity);
      recordStockMovement({ productId: product.id, delta: Number(item.quantity), reason: 'order_delivery_reversed', orderId: order.id, standort: order.standort, createdBy: req.user.username });
    }
    order.stockApplied = false;
    order.stockAppliedAt = null;
  }
  order.status = status;
  order.updatedAt = new Date().toISOString();
  saveDB();
  io.to(`stand:${order.standort}`).emit('order_status_changed', { orderId: order.id, status: order.status, standort: order.standort });
  io.to('lieferant:all').emit('order_updated', serializeOrder(order));
  io.to('admin:all').emit('order_updated', serializeOrder(order));
  res.json(serializeOrder(order));
});

app.get('/api/pos/products', authenticateToken, (req, res) => {
  if (!['bierbude', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
  res.json(db.posProducts.filter(p => p.isActive !== false));
});
app.post('/api/sales', authenticateToken, (req, res) => {
  if (!['bierbude', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
  const standort = resolveTargetStand(req);
  if (!standort) return res.status(400).json({ error: 'No stand context' });
  const rawItems = req.body?.items;
  if (!Array.isArray(rawItems) || !rawItems.length) return res.status(400).json({ error: 'Sale must contain items' });
  const items = [];
  let drinksTotal = 0, depositCharged = 0, estimatedCost = 0;
  for (const raw of rawItems) {
    const pos = findPosProduct(raw.posProductId ?? raw.id);
    const qty = Number(raw.quantity);
    if (!pos || pos.isActive === false) return res.status(400).json({ error: `Unknown POS product ${raw.posProductId ?? raw.id}` });
    if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: 'Invalid sale quantity' });
    const unitPrice = Number(pos.retailPrice) || 0;
    const depositPrice = Number(pos.depositPrice) || 0;
    const lineDrinks = money(qty * unitPrice), lineDeposit = money(qty * depositPrice);
    let unitCost = null;
    if (pos.productId != null) {
      const product = findProduct(pos.productId);
      const units = Number(product?.retailUnitsPerStockUnit);
      if (product?.purchasePrice != null && Number.isFinite(Number(product.purchasePrice)) && units > 0) unitCost = Number(product.purchasePrice) / units;
    }
    if (unitCost != null) estimatedCost += qty * unitCost;
    drinksTotal += lineDrinks;
    depositCharged += lineDeposit;
    items.push({ posProductId: pos.id, productId: pos.productId ?? null, name: pos.name, quantity: qty, retailUnit: pos.retailUnit, unitPrice, depositType: pos.depositType || null, depositPrice, drinksTotal: lineDrinks, depositTotal: lineDeposit, estimatedUnitCost: unitCost == null ? null : money(unitCost) });
  }
  const bottleReturns = Math.max(0, Number(req.body?.depositReturns?.bottle) || 0);
  const glassReturns = Math.max(0, Number(req.body?.depositReturns?.glass) || 0);
  const returnedDeposit = money(bottleReturns * 1 + glassReturns * 2);
  const total = money(drinksTotal + depositCharged - returnedDeposit);
  const sale = { id: nextId(db.sales), standort, items, drinksTotal: money(drinksTotal), depositCharged: money(depositCharged), depositReturns: { bottle: bottleReturns, glass: glassReturns, value: returnedDeposit }, total, estimatedCost: money(estimatedCost), estimatedMargin: money(drinksTotal - estimatedCost), createdBy: req.user.username, createdAt: new Date().toISOString() };
  db.sales.push(sale);
  saveDB();
  io.to(`stand:${standort}`).emit('sale_created', sale);
  io.to('admin:all').emit('sale_created', sale);
  res.json(sale);
});
app.get('/api/sales', authenticateToken, (req, res) => {
  let rows;
  if (req.user.role === 'bierbude') {
    const code = canonicalStandCode(req.user.standort);
    rows = db.sales.filter(s => s.standort === code);
  } else if (req.user.role === 'admin') {
    const filter = req.query.standId || req.query.standort;
    const code = filter ? standIdToCode(filter) : null;
    rows = filter ? db.sales.filter(s => s.standort === code) : db.sales;
  } else return res.status(403).json({ error: 'Forbidden' });
  res.json(rows.slice().sort((a, b) => Number(b.id) - Number(a.id)));
});

function aggregateDeliveredOrders() {
  const byStand = {}, byProduct = {};
  for (const order of db.orders.filter(o => o.status === 'delivered')) {
    const stand = findStand(order.standort), standName = stand?.name || order.standort;
    byStand[standName] ||= { standort: order.standort, standName, orderCount: 0, units: 0, value: 0, products: {} };
    byStand[standName].orderCount += 1;
    byStand[standName].value += Number(order.total) || 0;
    for (const item of order.items || []) {
      const product = findProduct(item.productId), qty = Number(item.quantity) || 0, name = product?.name || String(item.productId);
      byStand[standName].units += qty;
      byStand[standName].products[name] = (byStand[standName].products[name] || 0) + qty;
      byProduct[name] = (byProduct[name] || 0) + qty;
    }
  }
  const stands = Object.values(byStand).map(s => ({ ...s, value: money(s.value), topProducts: Object.entries(s.products).map(([name, quantity]) => ({ name, quantity })).sort((a, b) => b.quantity - a.quantity) })).sort((a, b) => b.units - a.units);
  const topProducts = Object.entries(byProduct).map(([name, quantity]) => ({ name, quantity })).sort((a, b) => b.quantity - a.quantity);
  return { stands, topProducts };
}
function aggregateSales() {
  const byStand = {}, byProduct = {};
  let revenue = 0, drinksRevenue = 0, depositsNet = 0, estimatedCost = 0, estimatedMargin = 0;
  for (const sale of db.sales) {
    const stand = findStand(sale.standort), standName = stand?.name || sale.standort;
    byStand[standName] ||= { standort: sale.standort, standName, salesCount: 0, revenue: 0, drinksRevenue: 0, estimatedMargin: 0, products: {} };
    byStand[standName].salesCount += 1;
    byStand[standName].revenue += Number(sale.total) || 0;
    byStand[standName].drinksRevenue += Number(sale.drinksTotal) || 0;
    byStand[standName].estimatedMargin += Number(sale.estimatedMargin) || 0;
    revenue += Number(sale.total) || 0;
    drinksRevenue += Number(sale.drinksTotal) || 0;
    depositsNet += (Number(sale.depositCharged) || 0) - (Number(sale.depositReturns?.value) || 0);
    estimatedCost += Number(sale.estimatedCost) || 0;
    estimatedMargin += Number(sale.estimatedMargin) || 0;
    for (const item of sale.items || []) {
      const qty = Number(item.quantity) || 0;
      byStand[standName].products[item.name] = (byStand[standName].products[item.name] || 0) + qty;
      byProduct[item.name] = (byProduct[item.name] || 0) + qty;
    }
  }
  const stands = Object.values(byStand).map(s => ({ ...s, revenue: money(s.revenue), drinksRevenue: money(s.drinksRevenue), estimatedMargin: money(s.estimatedMargin), topProducts: Object.entries(s.products).map(([name, quantity]) => ({ name, quantity })).sort((a, b) => b.quantity - a.quantity) })).sort((a, b) => b.revenue - a.revenue);
  return { revenue: money(revenue), drinksRevenue: money(drinksRevenue), depositsNet: money(depositsNet), estimatedCost: money(estimatedCost), estimatedMargin: money(estimatedMargin), stands, topProducts: Object.entries(byProduct).map(([name, quantity]) => ({ name, quantity })).sort((a, b) => b.quantity - a.quantity) };
}
app.get('/api/analytics/dashboard', authenticateToken, requireRole('admin'), (req, res) => {
  const delivered = aggregateDeliveredOrders(), sales = aggregateSales();
  const totalPhysicalStock = db.products.reduce((s, p) => s + (Number(p.stock) || 0), 0);
  const lowStockProducts = db.products.filter(p => p.isActive !== false && (Number(p.stock) || 0) <= (Number(p.minStock) || 0)).length;
  const pendingOrders = db.orders.filter(o => ['pending', 'approved', 'processing'].includes(o.status)).length;
  res.json({ totalProducts: db.products.length, totalStock: totalPhysicalStock, lowStockProducts, pendingOrders, deliveredOrders: db.orders.filter(o => o.status === 'delivered').length, deliveredValue: money(db.orders.filter(o => o.status === 'delivered').reduce((s, o) => s + (Number(o.total) || 0), 0)), reorderByStand: delivered.stands, topReorderedProducts: delivered.topProducts, retailSales: sales });
});
app.get('/api/analytics/supplier', authenticateToken, requireRole('lieferant', 'admin'), (req, res) => res.json({ pendingOrders: db.orders.filter(o => o.status === 'pending').length, approvedOrders: db.orders.filter(o => o.status === 'approved').length, processingOrders: db.orders.filter(o => o.status === 'processing').length, deliveredToday: db.orders.filter(o => o.status === 'delivered' && String(o.updatedAt || '').slice(0, 10) === new Date().toISOString().slice(0, 10)).length, totalOrders: db.orders.length }));
app.get('/api/analytics/stands', authenticateToken, requireRole('admin'), (req, res) => { const delivered = aggregateDeliveredOrders(), sales = aggregateSales(); res.json({ reorderByStand: delivered.stands, salesByStand: sales.stands }); });

io.on('connection', (socket) => {
  socket.on('join', (user) => {
    try {
      if (!user || !user.role) return;
      if (user.role === 'bierbude') { const code = canonicalStandCode(user.standort); if (code) socket.join(`stand:${code}`); }
      else if (user.role === 'lieferant') socket.join('lieferant:all');
      else if (user.role === 'admin') socket.join('admin:all');
    } catch {}
  });
});
server.listen(PORT, HOST, () => console.log(`API listening on http://${HOST}:${PORT}  (ALLOW_PLAINTEXT_PASSWORDS=${ALLOW_PLAINTEXT})`));
