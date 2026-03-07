const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const app = express();
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'teratribe_secret_2024';
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const DB_PATH = path.join(__dirname, 'data');
if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH, { recursive: true });
['products.json','orders.json','messages.json'].forEach(f => { if (!fs.existsSync(path.join(DB_PATH,f))) fs.writeFileSync(path.join(DB_PATH,f),'[]'); });
if (!fs.existsSync(path.join(DB_PATH,'users.json'))) fs.writeFileSync(path.join(DB_PATH,'users.json'),'[]');
const usersData = JSON.parse(fs.readFileSync(path.join(DB_PATH,'users.json'),'utf8'));
if (!usersData.find(u => u.email==='admin@teratribe.in')) { usersData.push({id:'admin-001',name:'Admin',email:'admin@teratribe.in',phone:'',password:bcrypt.hashSync('admin123',10),isAdmin:true,createdAt:new Date().toISOString()}); fs.writeFileSync(path.join(DB_PATH,'users.json'),JSON.stringify(usersData,null,2)); console.log('Admin created!'); }
function readDB(file) { try { return JSON.parse(fs.readFileSync(path.join(DB_PATH,file),'utf8')); } catch { return []; } }
function writeDB(file,data) { fs.writeFileSync(path.join(DB_PATH,file),JSON.stringify(data,null,2)); }
function authMiddleware(req,res,next) { const token=req.headers.authorization?.split(' ')[1]; if (!token) return res.status(401).json({error:'No token'}); try { req.user=jwt.verify(token,JWT_SECRET); next(); } catch { res.status(401).json({error:'Invalid token'}); } }
function adminMiddleware(req,res,next) { authMiddleware(req,res,()=>{ if (!req.user.isAdmin) return res.status(403).json({error:'Admin only'}); next(); }); }
app.post('/api/auth/signup',async(req,res)=>{ try { const {name,email,phone,password}=req.body; if (!name||!email||!password) return res.status(400).json({error:'Required fields missing'}); const users=readDB('users.json'); if (users.find(u=>u.email===email)) return res.status(400).json({error:'Email already registered'}); const user={id:uuidv4(),name,email,phone:phone||'',password:await bcrypt.hash(password,10),isAdmin:false,createdAt:new Date().toISOString()}; users.push(user); writeDB('users.json',users); const token=jwt.sign({id:user.id,name,email,isAdmin:false},JWT_SECRET,{expiresIn:'7d'}); res.json({token,user:{id:user.id,name,email,isAdmin:false}}); } catch(err) { res.status(500).json({error:err.message}); } });
app.post('/api/auth/login',async(req,res)=>{ try { const {email,password}=req.body; const users=readDB('users.json'); const user=users.find(u=>u.email===email); if (!user||!await bcrypt.compare(password,user.password)) return res.status(400).json({error:'Invalid email or password'}); const token=jwt.sign({id:user.id,name:user.name,email,isAdmin:user.isAdmin},JWT_SECRET,{expiresIn:'7d'}); res.json({token,user:{id:user.id,name:user.name,email,isAdmin:user.isAdmin}}); } catch(err) { res.status(500).json({error:err.message}); } });
app.get('/api/auth/me',authMiddleware,(req,res)=>res.json({user:req.user}));
app.get('/api/products',(req,res)=>{ const products=readDB('products.json'); const {category}=req.query; res.json(category&&category!=='all'?products.filter(p=>p.category===category):products); });
app.post('/api/products',adminMiddleware,(req,res)=>{ const {name,emoji,desc,price,unit,category,badge,featured}=req.body; if (!name||!price) return res.status(400).json({error:'Name and price required'}); const products=readDB('products.json'); const product={id:uuidv4(),name,emoji:emoji||'??',desc:desc||'',price:Number(price),unit:unit||'unit',category:category||'Other',badge:badge||null,featured:featured||false,createdAt:new Date().toISOString()}; products.push(product); writeDB('products.json',products); res.json(product); });
app.put('/api/products/:id',adminMiddleware,(req,res)=>{ const products=readDB('products.json'); const idx=products.findIndex(p=>p.id===req.params.id); if (idx===-1) return res.status(404).json({error:'Not found'}); products[idx]={...products[idx],...req.body}; writeDB('products.json',products); res.json(products[idx]); });
app.delete('/api/products/:id',adminMiddleware,(req,res)=>{ writeDB('products.json',readDB('products.json').filter(p=>p.id!==req.params.id)); res.json({success:true}); });
app.post('/api/orders',authMiddleware,(req,res)=>{ try { const {items,address,city,pincode,phone,paymentMethod,total}=req.body; if (!items?.length||!address) return res.status(400).json({error:'Items and address required'}); const orders=readDB('orders.json'); const order={id:'TT'+(1000+orders.length+1),userId:req.user.id,customerName:req.user.name,customerEmail:req.user.email,items,address:`${address}, ${city} - ${pincode}`,phone,total:Number(total),paymentMethod:paymentMethod||'COD',paymentStatus:paymentMethod==='COD'?'pending':'paid',status:'confirmed',createdAt:new Date().toISOString()}; orders.unshift(order); writeDB('orders.json',orders); res.json(order); } catch(err) { res.status(500).json({error:err.message}); } });
app.get('/api/orders/my',authMiddleware,(req,res)=>res.json(readDB('orders.json').filter(o=>o.userId===req.user.id)));
app.get('/api/orders',adminMiddleware,(req,res)=>res.json(readDB('orders.json')));
app.put('/api/orders/:id/status',adminMiddleware,(req,res)=>{ const orders=readDB('orders.json'); const idx=orders.findIndex(o=>o.id===req.params.id); if (idx===-1) return res.status(404).json({error:'Not found'}); orders[idx].status=req.body.status; writeDB('orders.json',orders); res.json(orders[idx]); });
app.post('/api/messages',(req,res)=>{ const {name,email,phone,subject,message}=req.body; if (!name||!email) return res.status(400).json({error:'Name and email required'}); const messages=readDB('messages.json'); const msg={id:uuidv4(),name,email,phone:phone||'',subject:subject||'General',message:message||'',read:false,createdAt:new Date().toISOString()}; messages.unshift(msg); writeDB('messages.json',messages); res.json({success:true}); });
app.get('/api/messages',adminMiddleware,(req,res)=>res.json(readDB('messages.json')));
app.put('/api/messages/:id/read',adminMiddleware,(req,res)=>{ const messages=readDB('messages.json'); const msg=messages.find(m=>m.id===req.params.id); if (msg) { msg.read=true; writeDB('messages.json',messages); } res.json({success:true}); });
app.get('/api/admin/analytics',adminMiddleware,(req,res)=>{ const orders=readDB('orders.json'); const users=readDB('users.json'); const products=readDB('products.json'); const messages=readDB('messages.json'); res.json({totalOrders:orders.length,totalRevenue:orders.reduce((s,o)=>s+o.total,0),totalProducts:products.length,totalUsers:users.filter(u=>!u.isAdmin).length,totalMessages:messages.length,unreadMessages:messages.filter(m=>!m.read).length,recentOrders:orders.slice(0,5),recentMessages:messages.slice(0,5)}); });
app.get('/api/admin/users',adminMiddleware,(req,res)=>{ res.json(readDB('users.json').map(({password,...u})=>u)); });
app.get('/{*path}',(req,res)=>{ res.sendFile(path.join(__dirname,'public','index.html')); });
app.listen(PORT,()=>{ console.log(`TERATRIBE running on port ${PORT}`); console.log(`Admin: admin@teratribe.in / admin123`); });
