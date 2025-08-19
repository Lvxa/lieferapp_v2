// server.full-flex.v2.js — Full API incl. admin stand selection and supplier overview
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
const ALLOW_PLAINTEXT = String(process.env.ALLOW_PLAINTEXT_PASSWORDS||'1') !== '0';

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
let db = { users: [], stands: [], products: [], orders: [], idempotency: {} };
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { console.error('db.json parse error:', e.message); }

function saveDB(){ fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8'); }
const nextId = (arr) => (arr.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1);
const findStandByCode = (code) => (db.stands||[]).find(s => s.code === String(code).toLowerCase());
const findStandById = (id) => (db.stands||[]).find(s => s.id === Number(id));
const standIdToCode = (idOrCode) => (/^\d+$/.test(String(idOrCode)) ? (findStandById(Number(idOrCode))?.code || null) : String(idOrCode).toLowerCase());
const getStand = (idOrCode) => (/^\d+$/.test(String(idOrCode)) ? findStandById(Number(idOrCode)) : findStandByCode(idOrCode));
const findProduct = (idOrName) => (db.products||[]).find(p => String(p.id) === String(idOrName) || p.name === idOrName);

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
  if (req.user?.role === 'bierbude') return req.user.standort || null;
  return null;
}

// ===== Routes =====
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString(), users: (db.users||[]).length, stands: (db.stands||[]).length }));

// Login (bcrypt OR plaintext when enabled)
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = (db.users||[]).find(x => x.username === username);
  if (!u) return res.status(401).json({ error: 'Invalid credentials' });

  let ok = false;
  const hash = u.passwordHash || '';
  if (hash && hash.startsWith('$2')) {
    try { ok = bcrypt.compareSync(password || '', hash); } catch {}
  }
  if (!ok && ALLOW_PLAINTEXT && typeof u.password === 'string') {
    ok = (password === u.password);
  }
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  res.json({ token: signToken(u), user: { id: u.id, username: u.username, role: u.role, standort: u.standort || null } });
});
app.get('/api/auth/me', authenticateToken, (req, res) => res.json({ user: req.user }));

// Stands (Admin)
app.get('/api/stands', authenticateToken, requireRole('admin'), (req, res) => {
  res.json((db.stands||[]).map(({ id, name, code, type }) => ({ id, name, code, type: type || 'bierbude' })));
});

// Products
app.get('/api/products', authenticateToken, (req, res) => res.json(db.products||[]));

// Orders helpers
function withItemNames(items){
  return (items||[]).map(it => {
    const prod = (db.products||[]).find(p => p.id === it.productId);
    return { productId: it.productId, quantity: it.quantity, priceAtOrder: it.priceAtOrder, productName: prod ? prod.name : String(it.productId), price: it.priceAtOrder };
  });
}
function serializeOrder(o){ return { ...o, items: withItemNames(o.items) }; }

// Orders
app.get('/api/orders', authenticateToken, (req, res) => {
  let rows = [];
  if (req.user.role === 'bierbude') {
    rows = (db.orders||[]).filter(o => o.standort === (req.user.standort || ''));
  } else if (req.user.role === 'admin' || req.user.role === 'lieferant') {
    const filter = req.query.standId || req.query.standort;
    rows = (filter ? (db.orders||[]).filter(o => o.standort === standIdToCode(filter)) : (db.orders||[]));
  } else {
    return res.status(403).json({ error: 'Forbidden' });
  }
  rows = rows.slice().sort((a,b) => b.id - a.id).map(serializeOrder);
  res.json(rows);
});

// Supplier/Admin overview with optional ?status=
app.get('/api/orders/all', authenticateToken, (req, res) => {
  if (!['lieferant','admin'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
  let rows = (db.orders||[]).slice().sort((a,b) => b.id - a.id);
  const status = (req.query.status||'').toString();
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

  if (idempotencyKey && db.idempotency && db.idempotency[idempotencyKey]) {
    const existing = (db.orders||[]).find(o => o.id === db.idempotency[idempotencyKey]);
    if (existing) return res.json(serializeOrder(existing));
  }

  let total = 0; const normalized = [];
  for (const raw of items) {
    const product = findProduct(raw.productId ?? raw.id);
    const qty = Number(raw.quantity ?? raw.qty);
    if (!product) return res.status(400).json({ error: `Unknown product ${raw.productId}` });
    if (!qty || qty <= 0) return res.status(400).json({ error: 'Invalid quantity' });
    if (qty > (Number(product.stock) || 0)) return res.status(400).json({ error: `Insufficient stock for ${product.name}` });
    const price = Number(product.price || 0);
    normalized.push({ productId: product.id, quantity: qty, priceAtOrder: price });
    total += qty * price;
  }
  for (const it of normalized) {
    const product = (db.products||[]).find(p => p.id === it.productId);
    product.stock = Math.max(0, (Number(product.stock)||0) - it.quantity);
  }
  const nowIso = new Date().toISOString();
  const order = { id: nextId(db.orders||[]), standort: stand.code, items: normalized, total, status: 'pending', deliveryTime: deliveryTime || null, notes: notes || null, createdBy: req.user.username, createdAt: nowIso, updatedAt: nowIso };
  (db.orders||[]).push(order);
  db.idempotency = db.idempotency || {};
  if (idempotencyKey) db.idempotency[idempotencyKey] = order.id;
  saveDB();

  // Socket notify
  io.to(`stand:${stand.code}`).emit('new_order', serializeOrder(order));
  io.to(`stand:${stand.code}`).emit('order_status_changed', { orderId: order.id, status: order.status, standort: stand.code });
  io.to('lieferant:all').emit('new_order', serializeOrder(order));
  io.to('admin:all').emit('new_order', serializeOrder(order));

  res.json(serializeOrder(order));
});

const ALLOWED_STATUS = ['pending','approved','rejected','processing','delivered'];
app.put('/api/orders/:id/status', authenticateToken, (req, res) => {
  if (!['lieferant','admin'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
  const id = Number(req.params.id);
  const { status } = req.body || {};
  if (!ALLOWED_STATUS.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const order = (db.orders||[]).find(o => o.id === id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  order.status = status; order.updatedAt = new Date().toISOString(); saveDB();

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
        const code = user.standort;
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
