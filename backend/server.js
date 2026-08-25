// server.full-flex.v3.js — 2026 stock lifecycle, stand selection and supplier overview
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

// ===== JSON DB =====
const DATA_DIR = path.resolve(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
fs.mkdirSync(DATA_DIR, { recursive: true });
let db = { users: [], stands: [], products: [], orders: [], idempotency: {}, stockMovements: [] };
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { console.error('db.json parse error:', e.message); }
db.users = db.users || [];
db.stands = db.stands || [];
db.products = db.products || [];
db.orders = db.orders || [];
db.idempotency = db.idempotency || {};
db.stockMovements = db.stockMovements || [];

function saveDB() { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8'); }
const nextId = (arr) => (arr.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1);

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
const findProduct = (idOrName) => db.products.find(p => String(p.id) === String(idOrName) || p.name === idOrName);

function canonicalStandCode(value) {
  return findStand(value)?.code || null;
}

function isReservationStatus(status) {
  return ['pending', 'approved', 'processing'].includes(status);
}

function reservedQty(productId, excludeOrderId = null) {
  let total = 0;
  for (const order of db.orders) {
    if (excludeOrderId != null && Number(order.id) === Number(excludeOrderId)) continue;
    if (!isReservationStatus(order.status) || order.stockApplied) continue;
    for (const item of order.items || []) {
      if (Number(item.productId) === Number(productId)) total += Number(item.quantity) || 0;
    }
  }
  return total;
}

function productForResponse(product, forBierbude = false) {
  const physicalStock = Number(product.stock) || 0;
  const reservedStock = reservedQty(product.id);
  const availableStock = Math.max(0, physicalStock - reservedStock);
  if (forBierbude) {
    return { ...product, physicalStock, reservedStock, availableStock, stock: availableStock };
  }
  return { ...product, physicalStock, reservedStock, availableStock };
}

function recordStockMovement({ productId, delta, reason, orderId = null, standort = null, createdBy = null, note = null }) {
  const product = db.products.find(p => Number(p.id) === Number(productId));
  const movement = {
    id: nextId(db.stockMovements),
    productId: Number(productId),
    productName: product?.name || String(productId),
    delta: Number(delta),
    stockAfter: Number(product?.stock) || 0,
    reason,
    orderId: orderId == null ? null : Number(orderId),
    standort: standort || null,
    note: note || null,
    createdBy: createdBy || null,
    createdAt: new Date().toISOString()
  };
  db.stockMovements.push(movement);
  return movement;
}

// ===== Auth =====
const signToken = (u) => jwt.sign({ id: u.id, username: u.username, role: u.role, standort: u.standort || null }, JWT_SECRET, { expiresIn: '7d' });
function authenticateToken(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: 'Invalid token' }); }
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

// ===== Routes =====
app.get('/api/health', (req, res) => res.json({
  ok: true,
  time: new Date().toISOString(),
  users: db.users.length,
  stands: db.stands.length,
  products: db.products.length,
  orders: db.orders.length
}));

// Login (bcrypt OR plaintext when enabled)
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = db.users.find(x => x.username === username);
  if (!u) return res.status(401).json({ error: 'Invalid credentials' });

  let ok = false;
  const hash = u.passwordHash || '';
  if (hash && hash.startsWith('$2')) {
    try { ok = bcrypt.compareSync(password || '', hash); } catch {}
  }
  if (!ok && ALLOW_PLAINTEXT && typeof u.password === 'string') ok = (password === u.password);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  res.json({ token: signToken(u), user: { id: u.id, username: u.username, role: u.role, standort: u.standort || null } });
});
app.get('/api/auth/me', authenticateToken, (req, res) => res.json({ user: req.user }));

// Stands
app.get('/api/stands', authenticateToken, requireRole('admin'), (req, res) => {
  res.json(db.stands.map(({ id, name, code, type }) => ({ id, name, code, type: type || 'bierbude' })));
});

// Products. Bierbuden receive available stock as `stock`; admin/supplier receive physical stock plus reservation fields.
app.get('/api/products', authenticateToken, (req, res) => {
  const forBierbude = req.user.role === 'bierbude';
  res.json(db.products.map(p => productForResponse(p, forBierbude)));
});

// Stock overview / movement history
app.get('/api/stocks', authenticateToken, requireRole('admin', 'lieferant'), (req, res) => {
  res.json(db.products.map(p => productForResponse(p, false)));
});

app.get('/api/stock/movements', authenticateToken, requireRole('admin', 'lieferant'), (req, res) => {
  res.json(db.stockMovements.slice().sort((a, b) => Number(b.id) - Number(a.id)));
});

// Manual stock correction or goods receipt.
// Body: { stock: 25, reason: 'Wareneingang ...' } OR { delta: 10, reason: 'Wareneingang ...' }
app.patch('/api/products/:id/stock', authenticateToken, requireRole('admin', 'lieferant'), (req, res) => {
  const product = findProduct(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const hasStock = req.body?.stock !== undefined;
  const hasDelta = req.body?.delta !== undefined;
  if (hasStock === hasDelta) return res.status(400).json({ error: 'Send exactly one of stock or delta' });

  const before = Number(product.stock) || 0;
  let after;
  if (hasStock) after = Number(req.body.stock);
  else after = before + Number(req.body.delta);

  if (!Number.isFinite(after) || after < 0) return res.status(400).json({ error: 'Invalid stock value' });
  product.stock = after;
  const delta = after - before;
  recordStockMovement({
    productId: product.id,
    delta,
    reason: req.body?.reason || (delta >= 0 ? 'manual_receipt' : 'manual_correction'),
    createdBy: req.user.username,
    note: req.body?.note || null
  });
  saveDB();
  res.json(productForResponse(product, false));
});

// Orders helpers
function withItemNames(items) {
  return (items || []).map(it => {
    const prod = db.products.find(p => Number(p.id) === Number(it.productId));
    return {
      productId: it.productId,
      quantity: it.quantity,
      priceAtOrder: it.priceAtOrder,
      productName: prod ? prod.name : String(it.productId),
      unit: prod?.unit || null,
      price: it.priceAtOrder
    };
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
  } else {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json(rows.slice().sort((a, b) => Number(b.id) - Number(a.id)).map(serializeOrder));
});

app.get('/api/orders/all', authenticateToken, (req, res) => {
  if (!['lieferant', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
  let rows = db.orders.slice().sort((a, b) => Number(b.id) - Number(a.id));
  const status = (req.query.status || '').toString();
  if (status) rows = rows.filter(o => o.status === status);
  res.json(rows.map(serializeOrder));
});

// Creating an order RESERVES stock but does not change physical stock.
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

    const physical = Number(product.stock) || 0;
    const reserved = reservedQty(product.id);
    const available = Math.max(0, physical - reserved);
    if (qty > available) return res.status(400).json({ error: `Insufficient available stock for ${product.name}. Available: ${available}` });

    const price = Number(product.price) || 0;
    normalized.push({ productId: product.id, quantity: qty, priceAtOrder: price });
    total += qty * price;
  }

  const nowIso = new Date().toISOString();
  const order = {
    id: nextId(db.orders),
    standort: stand.code,
    items: normalized,
    total,
    status: 'pending',
    stockApplied: false,
    stockAppliedAt: null,
    deliveryTime: deliveryTime || null,
    notes: notes || null,
    createdBy: req.user.username,
    createdAt: nowIso,
    updatedAt: nowIso
  };
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

  // Physical stock is removed exactly once when the delivery is completed.
  if (status === 'delivered' && !order.stockApplied) {
    for (const item of order.items || []) {
      const product = db.products.find(p => Number(p.id) === Number(item.productId));
      if (!product) return res.status(400).json({ error: `Unknown product ${item.productId}` });
      if ((Number(product.stock) || 0) < Number(item.quantity)) {
        return res.status(400).json({ error: `Not enough physical stock to complete delivery: ${product.name}` });
      }
    }

    for (const item of order.items || []) {
      const product = db.products.find(p => Number(p.id) === Number(item.productId));
      product.stock = (Number(product.stock) || 0) - Number(item.quantity);
      recordStockMovement({
        productId: product.id,
        delta: -Number(item.quantity),
        reason: 'order_delivered',
        orderId: order.id,
        standort: order.standort,
        createdBy: req.user.username
      });
    }
    order.stockApplied = true;
    order.stockAppliedAt = new Date().toISOString();
  }

  // If a completed delivery is deliberately reopened, restore the stock once.
  if (previousStatus === 'delivered' && status !== 'delivered' && order.stockApplied) {
    for (const item of order.items || []) {
      const product = db.products.find(p => Number(p.id) === Number(item.productId));
      if (!product) continue;
      product.stock = (Number(product.stock) || 0) + Number(item.quantity);
      recordStockMovement({
        productId: product.id,
        delta: Number(item.quantity),
        reason: 'order_delivery_reversed',
        orderId: order.id,
        standort: order.standort,
        createdBy: req.user.username
      });
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

// ===== Sockets =====
io.on('connection', (socket) => {
  socket.on('join', (user) => {
    try {
      if (!user || !user.role) return;
      if (user.role === 'bierbude') {
        const code = canonicalStandCode(user.standort);
        if (code) socket.join(`stand:${code}`);
      } else if (user.role === 'lieferant') {
        socket.join('lieferant:all');
      } else if (user.role === 'admin') {
        socket.join('admin:all');
      }
    } catch {}
  });
});

server.listen(PORT, HOST, () => console.log(`API listening on http://${HOST}:${PORT}  (ALLOW_PLAINTEXT_PASSWORDS=${ALLOW_PLAINTEXT})`));
