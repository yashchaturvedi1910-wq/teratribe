// ============================================================
//  TERATRIBE — Backend Server
//  Tech: Node.js + Express
//  Run: node server.js
// ============================================================

const express = require('express');
const cors    = require('cors');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const fs      = require('fs');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'teratribe_secret_change_in_production';
const RAZORPAY_KEY_ID     = process.env.RAZORPAY_KEY_ID     || 'YOUR_RAZORPAY_KEY_ID';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'YOUR_RAZORPAY_KEY_SECRET';

// ── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Database helpers (JSON files as DB) ────────────────────
const DB_PATH = path.join(__dirname, 'data');

function readDB(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DB_PATH, file), 'utf8'));
  } catch { return []; }
}

function writeDB(file, data) {
  fs.writeFileSync(path.join(DB_PATH, file), JSON.stringify(data, null, 2));
}

// ── Auth Middleware ─────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function adminMiddleware(req, res, next) {
  authMiddleware(req, res, () => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin only' });
    next();
  });
}

// ══════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ══════════════════════════════════════════════════════════════

// POST /api/auth/signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'Name, email and password required' });

    const users = readDB('users.json');
    if (users.find(u => u.email === email))
      return res.status(400).json({ error: 'Email already registered' });

    const hashedPass = await bcrypt.hash(password, 10);
    const user = { id: uuidv4(), name, email, phone: phone || '', password: hashedPass, isAdmin: false, createdAt: new Date().toISOString() };
    users.push(user);
    writeDB('users.json', users);

    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, isAdmin: false }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, isAdmin: false } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const users = readDB('users.json');
    const user = users.find(u => u.email === email);
    if (!user) return res.status(400).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// ══════════════════════════════════════════════════════════════
//  PRODUCTS ROUTES
// ══════════════════════════════════════════════════════════════

// GET /api/products
app.get('/api/products', (req, res) => {
  const products = readDB('products.json');
  const { category } = req.query;
  if (category && category !== 'all')
    return res.json(products.filter(p => p.category === category));
  res.json(products);
});

// POST /api/products  [Admin only]
app.post('/api/products', adminMiddleware, (req, res) => {
  const { name, emoji, desc, price, unit, category, badge, featured } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'Name and price required' });
  const products = readDB('products.json');
  const product = { id: uuidv4(), name, emoji: emoji || '📦', desc: desc || '', price: Number(price), unit: unit || 'unit', category: category || 'Other', badge: badge || null, featured: featured || false, createdAt: new Date().toISOString() };
  products.push(product);
  writeDB('products.json', products);
  res.json(product);
});

// PUT /api/products/:id  [Admin only]
app.put('/api/products/:id', adminMiddleware, (req, res) => {
  const products = readDB('products.json');
  const idx = products.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Product not found' });
  products[idx] = { ...products[idx], ...req.body };
  writeDB('products.json', products);
  res.json(products[idx]);
});

// DELETE /api/products/:id  [Admin only]
app.delete('/api/products/:id', adminMiddleware, (req, res) => {
  let products = readDB('products.json');
  products = products.filter(p => p.id !== req.params.id);
  writeDB('products.json', products);
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════════════
//  RAZORPAY PAYMENT ROUTES
// ══════════════════════════════════════════════════════════════

// POST /api/payment/create-order
// Creates a Razorpay order — frontend will use this order_id to open payment modal
app.post('/api/payment/create-order', authMiddleware, async (req, res) => {
  try {
    const Razorpay = require('razorpay'); // npm install razorpay
    const razorpay = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });

    const { amount } = req.body; // amount in paise (₹1 = 100 paise)
    const options = {
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: 'TT_' + Date.now(),
    };
    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (err) {
    // If razorpay not installed yet, return mock order for testing
    if (err.code === 'MODULE_NOT_FOUND') {
      res.json({
        id: 'order_DEMO_' + Date.now(),
        amount: req.body.amount * 100,
        currency: 'INR',
        status: 'created',
        _demo: true,
        _message: 'Install razorpay package + add real keys to go live'
      });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// POST /api/payment/verify
// Verifies Razorpay payment signature after successful payment
app.post('/api/payment/verify', authMiddleware, (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (razorpay_order_id?.startsWith('order_DEMO_')) {
      return res.json({ verified: true, demo: true });
    }

    const crypto = require('crypto');
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET).update(body).digest('hex');

    if (expectedSignature === razorpay_signature) {
      res.json({ verified: true });
    } else {
      res.status(400).json({ verified: false, error: 'Signature mismatch' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  ORDERS ROUTES
// ══════════════════════════════════════════════════════════════

// POST /api/orders  — Place an order
app.post('/api/orders', authMiddleware, (req, res) => {
  try {
    const { items, address, city, pincode, phone, paymentMethod, paymentId, razorpayOrderId, total } = req.body;
    if (!items || !items.length || !address)
      return res.status(400).json({ error: 'Items and address required' });

    const orders = readDB('orders.json');
    const order = {
      id: 'TT' + (1000 + orders.length + 1),
      userId: req.user.id,
      customerName: req.user.name,
      customerEmail: req.user.email,
      items,
      address: `${address}, ${city} — ${pincode}`,
      phone,
      total: Number(total),
      paymentMethod: paymentMethod || 'COD',
      paymentId: paymentId || null,
      razorpayOrderId: razorpayOrderId || null,
      paymentStatus: paymentMethod === 'COD' ? 'pending' : 'paid',
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    };
    orders.unshift(order);
    writeDB('orders.json', orders);
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/my  — Customer's own orders
app.get('/api/orders/my', authMiddleware, (req, res) => {
  const orders = readDB('orders.json');
  res.json(orders.filter(o => o.userId === req.user.id));
});

// GET /api/orders  [Admin] — All orders
app.get('/api/orders', adminMiddleware, (req, res) => {
  res.json(readDB('orders.json'));
});

// PUT /api/orders/:id/status  [Admin] — Update status
app.put('/api/orders/:id/status', adminMiddleware, (req, res) => {
  const orders = readDB('orders.json');
  const idx = orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Order not found' });
  orders[idx].status = req.body.status;
  writeDB('orders.json', orders);
  res.json(orders[idx]);
});

// ══════════════════════════════════════════════════════════════
//  MESSAGES / CONTACT ROUTES
// ══════════════════════════════════════════════════════════════

// POST /api/messages
app.post('/api/messages', (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
  const messages = readDB('messages.json');
  const msg = { id: uuidv4(), name, email, phone: phone || '', subject: subject || 'General Inquiry', message: message || '', read: false, createdAt: new Date().toISOString() };
  messages.unshift(msg);
  writeDB('messages.json', messages);
  res.json({ success: true, id: msg.id });
});

// GET /api/messages  [Admin]
app.get('/api/messages', adminMiddleware, (req, res) => {
  res.json(readDB('messages.json'));
});

// PUT /api/messages/:id/read  [Admin]
app.put('/api/messages/:id/read', adminMiddleware, (req, res) => {
  const messages = readDB('messages.json');
  const msg = messages.find(m => m.id === req.params.id);
  if (msg) { msg.read = true; writeDB('messages.json', messages); }
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════════════
//  ADMIN ANALYTICS
// ══════════════════════════════════════════════════════════════

app.get('/api/admin/analytics', adminMiddleware, (req, res) => {
  const orders   = readDB('orders.json');
  const users    = readDB('users.json');
  const products = readDB('products.json');
  const messages = readDB('messages.json');

  const revenue   = orders.reduce((s, o) => s + o.total, 0);
  const paid      = orders.filter(o => o.paymentStatus === 'paid').length;
  const cod       = orders.filter(o => o.paymentMethod === 'COD').length;
  const delivered = orders.filter(o => o.status === 'delivered').length;

  res.json({
    totalOrders:   orders.length,
    totalRevenue:  revenue,
    paidOrders:    paid,
    codOrders:     cod,
    deliveredOrders: delivered,
    totalProducts: products.length,
    totalUsers:    users.filter(u => !u.isAdmin).length,
    totalMessages: messages.length,
    unreadMessages: messages.filter(m => !m.read).length,
    recentOrders:  orders.slice(0, 5),
    recentMessages: messages.slice(0, 5),
  });
});

// ── Users list [Admin] ──────────────────────────────────────
app.get('/api/admin/users', adminMiddleware, (req, res) => {
  const users = readDB('users.json').map(({ password, ...u }) => u);
  res.json(users);
});

// ── Serve frontend for all other routes ────────────────────
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start server ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌿 TERATRIBE Server running at http://localhost:${PORT}`);
  console.log(`📦 Admin login: admin@teratribe.in / admin123`);
  console.log(`💳 Razorpay: Add keys in .env to go live\n`);
});
