// ============================================================
//  TERATRIBE — Backend Server v2
//  MongoDB + Cloudinary + Image Upload
// ============================================================

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const path       = require('path');
const multer     = require('multer');
const { v4: uuidv4 } = require('uuid');
const { MongoClient, ObjectId } = require('mongodb');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

const app  = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET          = process.env.JWT_SECRET          || 'teratribe_secret';
const MONGODB_URI         = process.env.MONGODB_URI         || '';
const RAZORPAY_KEY_ID     = process.env.RAZORPAY_KEY_ID     || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';

cloudinary.config({
  cloud_name : process.env.CLOUDINARY_CLOUD_NAME,
  api_key    : process.env.CLOUDINARY_API_KEY,
  api_secret : process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ storage: multer.memoryStorage() });

let db;
async function connectDB() {
  if (!MONGODB_URI) { console.log('⚠️  No MONGODB_URI'); return; }
  try {
    const client = await MongoClient.connect(MONGODB_URI);
    db = client.db('teratribe');
    console.log('✅ MongoDB connected!');
    await seedAdminIfNeeded();
  } catch(e) { console.error('❌ MongoDB error:', e.message); }
}

async function seedAdminIfNeeded() {
  const users = db.collection('users');
  if (!await users.findOne({ email:'admin@teratribe.in' })) {
    const hash = await bcrypt.hash('admin123', 10);
    await users.insertOne({ name:'Admin', email:'admin@teratribe.in', phone:'', password:hash, isAdmin:true, createdAt:new Date() });
    console.log('✅ Admin created');
  }
  const prods = db.collection('products');
  if (await prods.countDocuments()===0) {
    await prods.insertMany([
      { name:'Organic Vegetables Box', emoji:'🥦', desc:'Seasonal veggies harvested daily.', price:299, unit:'per kg box', category:'Vegetables', badge:'Best Seller', featured:true, image:null, createdAt:new Date() },
      { name:'Fresh Fruits Basket',    emoji:'🍎', desc:'Naturally ripened, pesticide-free.', price:349, unit:'per kg box', category:'Fruits',     badge:'New',     featured:false, image:null, createdAt:new Date() },
      { name:'Whole Grains & Pulses',  emoji:'🌾', desc:'Stone-ground unprocessed grains.',  price:199, unit:'500g pack',  category:'Grains',     badge:null,      featured:false, image:null, createdAt:new Date() },
      { name:'Cold-Pressed Oils',      emoji:'🫙', desc:'Pure oils retaining all nutrients.',price:449, unit:'per litre',  category:'Oils',       badge:null,      featured:false, image:null, createdAt:new Date() },
      { name:'Raw Honey & Spices',     emoji:'🍯', desc:'Wildflower honey & hand-ground spices.',price:399,unit:'per set', category:'Spices',    badge:'Premium', featured:false, image:null, createdAt:new Date() },
      { name:'A2 Dairy & Eggs',        emoji:'🥛', desc:'A2 milk, ghee, curd, free-range eggs.',price:129,unit:'per litre',category:'Dairy',     badge:null,      featured:false, image:null, createdAt:new Date() },
    ]);
    console.log('✅ Products seeded');
  }
}

const mem = { users:[], products:[], orders:[], messages:[] };
function col(name) { return db ? db.collection(name) : null; }

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function authMW(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error:'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error:'Invalid token' }); }
}
function adminMW(req, res, next) {
  authMW(req, res, () => { if (!req.user.isAdmin) return res.status(403).json({ error:'Admin only' }); next(); });
}

function uploadToCloudinary(buffer, folder='teratribe') {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type:'image', transformation:[{width:800,height:800,crop:'limit'},{quality:'auto'}] },
      (err, result) => err ? reject(err) : resolve(result)
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

// ── AUTH ────────────────────────────────────────────────────
app.post('/api/auth/signup', async (req,res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name||!email||!password) return res.status(400).json({ error:'Fill all fields' });
    const users = col('users');
    if (users) {
      if (await users.findOne({ email })) return res.status(400).json({ error:'Email already registered' });
      const hash = await bcrypt.hash(password,10);
      const r = await users.insertOne({ name, email, phone:phone||'', password:hash, isAdmin:false, createdAt:new Date() });
      const token = jwt.sign({ id:r.insertedId, name, email, isAdmin:false }, JWT_SECRET, { expiresIn:'7d' });
      return res.json({ token, user:{ id:r.insertedId, name, email, isAdmin:false } });
    }
    if (mem.users.find(u=>u.email===email)) return res.status(400).json({ error:'Email already registered' });
    const hash = await bcrypt.hash(password,10);
    const user = { id:uuidv4(), name, email, phone:phone||'', password:hash, isAdmin:false };
    mem.users.push(user);
    const token = jwt.sign({ id:user.id, name, email, isAdmin:false }, JWT_SECRET, { expiresIn:'7d' });
    res.json({ token, user:{ id:user.id, name, email, isAdmin:false } });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/auth/login', async (req,res) => {
  try {
    const { email, password } = req.body;
    const users = col('users');
    let user = users ? await users.findOne({ email }) : mem.users.find(u=>u.email===email);
    if (!user) return res.status(400).json({ error:'Invalid email or password' });
    if (!await bcrypt.compare(password, user.password)) return res.status(400).json({ error:'Invalid email or password' });
    const token = jwt.sign({ id:user._id||user.id, name:user.name, email:user.email, isAdmin:user.isAdmin }, JWT_SECRET, { expiresIn:'7d' });
    res.json({ token, user:{ id:user._id||user.id, name:user.name, email:user.email, isAdmin:user.isAdmin } });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── PRODUCTS ────────────────────────────────────────────────
app.get('/api/products', async (req,res) => {
  try {
    const products = col('products');
    if (products) {
      const filter = req.query.category && req.query.category!=='all' ? { category:req.query.category } : {};
      return res.json(await products.find(filter).sort({ createdAt:-1 }).toArray());
    }
    res.json(mem.products);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/products', adminMW, upload.single('image'), async (req,res) => {
  try {
    const { name, emoji, desc, price, unit, category, badge, featured } = req.body;
    if (!name||!price) return res.status(400).json({ error:'Name and price required' });
    let imageUrl = null;
    if (req.file) { const r = await uploadToCloudinary(req.file.buffer); imageUrl = r.secure_url; }
    const product = { name, emoji:emoji||'📦', desc:desc||'', price:Number(price), unit:unit||'unit', category:category||'Other', badge:badge||null, featured:featured==='true', image:imageUrl, createdAt:new Date() };
    const products = col('products');
    if (products) { const r = await products.insertOne(product); return res.json({ ...product, _id:r.insertedId }); }
    product.id = uuidv4(); mem.products.push(product); res.json(product);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.put('/api/products/:id', adminMW, upload.single('image'), async (req,res) => {
  try {
    const update = { ...req.body };
    if (req.file) { const r = await uploadToCloudinary(req.file.buffer); update.image = r.secure_url; }
    if (update.price) update.price = Number(update.price);
    const products = col('products');
    if (products) { await products.updateOne({ _id:new ObjectId(req.params.id) },{ $set:update }); return res.json({ success:true }); }
    const idx = mem.products.findIndex(p=>p.id===req.params.id);
    if (idx>-1) mem.products[idx] = { ...mem.products[idx], ...update };
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.delete('/api/products/:id', adminMW, async (req,res) => {
  try {
    const products = col('products');
    if (products) { await products.deleteOne({ _id:new ObjectId(req.params.id) }); return res.json({ success:true }); }
    mem.products = mem.products.filter(p=>p.id!==req.params.id); res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── PAYMENT ─────────────────────────────────────────────────
app.post('/api/payment/create-order', authMW, async (req,res) => {
  try {
    const Razorpay = require('razorpay');
    const rz = new Razorpay({ key_id:RAZORPAY_KEY_ID, key_secret:RAZORPAY_KEY_SECRET });
    const order = await rz.orders.create({ amount:Math.round(req.body.amount*100), currency:'INR', receipt:'TT_'+Date.now() });
    res.json(order);
  } catch(e) {
    if (!RAZORPAY_KEY_ID) return res.json({ id:'order_DEMO_'+Date.now(), amount:req.body.amount*100, currency:'INR', _demo:true });
    res.status(500).json({ error:e.message });
  }
});

app.post('/api/payment/verify', authMW, (req,res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (razorpay_order_id?.startsWith('order_DEMO_')) return res.json({ verified:true });
    const crypto = require('crypto');
    const expected = crypto.createHmac('sha256',RAZORPAY_KEY_SECRET).update(razorpay_order_id+'|'+razorpay_payment_id).digest('hex');
    res.json({ verified:expected===razorpay_signature });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── ORDERS ───────────────────────────────────────────────────
app.post('/api/orders', authMW, async (req,res) => {
  try {
    const { items, address, city, pincode, phone, paymentMethod, paymentId, total } = req.body;
    if (!items?.length||!address) return res.status(400).json({ error:'Items and address required' });
    const orders = col('orders');
    const num = orders ? (await orders.countDocuments())+1001 : mem.orders.length+1001;
    const order = { id:'TT'+num, userId:req.user.id?.toString(), customerName:req.user.name, customerEmail:req.user.email, items, address:`${address}, ${city} — ${pincode}`, phone, total:Number(total), paymentMethod:paymentMethod||'COD', paymentId:paymentId||null, paymentStatus:paymentMethod==='COD'?'pending':'paid', status:'confirmed', createdAt:new Date() };
    if (orders) { await orders.insertOne(order); return res.json(order); }
    mem.orders.unshift(order); res.json(order);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/api/orders/my', authMW, async (req,res) => {
  try {
    const orders = col('orders');
    if (orders) return res.json(await orders.find({ userId:req.user.id?.toString() }).sort({ createdAt:-1 }).toArray());
    res.json(mem.orders.filter(o=>o.userId===req.user.id));
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/api/orders', adminMW, async (req,res) => {
  try {
    const orders = col('orders');
    if (orders) return res.json(await orders.find().sort({ createdAt:-1 }).toArray());
    res.json(mem.orders);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.put('/api/orders/:id/status', adminMW, async (req,res) => {
  try {
    const orders = col('orders');
    if (orders) { await orders.updateOne({ id:req.params.id },{ $set:{ status:req.body.status } }); return res.json({ success:true }); }
    const o = mem.orders.find(x=>x.id===req.params.id); if(o) o.status=req.body.status;
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── MESSAGES ─────────────────────────────────────────────────
app.post('/api/messages', async (req,res) => {
  try {
    const { name, email, phone, subject, message } = req.body;
    if (!name||!email) return res.status(400).json({ error:'Name and email required' });
    const msg = { name, email, phone:phone||'', subject:subject||'General Inquiry', message:message||'', read:false, createdAt:new Date() };
    const messages = col('messages');
    if (messages) { await messages.insertOne(msg); return res.json({ success:true }); }
    msg.id=uuidv4(); mem.messages.unshift(msg); res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/api/messages', adminMW, async (req,res) => {
  try {
    const messages = col('messages');
    if (messages) return res.json(await messages.find().sort({ createdAt:-1 }).toArray());
    res.json(mem.messages);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── ANALYTICS ────────────────────────────────────────────────
app.get('/api/admin/analytics', adminMW, async (req,res) => {
  try {
    if (db) {
      const [orders,users,prodCount,messages] = await Promise.all([
        db.collection('orders').find().toArray(),
        db.collection('users').find().toArray(),
        db.collection('products').countDocuments(),
        db.collection('messages').find().toArray(),
      ]);
      return res.json({ totalOrders:orders.length, totalRevenue:orders.reduce((s,o)=>s+o.total,0), totalProducts:prodCount, totalUsers:users.filter(u=>!u.isAdmin).length, totalMessages:messages.length, unreadMessages:messages.filter(m=>!m.read).length, recentOrders:orders.slice(0,5) });
    }
    res.json({ totalOrders:mem.orders.length, totalRevenue:mem.orders.reduce((s,o)=>s+o.total,0), totalProducts:mem.products.length, totalUsers:mem.users.filter(u=>!u.isAdmin).length, totalMessages:mem.messages.length });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/api/admin/users', adminMW, async (req,res) => {
  try {
    const users = col('users');
    if (users) { const list = await users.find().toArray(); return res.json(list.map(({ password,...u })=>u)); }
    res.json(mem.users.map(({ password,...u })=>u));
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/{*path}', (req,res) => res.sendFile(path.join(__dirname,'public','index.html')));

connectDB().then(()=>{
  app.listen(PORT, ()=>{
    console.log(`\n🌿 TERATRIBE v2 running at http://localhost:${PORT}`);
    console.log(`🍃 MongoDB: ${MONGODB_URI?'✅':'❌ Not set'}`);
    console.log(`🖼️  Cloudinary: ${process.env.CLOUDINARY_CLOUD_NAME?'✅':'❌ Not set'}\n`);
  });
});
