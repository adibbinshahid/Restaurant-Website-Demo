const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadsDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 }, fileFilter: (req, file, cb) => { if (file.mimetype.startsWith('image/')) cb(null, true); else cb(new Error('Images only')); } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({ secret: process.env.SESSION_SECRET || 'lcinco-pizza-secret-2024', resave: false, saveUninitialized: false, cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 } }));

const requireAdmin = (req, res, next) => {
  if (req.session && req.session.isAdmin) return next();
  res.status(401).json({ error: 'Unauthorized' });
};

// ── Public API ───────────────────────────────────────────────────────────────

app.get('/api/pizzas', (req, res) => {
  const { category } = req.query;
  const rows = category && category !== 'all'
    ? db.prepare('SELECT * FROM pizzas WHERE active=1 AND category=? ORDER BY sort_order,id').all(category)
    : db.prepare('SELECT * FROM pizzas WHERE active=1 ORDER BY sort_order,id').all();
  res.json(rows);
});

app.get('/api/pizzas/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM pizzas WHERE id=? AND active=1').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

app.get('/api/hero-banners', (req, res) => res.json(db.prepare('SELECT * FROM hero_banners WHERE active=1 ORDER BY sort_order').all()));
app.get('/api/announcements', (req, res) => res.json(db.prepare('SELECT * FROM announcements WHERE active=1 ORDER BY id').all()));
app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const obj = {}; rows.forEach(r => (obj[r.key] = r.value)); res.json(obj);
});
app.get('/api/meals', (req, res) => res.json(db.prepare('SELECT * FROM meals WHERE active=1 ORDER BY sort_order').all()));

app.post('/api/check-delivery', (req, res) => {
  const { zip } = req.body;
  if (!zip) return res.json({ available: false, message: 'Please enter a ZIP code.' });
  const clean = zip.trim().replace(/\s/g, '');
  const ok = /^75[0-9]{3}$/.test(clean) || /^9[2-5][0-9]{3}$/.test(clean);
  res.json({ available: ok, message: ok ? '✓ Delivery available! Estimated time: 30 min.' : '✗ Sorry, we don\'t deliver to this area yet.' });
});

app.get('/api/store-status', (req, res) => {
  const settings = {};
  db.prepare('SELECT key, value FROM store_settings').all().forEach(r => (settings[r.key] = r.value));
  const isOpen = settings.is_open === '1';
  const autoSchedule = settings.auto_schedule === '1';
  let accepting = isOpen;
  if (isOpen && autoSchedule && settings.schedule) {
    try {
      const schedule = JSON.parse(settings.schedule);
      const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
      const now = new Date();
      const dayName = days[now.getDay()];
      const daySchedule = schedule[dayName];
      if (daySchedule && daySchedule.enabled) {
        const [oh, om] = daySchedule.open.split(':').map(Number);
        const [ch, cm] = daySchedule.close.split(':').map(Number);
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const openMinutes = oh * 60 + om;
        let closeMinutes = ch * 60 + cm;
        if (closeMinutes === 0) closeMinutes = 24 * 60;
        accepting = currentMinutes >= openMinutes && currentMinutes < closeMinutes;
      } else {
        accepting = false;
      }
    } catch (_) {}
  }
  res.json({ accepting, isOpen, autoSchedule, message: settings.status_message || '' });
});

app.post('/api/validate-coupon', (req, res) => {
  const { code, subtotal } = req.body;
  const coupon = db.prepare('SELECT * FROM coupons WHERE code=? AND active=1').get(code?.toUpperCase());
  if (!coupon) return res.json({ valid: false, message: 'Coupon not found or inactive' });
  if (coupon.expires_at && coupon.expires_at < Math.floor(Date.now() / 1000)) return res.json({ valid: false, message: 'Coupon has expired' });
  if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) return res.json({ valid: false, message: 'Coupon usage limit reached' });
  if (subtotal < coupon.min_order) return res.json({ valid: false, message: `Minimum order $${coupon.min_order.toFixed(2)} required` });
  const discount = coupon.type === 'percent' ? Math.round(subtotal * coupon.value / 100 * 100) / 100 : Math.min(coupon.value, subtotal);
  res.json({ valid: true, discount, type: coupon.type, value: coupon.value, message: `${coupon.description} — saves $${discount.toFixed(2)}` });
});

// ── Admin Auth ────────────────────────────────────────────────────────────────

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM admin_users WHERE username=?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
  req.session.isAdmin = true; req.session.adminUser = username;
  res.json({ success: true });
});
app.post('/admin/logout', (req, res) => { req.session.destroy(() => res.json({ success: true })); });
app.get('/admin/check-auth', (req, res) => res.json({ authenticated: !!(req.session && req.session.isAdmin) }));

// ── Admin: Stats (Dashboard) ──────────────────────────────────────────────────

app.get('/admin/api/stats', requireAdmin, (req, res) => {
  const now = Math.floor(Date.now() / 1000);
  const todayStart = now - (now % 86400);
  const weekStart = now - 7 * 86400;
  const monthStart = now - 30 * 86400;

  const pizzaStats = db.prepare('SELECT COUNT(*) as total, SUM(active) as active, SUM(CASE WHEN active=0 THEN 1 ELSE 0 END) as inactive FROM pizzas').get();
  const ordersByStatus = db.prepare("SELECT status, COUNT(*) as count FROM orders GROUP BY status").all();
  const statusMap = {};
  ordersByStatus.forEach(r => (statusMap[r.status] = r.count));

  const activeStatuses = ['received','processing','out_for_delivery'];
  const ongoingOrders = db.prepare(`SELECT * FROM orders WHERE status IN ('received','processing','out_for_delivery') ORDER BY created_at DESC`).all();
  const ongoingRevenue = ongoingOrders.reduce((s, o) => s + o.total, 0);

  const revenue = {
    ongoing: Math.round(ongoingRevenue * 100) / 100,
    today: db.prepare("SELECT COALESCE(SUM(total),0) as v FROM orders WHERE status!='cancelled' AND created_at>=?").get(todayStart).v,
    week: db.prepare("SELECT COALESCE(SUM(total),0) as v FROM orders WHERE status!='cancelled' AND created_at>=?").get(weekStart).v,
    month: db.prepare("SELECT COALESCE(SUM(total),0) as v FROM orders WHERE status!='cancelled' AND created_at>=?").get(monthStart).v,
    lifetime: db.prepare("SELECT COALESCE(SUM(total),0) as v FROM orders WHERE status!='cancelled'").get().v,
  };

  const couponStats = {
    total_active: db.prepare('SELECT COUNT(*) as v FROM coupons WHERE active=1').get().v,
    used_in_active: db.prepare(`SELECT COUNT(*) as v FROM orders WHERE status IN ('received','processing','out_for_delivery') AND coupon_code IS NOT NULL`).get().v,
    uses_today: db.prepare("SELECT COUNT(*) as v FROM orders WHERE coupon_code IS NOT NULL AND created_at>=?").get(todayStart).v,
    uses_week: db.prepare("SELECT COUNT(*) as v FROM orders WHERE coupon_code IS NOT NULL AND created_at>=?").get(weekStart).v,
    uses_month: db.prepare("SELECT COUNT(*) as v FROM orders WHERE coupon_code IS NOT NULL AND created_at>=?").get(monthStart).v,
    uses_lifetime: db.prepare("SELECT COUNT(*) as v FROM orders WHERE coupon_code IS NOT NULL").get().v,
  };

  // Chart data: last 30 days by day
  const chartRows = db.prepare(`
    SELECT date(created_at, 'unixepoch') as day,
           COALESCE(SUM(CASE WHEN status!='cancelled' THEN total ELSE 0 END),0) as income,
           COUNT(CASE WHEN status!='cancelled' THEN 1 END) as order_count
    FROM orders
    WHERE created_at >= ?
    GROUP BY day ORDER BY day ASC
  `).all(monthStart);

  // Fill missing days with 0
  const chartData = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date((now - i * 86400) * 1000);
    const dayStr = d.toISOString().split('T')[0];
    const row = chartRows.find(r => r.day === dayStr);
    chartData.push({ day: dayStr, income: row ? Math.round(row.income * 100) / 100 : 0, order_count: row ? row.order_count : 0 });
  }

  res.json({
    pizzas: pizzaStats,
    orders: { ...statusMap, total: Object.values(statusMap).reduce((s, v) => s + v, 0), active_count: ongoingOrders.length, out_for_delivery: statusMap.out_for_delivery || 0, received: statusMap.received || 0, processing: statusMap.processing || 0 },
    revenue,
    coupons: couponStats,
    chart_data: chartData,
    status_distribution: statusMap,
  });
});

// ── Admin: Pizzas ─────────────────────────────────────────────────────────────

app.get('/admin/api/pizzas', requireAdmin, (req, res) => res.json(db.prepare('SELECT * FROM pizzas ORDER BY sort_order,id').all()));

app.post('/admin/api/pizzas', requireAdmin, upload.single('image'), (req, res) => {
  const d = req.body;
  const image_url = req.file ? `/uploads/${req.file.filename}` : (d.image_url || '');
  const result = db.prepare('INSERT INTO pizzas (name,description,category,price_s,price_m,price_l,image_url,badge,is_vegetarian,is_spicy,rating,reviews_count,sort_order,active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(d.name, d.description||'', d.category||'meat', parseFloat(d.price_s)||10.90, parseFloat(d.price_m)||12.90, parseFloat(d.price_l)||15.90, image_url, d.badge||'', d.is_vegetarian==='1'?1:0, d.is_spicy==='1'?1:0, parseFloat(d.rating)||4.5, parseInt(d.reviews_count)||0, parseInt(d.sort_order)||0, d.active==='0'?0:1);
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put('/admin/api/pizzas/:id', requireAdmin, upload.single('image'), (req, res) => {
  const ex = db.prepare('SELECT * FROM pizzas WHERE id=?').get(req.params.id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const d = req.body;
  const image_url = req.file ? `/uploads/${req.file.filename}` : (d.image_url || ex.image_url);
  db.prepare('UPDATE pizzas SET name=?,description=?,category=?,price_s=?,price_m=?,price_l=?,image_url=?,badge=?,is_vegetarian=?,is_spicy=?,rating=?,reviews_count=?,sort_order=?,active=? WHERE id=?').run(d.name||ex.name, d.description!==undefined?d.description:ex.description, d.category||ex.category, parseFloat(d.price_s)||ex.price_s, parseFloat(d.price_m)||ex.price_m, parseFloat(d.price_l)||ex.price_l, image_url, d.badge!==undefined?d.badge:ex.badge, d.is_vegetarian!==undefined?(d.is_vegetarian==='1'?1:0):ex.is_vegetarian, d.is_spicy!==undefined?(d.is_spicy==='1'?1:0):ex.is_spicy, parseFloat(d.rating)||ex.rating, parseInt(d.reviews_count)||ex.reviews_count, parseInt(d.sort_order)||ex.sort_order, d.active!==undefined?(d.active==='0'?0:1):ex.active, req.params.id);
  res.json({ success: true });
});

app.delete('/admin/api/pizzas/:id', requireAdmin, (req, res) => { db.prepare('DELETE FROM pizzas WHERE id=?').run(req.params.id); res.json({ success: true }); });

// ── Admin: Reviews ────────────────────────────────────────────────────────────

app.get('/admin/api/reviews', requireAdmin, (req, res) => {
  const { pizza_id } = req.query;
  const rows = pizza_id ? db.prepare('SELECT * FROM reviews WHERE pizza_id=? ORDER BY created_at DESC').all(pizza_id) : db.prepare('SELECT * FROM reviews ORDER BY created_at DESC').all();
  res.json(rows);
});

app.post('/admin/api/reviews', requireAdmin, (req, res) => {
  const { pizza_id, reviewer_name, rating, comment } = req.body;
  const result = db.prepare('INSERT INTO reviews (pizza_id, reviewer_name, rating, comment) VALUES (?,?,?,?)').run(pizza_id, reviewer_name||'Anonymous', parseInt(rating), comment||'');
  recalcPizzaRating(pizza_id);
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put('/admin/api/reviews/:id', requireAdmin, (req, res) => {
  const ex = db.prepare('SELECT * FROM reviews WHERE id=?').get(req.params.id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const { reviewer_name, rating, comment } = req.body;
  db.prepare('UPDATE reviews SET reviewer_name=?, rating=?, comment=? WHERE id=?').run(reviewer_name||ex.reviewer_name, parseInt(rating)||ex.rating, comment!==undefined?comment:ex.comment, req.params.id);
  recalcPizzaRating(ex.pizza_id);
  res.json({ success: true });
});

app.delete('/admin/api/reviews/:id', requireAdmin, (req, res) => {
  const ex = db.prepare('SELECT pizza_id FROM reviews WHERE id=?').get(req.params.id);
  db.prepare('DELETE FROM reviews WHERE id=?').run(req.params.id);
  if (ex) recalcPizzaRating(ex.pizza_id);
  res.json({ success: true });
});

function recalcPizzaRating(pizzaId) {
  const stats = db.prepare('SELECT COUNT(*) as count, COALESCE(AVG(rating),0) as avg FROM reviews WHERE pizza_id=?').get(pizzaId);
  db.prepare('UPDATE pizzas SET rating=?, reviews_count=? WHERE id=?').run(Math.round(stats.avg * 10) / 10, stats.count, pizzaId);
}

// ── Admin: Orders ─────────────────────────────────────────────────────────────

app.get('/admin/api/orders', requireAdmin, (req, res) => {
  const { status } = req.query;
  const rows = status ? db.prepare('SELECT * FROM orders WHERE status=? ORDER BY created_at DESC').all(status) : db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  res.json(rows);
});

app.post('/admin/api/orders', requireAdmin, (req, res) => {
  const d = req.body;
  const num = 'LC-' + String(db.prepare('SELECT COUNT(*)+1 as n FROM orders').get().n).padStart(4, '0');
  const result = db.prepare('INSERT INTO orders (order_number,customer_name,customer_email,customer_phone,delivery_address,items,coupon_code,coupon_discount,subtotal,delivery_fee,total,status,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(num, d.customer_name, d.customer_email||'', d.customer_phone||'', d.delivery_address||'', d.items, d.coupon_code||null, parseFloat(d.coupon_discount)||0, parseFloat(d.subtotal), parseFloat(d.delivery_fee)||2.99, parseFloat(d.total), d.status||'received', d.notes||'');
  res.json({ success: true, id: result.lastInsertRowid, order_number: num });
});

app.patch('/admin/api/orders/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  const validStatuses = ['received','processing','out_for_delivery','completed','cancelled'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const now = Math.floor(Date.now() / 1000);
  db.prepare('UPDATE orders SET status=?, updated_at=? WHERE id=?').run(status, now, req.params.id);
  res.json({ success: true });
});

app.put('/admin/api/orders/:id', requireAdmin, (req, res) => {
  const d = req.body;
  const ex = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const now = Math.floor(Date.now() / 1000);
  db.prepare('UPDATE orders SET customer_name=?,customer_email=?,customer_phone=?,delivery_address=?,status=?,notes=?,updated_at=? WHERE id=?').run(d.customer_name||ex.customer_name, d.customer_email||ex.customer_email, d.customer_phone||ex.customer_phone, d.delivery_address||ex.delivery_address, d.status||ex.status, d.notes!==undefined?d.notes:ex.notes, now, req.params.id);
  res.json({ success: true });
});

app.delete('/admin/api/orders/:id', requireAdmin, (req, res) => { db.prepare('DELETE FROM orders WHERE id=?').run(req.params.id); res.json({ success: true }); });

// ── Admin: Coupons ────────────────────────────────────────────────────────────

app.get('/admin/api/coupons', requireAdmin, (req, res) => res.json(db.prepare('SELECT * FROM coupons ORDER BY created_at DESC').all()));

app.post('/admin/api/coupons', requireAdmin, (req, res) => {
  const d = req.body;
  const result = db.prepare('INSERT INTO coupons (code,description,type,value,min_order,max_uses,active,expires_at) VALUES (?,?,?,?,?,?,?,?)').run(d.code?.toUpperCase(), d.description||'', d.type||'percent', parseFloat(d.value), parseFloat(d.min_order)||0, parseInt(d.max_uses)||0, d.active==='0'?0:1, d.expires_at?parseInt(d.expires_at):null);
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put('/admin/api/coupons/:id', requireAdmin, (req, res) => {
  const ex = db.prepare('SELECT * FROM coupons WHERE id=?').get(req.params.id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const d = req.body;
  db.prepare('UPDATE coupons SET code=?,description=?,type=?,value=?,min_order=?,max_uses=?,active=?,expires_at=? WHERE id=?').run(d.code?.toUpperCase()||ex.code, d.description!==undefined?d.description:ex.description, d.type||ex.type, parseFloat(d.value)||ex.value, parseFloat(d.min_order)||ex.min_order, parseInt(d.max_uses)||ex.max_uses, d.active!==undefined?(d.active==='0'?0:1):ex.active, d.expires_at?parseInt(d.expires_at):ex.expires_at, req.params.id);
  res.json({ success: true });
});

app.delete('/admin/api/coupons/:id', requireAdmin, (req, res) => { db.prepare('DELETE FROM coupons WHERE id=?').run(req.params.id); res.json({ success: true }); });

// ── Admin: Meals ──────────────────────────────────────────────────────────────

app.get('/admin/api/meals', requireAdmin, (req, res) => res.json(db.prepare('SELECT * FROM meals ORDER BY sort_order,id').all()));

app.post('/admin/api/meals', requireAdmin, upload.single('image'), (req, res) => {
  const d = req.body;
  const image_url = req.file ? `/uploads/${req.file.filename}` : (d.image_url||'');
  const result = db.prepare('INSERT INTO meals (name,description,components,price,image_url,active,sort_order) VALUES (?,?,?,?,?,?,?)').run(d.name, d.description||'', d.components||'[]', parseFloat(d.price), image_url, d.active==='0'?0:1, parseInt(d.sort_order)||0);
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put('/admin/api/meals/:id', requireAdmin, upload.single('image'), (req, res) => {
  const ex = db.prepare('SELECT * FROM meals WHERE id=?').get(req.params.id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const d = req.body;
  const image_url = req.file ? `/uploads/${req.file.filename}` : (d.image_url||ex.image_url);
  db.prepare('UPDATE meals SET name=?,description=?,components=?,price=?,image_url=?,active=?,sort_order=? WHERE id=?').run(d.name||ex.name, d.description!==undefined?d.description:ex.description, d.components||ex.components, parseFloat(d.price)||ex.price, image_url, d.active!==undefined?(d.active==='0'?0:1):ex.active, parseInt(d.sort_order)||ex.sort_order, req.params.id);
  res.json({ success: true });
});

app.delete('/admin/api/meals/:id', requireAdmin, (req, res) => { db.prepare('DELETE FROM meals WHERE id=?').run(req.params.id); res.json({ success: true }); });

// ── Admin: Banners ────────────────────────────────────────────────────────────

app.get('/admin/api/banners', requireAdmin, (req, res) => res.json(db.prepare('SELECT * FROM hero_banners ORDER BY sort_order').all()));

app.post('/admin/api/banners', requireAdmin, upload.single('image'), (req, res) => {
  const d = req.body;
  const image_url = req.file ? `/uploads/${req.file.filename}` : (d.image_url||'');
  const result = db.prepare('INSERT INTO hero_banners (title,subtitle,description,cta_text,cta_link,image_url,sort_order,active) VALUES (?,?,?,?,?,?,?,?)').run(d.title, d.subtitle||'', d.description||'', d.cta_text||'Order Now', d.cta_link||'#pizzas', image_url, parseInt(d.sort_order)||0, d.active==='0'?0:1);
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put('/admin/api/banners/:id', requireAdmin, upload.single('image'), (req, res) => {
  const ex = db.prepare('SELECT * FROM hero_banners WHERE id=?').get(req.params.id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const d = req.body;
  const image_url = req.file ? `/uploads/${req.file.filename}` : (d.image_url||ex.image_url);
  db.prepare('UPDATE hero_banners SET title=?,subtitle=?,description=?,cta_text=?,cta_link=?,image_url=?,sort_order=?,active=? WHERE id=?').run(d.title||ex.title, d.subtitle!==undefined?d.subtitle:ex.subtitle, d.description!==undefined?d.description:ex.description, d.cta_text||ex.cta_text, d.cta_link||ex.cta_link, image_url, parseInt(d.sort_order)||ex.sort_order, d.active!==undefined?(d.active==='0'?0:1):ex.active, req.params.id);
  res.json({ success: true });
});

app.delete('/admin/api/banners/:id', requireAdmin, (req, res) => { db.prepare('DELETE FROM hero_banners WHERE id=?').run(req.params.id); res.json({ success: true }); });

// ── Admin: Announcements ──────────────────────────────────────────────────────

app.get('/admin/api/announcements', requireAdmin, (req, res) => res.json(db.prepare('SELECT * FROM announcements ORDER BY id').all()));
app.post('/admin/api/announcements', requireAdmin, (req, res) => { const { text, active } = req.body; const result = db.prepare('INSERT INTO announcements (text,active) VALUES (?,?)').run(text, active==='0'?0:1); res.json({ success: true, id: result.lastInsertRowid }); });
app.put('/admin/api/announcements/:id', requireAdmin, (req, res) => { db.prepare('UPDATE announcements SET text=?,active=? WHERE id=?').run(req.body.text, req.body.active==='0'?0:1, req.params.id); res.json({ success: true }); });
app.delete('/admin/api/announcements/:id', requireAdmin, (req, res) => { db.prepare('DELETE FROM announcements WHERE id=?').run(req.params.id); res.json({ success: true }); });

// ── Admin: Site Settings ──────────────────────────────────────────────────────

app.get('/admin/api/settings', requireAdmin, (req, res) => res.json(db.prepare('SELECT * FROM settings').all()));
app.post('/admin/api/settings', requireAdmin, (req, res) => { db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run(req.body.key, req.body.value); res.json({ success: true }); });

// ── Admin: Notification Emails ────────────────────────────────────────────────

app.get('/admin/api/notification-emails', requireAdmin, (req, res) => res.json(db.prepare('SELECT * FROM notification_emails ORDER BY created_at').all()));
app.post('/admin/api/notification-emails', requireAdmin, (req, res) => {
  const { email, label } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  try {
    const result = db.prepare('INSERT INTO notification_emails (email, label) VALUES (?,?)').run(email.trim().toLowerCase(), label || '');
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (_) { res.status(400).json({ error: 'Email already exists' }); }
});
app.put('/admin/api/notification-emails/:id', requireAdmin, (req, res) => {
  const { email, label, active } = req.body;
  db.prepare('UPDATE notification_emails SET email=?, label=?, active=? WHERE id=?').run(email.trim().toLowerCase(), label || '', active === '0' ? 0 : 1, req.params.id);
  res.json({ success: true });
});
app.delete('/admin/api/notification-emails/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM notification_emails WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── Admin: Store Settings ─────────────────────────────────────────────────────

app.get('/admin/api/store-settings', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM store_settings').all();
  const obj = {}; rows.forEach(r => (obj[r.key] = r.value)); res.json(obj);
});

app.post('/admin/api/store-settings', requireAdmin, (req, res) => {
  const { key, value } = req.body;
  db.prepare('INSERT OR REPLACE INTO store_settings (key,value) VALUES (?,?)').run(key, value);
  res.json({ success: true });
});

// ── Public: Order Tracking ────────────────────────────────────────────────────

app.get('/api/track-order', (req, res) => {
  const code = (req.query.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'Order code required' });
  const order = db.prepare('SELECT * FROM orders WHERE order_number=?').get(code);
  if (!order) return res.status(404).json({ error: 'No order found with this code. Please double-check and try again.' });
  res.json({
    order_number: order.order_number,
    status: order.status,
    customer_name: order.customer_name,
    delivery_address: order.delivery_address,
    total: order.total,
    items: JSON.parse(order.items || '[]'),
    created_at: order.created_at,
    notes: order.notes,
  });
});

// ── Public: Contact Form ──────────────────────────────────────────────────────

app.post('/api/contact', (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'Name, email and message are required' });
  console.log(`📬 Contact form — ${name} <${email}>: ${subject}`);
  res.json({ success: true });
});

// ── Serve static pages ────────────────────────────────────────────────────────

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));
app.get('/about', (req, res) => res.sendFile(path.join(__dirname, 'public/about.html')));
app.get('/contact', (req, res) => res.sendFile(path.join(__dirname, 'public/contact.html')));
app.get('/track', (req, res) => res.sendFile(path.join(__dirname, 'public/track.html')));
app.get('/delivery', (req, res) => res.sendFile(path.join(__dirname, 'public/delivery.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'public/terms.html')));
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'public/privacy.html')));
app.get('/faq', (req, res) => res.sendFile(path.join(__dirname, 'public/faq.html')));

app.listen(PORT, () => {
  console.log(`\n🍕 L'Cinco Pizza running at http://localhost:${PORT}`);
  console.log(`🔧 Admin: http://localhost:${PORT}/admin  (admin/admin)\n`);
});
