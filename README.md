# 🌿 TERATRIBE — Full Stack Organic Grocery Website

## Ye kya hai?
Ek complete e-commerce website hai jisme:
- ✅ Products listing + filter
- ✅ Shopping cart (localStorage mein save hota hai)
- ✅ Login / Signup (JWT tokens)
- ✅ Checkout with **Razorpay payment gateway**
- ✅ Orders tracking
- ✅ Admin Dashboard (products, orders, messages, analytics)
- ✅ Contact form
- ✅ JSON file database (no SQL needed)

---

## 📁 Project Structure
```
teratribe/
├── server.js          ← Node.js + Express backend
├── package.json       ← Dependencies list
├── .env               ← Secret keys (NEVER share this!)
├── public/
│   └── index.html     ← Frontend (HTML + CSS + JS)
└── data/
    ├── products.json  ← Products database
    ├── users.json     ← Users database
    ├── orders.json    ← Orders database
    └── messages.json  ← Contact messages
```

---

## 🚀 STEP 1: Install & Run Locally

### Requirements:
- Node.js (download from https://nodejs.org — LTS version)

### Commands:
```bash
# 1. Go to project folder
cd teratribe

# 2. Install all packages
npm install

# 3. Start server
npm start
```

Open browser and go to: **http://localhost:3000**

### Admin Login:
- Email: `admin@teratribe.in`
- Password: `admin123`

---

## 💳 STEP 2: Razorpay Setup (Payment Gateway)

### Test Mode (Start here — FREE):
1. Go to https://razorpay.com and sign up
2. No documents needed for TEST mode
3. Dashboard → Settings → API Keys → **Generate Test Key**
4. Copy your `rzp_test_XXXXX` key

### Add to .env file:
```
RAZORPAY_KEY_ID=rzp_test_YOUR_KEY_HERE
RAZORPAY_KEY_SECRET=YOUR_SECRET_HERE
```

### Also update in public/index.html (line ~6):
```javascript
const RAZORPAY_KEY = 'rzp_test_YOUR_KEY_HERE';
```

### Test Cards for Razorpay Test Mode:
- Card: `4111 1111 1111 1111`
- Expiry: Any future date
- CVV: Any 3 digits
- OTP: `1234`

---

## 🔴 STEP 3: Go LIVE (Real Payments)

### Razorpay Live Mode:
1. Complete KYC on Razorpay dashboard
2. Submit: GST certificate, Bank details, PAN, Aadhaar
3. Approval takes 2-3 business days
4. Get `rzp_live_XXXXX` keys
5. Replace test keys with live keys in `.env` and `index.html`

---

## 🌐 STEP 4: Host Website (Choose One)

---

### Option A: VERCEL (Recommended — FREE)
Best for: Beginners, fast setup

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Add vercel.json in project root:**
   ```json
   {
     "version": 2,
     "builds": [{"src": "server.js", "use": "@vercel/node"}],
     "routes": [{"src": "/(.*)", "dest": "server.js"}]
   }
   ```

3. **Deploy:**
   ```bash
   vercel
   ```
   Follow prompts. Your site will be live at: `https://teratribe.vercel.app`

4. **Add Environment Variables on Vercel:**
   - Go to Vercel Dashboard → Project → Settings → Environment Variables
   - Add: `JWT_SECRET`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`

⚠️ **Note:** Vercel ke free plan mein file system nahi milta — production ke liye MongoDB Atlas use karo (free tier available). Ye next upgrade step hai.

---

### Option B: RAILWAY (Recommended for full backend — FREE tier available)
Best for: Full Node.js apps with file system

1. Go to https://railway.app
2. Click "New Project" → "Deploy from GitHub"
3. Push your code to GitHub first:
   ```bash
   git init
   git add .
   git commit -m "TERATRIBE launch"
   git push
   ```
4. Connect GitHub repo on Railway
5. Add environment variables in Railway dashboard
6. Deploy! You get a URL like: `https://teratribe.up.railway.app`

---

### Option C: HOSTINGER / GODADDY (Paid — ₹99-299/month)
Best for: Custom domain like `teratribe.in`

1. Buy hosting + domain from Hostinger (cheapest)
2. Upload files via FTP or cPanel File Manager
3. Enable Node.js in hosting panel
4. Add domain DNS settings

---

## 🌍 Custom Domain (teratribe.in)

1. Buy domain from: GoDaddy / Hostinger / BigRock (₹500-800/year)
2. In your hosting/Vercel/Railway settings → Add Custom Domain
3. Follow DNS instructions
4. Done! Site live on `www.teratribe.in`

---

## 📦 Next Level Upgrades (After Launch)

| Feature | What to use | Cost |
|---------|------------|------|
| Real Database | MongoDB Atlas | Free |
| Email notifications | Nodemailer + Gmail | Free |
| Image upload for products | Cloudinary | Free |
| SMS order alerts | Twilio / MSG91 | Paid |
| Analytics | Google Analytics | Free |
| SSL Certificate | Let's Encrypt | Free |

---

## 🔐 Security Checklist Before Go Live

- [ ] Change `JWT_SECRET` to a long random string
- [ ] Switch Razorpay keys from `test` to `live`
- [ ] Set `NODE_ENV=production` in .env
- [ ] Change admin password in users.json
- [ ] Enable HTTPS (automatic on Vercel/Railway)

---

## ❓ Common Problems

**"Cannot find module 'express'"**
→ Run `npm install` first

**"Port 3000 already in use"**
→ Change PORT in .env to 3001

**Razorpay payment not opening**
→ Check if RAZORPAY_KEY in index.html is correct

**Admin login not working**
→ Make sure users.json exists in data/ folder

---

## 📞 Need Help?
Ask Claude! Just describe what's not working.
