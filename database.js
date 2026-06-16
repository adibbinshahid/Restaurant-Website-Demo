const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dbDir = process.env.VERCEL ? '/tmp' : path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(path.join(dbDir, 'pizza.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS pizzas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'meat',
    price_s REAL DEFAULT 10.90,
    price_m REAL DEFAULT 12.90,
    price_l REAL DEFAULT 15.90,
    image_url TEXT,
    badge TEXT DEFAULT '',
    is_vegetarian INTEGER DEFAULT 0,
    is_spicy INTEGER DEFAULT 0,
    rating REAL DEFAULT 4.5,
    reviews_count INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS hero_banners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    subtitle TEXT,
    description TEXT,
    cta_text TEXT DEFAULT 'Order Now',
    cta_link TEXT DEFAULT '#pizzas',
    image_url TEXT,
    sort_order INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL,
    customer_name TEXT,
    customer_email TEXT,
    customer_phone TEXT,
    delivery_address TEXT,
    items TEXT NOT NULL,
    coupon_code TEXT,
    coupon_discount REAL DEFAULT 0,
    subtotal REAL NOT NULL,
    delivery_fee REAL DEFAULT 2.99,
    total REAL NOT NULL,
    status TEXT DEFAULT 'received',
    notes TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    description TEXT,
    type TEXT DEFAULT 'percent',
    value REAL NOT NULL,
    min_order REAL DEFAULT 0,
    max_uses INTEGER DEFAULT 0,
    used_count INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    expires_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS coupon_uses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coupon_id INTEGER NOT NULL,
    order_id INTEGER,
    discount_amount REAL NOT NULL,
    used_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS meals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    components TEXT,
    price REAL NOT NULL,
    image_url TEXT,
    active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pizza_id INTEGER NOT NULL,
    reviewer_name TEXT DEFAULT 'Anonymous',
    rating INTEGER NOT NULL,
    comment TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS store_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notification_emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    label TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
`);

// ── Seed: core data ──────────────────────────────────────────────────────────
const pizzaCount = db.prepare('SELECT COUNT(*) as count FROM pizzas').get();
if (pizzaCount.count === 0) {
  const hash = bcrypt.hashSync('admin', 10);
  db.prepare('INSERT OR IGNORE INTO admin_users (username, password_hash) VALUES (?, ?)').run('admin', hash);

  const announcements = [
    '🍕 FREE DELIVERY on orders over $25 — Use code: FREESHIP',
    '🔥 This week: 20% off all Spicy pizzas — Code: SPICY20',
    '⭐ New: Truffle & Mushroom limited edition pizza — Try it now!',
    '🎉 Rated #1 Pizza in the city — Order now and taste the difference!',
    '🛵 Fast 30-min delivery guaranteed — 7 days a week, 11AM–11PM',
  ];
  const annStmt = db.prepare('INSERT INTO announcements (text, active) VALUES (?, 1)');
  announcements.forEach(t => annStmt.run(t));

  const banners = [
    { title: 'THE TRUE TASTE OF PIZZA!', subtitle: 'Homemade with passion', description: 'Artisan pizzas made with fresh, high-quality ingredients. Discover our unique recipes!', cta_text: 'Order Now', cta_link: '#pizzas', image_url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=1200&auto=format&fit=crop', sort_order: 0 },
    { title: 'WOOD-FIRED PERFECTION', subtitle: 'Crafted with care', description: 'Every pizza baked in our traditional wood-fired oven at 900°F for the perfect crust.', cta_text: 'See Our Menu', cta_link: '#pizzas', image_url: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=1200&auto=format&fit=crop', sort_order: 1 },
    { title: 'FRESH INGREDIENTS DAILY', subtitle: 'From farm to table', description: 'We source only the finest local ingredients, prepared fresh every single day.', cta_text: 'Explore Pizzas', cta_link: '#pizzas', image_url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1200&auto=format&fit=crop', sort_order: 2 },
  ];
  const bannerStmt = db.prepare('INSERT INTO hero_banners (title, subtitle, description, cta_text, cta_link, image_url, sort_order, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)');
  banners.forEach(b => bannerStmt.run(b.title, b.subtitle, b.description, b.cta_text, b.cta_link, b.image_url, b.sort_order));

  const pizzas = [
    { name: "L'Cinco", description: "Tomato sauce, mozzarella, bacon, chicken, bell peppers, mushrooms", category: "meat", price_s: 10.90, price_m: 12.90, price_l: 15.90, image_url: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&auto=format&fit=crop", badge: "bestseller", is_vegetarian: 0, is_spicy: 0, rating: 4.8, reviews_count: 842, sort_order: 0 },
    { name: "Goat Cheese & Honey", description: "Crème fraîche, mozzarella, goat cheese, honey", category: "vegetarian", price_s: 10.90, price_m: 12.90, price_l: 15.90, image_url: "https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?w=600&auto=format&fit=crop", badge: "bestseller", is_vegetarian: 1, is_spicy: 0, rating: 4.7, reviews_count: 612, sort_order: 1 },
    { name: "Oriental", description: "Tomato sauce, mozzarella, merguez, onions, bell peppers, egg", category: "meat", price_s: 10.90, price_m: 12.90, price_l: 15.90, image_url: "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&auto=format&fit=crop", badge: "bestseller", is_vegetarian: 0, is_spicy: 1, rating: 4.6, reviews_count: 532, sort_order: 2 },
    { name: "Texane", description: "Tomato sauce, mozzarella, ham, onions, pineapple", category: "meat", price_s: 10.90, price_m: 12.90, price_l: 15.90, image_url: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop", badge: "", is_vegetarian: 0, is_spicy: 0, rating: 4.5, reviews_count: 489, sort_order: 3 },
    { name: "Countryside", description: "Crème fraîche, mozzarella, bacon, potatoes, mushrooms, champignons", category: "meat", price_s: 10.90, price_m: 12.90, price_l: 15.90, image_url: "https://images.unsplash.com/photo-1548369937-47519962c11a?w=600&auto=format&fit=crop", badge: "", is_vegetarian: 0, is_spicy: 0, rating: 4.4, reviews_count: 421, sort_order: 4 },
    { name: "Paysanne", description: "Crème fraîche, mozzarella, lardons, pomme de terre, champignons", category: "meat", price_s: 10.90, price_m: 12.90, price_l: 15.90, image_url: "https://images.unsplash.com/photo-1628840042765-356cda07504e?w=600&auto=format&fit=crop", badge: "", is_vegetarian: 0, is_spicy: 0, rating: 4.4, reviews_count: 398, sort_order: 5 },
    { name: "Vegetarian", description: "Tomato sauce, mozzarella, zucchini, eggplant, bell peppers, olives", category: "vegetarian", price_s: 10.90, price_m: 12.90, price_l: 15.90, image_url: "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&auto=format&fit=crop", badge: "veggie", is_vegetarian: 1, is_spicy: 0, rating: 4.5, reviews_count: 376, sort_order: 6 },
    { name: "Spicy Chicken", description: "Tomato sauce, mozzarella, chicken, jalapeños, red onions, spicy sauce", category: "spicy", price_s: 10.90, price_m: 12.90, price_l: 15.90, image_url: "https://images.unsplash.com/photo-1593504049359-74330189a345?w=600&auto=format&fit=crop", badge: "spicy", is_vegetarian: 0, is_spicy: 1, rating: 4.5, reviews_count: 310, sort_order: 7 },
  ];
  const pizzaStmt = db.prepare('INSERT INTO pizzas (name, description, category, price_s, price_m, price_l, image_url, badge, is_vegetarian, is_spicy, rating, reviews_count, sort_order, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)');
  pizzas.forEach(p => pizzaStmt.run(p.name, p.description, p.category, p.price_s, p.price_m, p.price_l, p.image_url, p.badge, p.is_vegetarian, p.is_spicy, p.rating, p.reviews_count, p.sort_order));

  const siteSettings = [
    ['site_name', "L'Cinco Pizza"], ['tagline', 'The true taste of pizza! Homemade recipes, fresh ingredients and a whole lot of passion.'],
    ['phone', '+01 23 45 67 89'], ['email', 'contact@lcinco-pizza.fr'],
    ['address', '123 Pizza Street, 75000 Paris, France'], ['delivery_time', '30 min average'],
    ['hours', '11:00 AM - 11:00 PM'], ['meal_price', '16.90'],
    ['meal_description', '1 Pizza of your choice + 1 Drink + 1 Dessert of your choice'],
    ['whatsapp', '+0123456789'], ['orders_this_week', '2400'],
    ['total_reviews', '2134'], ['overall_rating', '4.8'],
  ];
  const settingStmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  siteSettings.forEach(([k, v]) => settingStmt.run(k, v));
}

// ── Seed: coupons ────────────────────────────────────────────────────────────
const couponCount = db.prepare('SELECT COUNT(*) as count FROM coupons').get();
if (couponCount.count === 0) {
  const coupons = [
    { code: 'FREESHIP', description: 'Free delivery on orders over $15', type: 'fixed', value: 2.99, min_order: 15, max_uses: 0, used_count: 47, active: 1, expires_at: null },
    { code: 'SPICY20', description: '20% off all spicy pizzas', type: 'percent', value: 20, min_order: 10, max_uses: 500, used_count: 89, active: 1, expires_at: null },
    { code: 'WELCOME10', description: '10% off your first order', type: 'percent', value: 10, min_order: 0, max_uses: 0, used_count: 234, active: 1, expires_at: null },
    { code: 'PIZZA5', description: '$5 off orders over $30', type: 'fixed', value: 5, min_order: 30, max_uses: 200, used_count: 66, active: 1, expires_at: null },
    { code: 'SUMMER24', description: '15% summer discount (expired)', type: 'percent', value: 15, min_order: 0, max_uses: 1000, used_count: 412, active: 0, expires_at: 1722470400 },
  ];
  const stmt = db.prepare('INSERT INTO coupons (code, description, type, value, min_order, max_uses, used_count, active, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  coupons.forEach(c => stmt.run(c.code, c.description, c.type, c.value, c.min_order, c.max_uses, c.used_count, c.active, c.expires_at));
}

// ── Seed: meals ──────────────────────────────────────────────────────────────
const mealCount = db.prepare('SELECT COUNT(*) as count FROM meals').get();
if (mealCount.count === 0) {
  const meals = [
    { name: 'Pizza Meal', description: 'Perfect combo for one', components: JSON.stringify(['1 Pizza of your choice', '1 Drink (330ml)', '1 Dessert of your choice']), price: 16.90, image_url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&auto=format&fit=crop', active: 1, sort_order: 0 },
    { name: 'Family Pack', description: 'Feeds the whole family', components: JSON.stringify(['2 Pizzas of your choice', '4 Drinks (330ml)', '2 Desserts of your choice', '1 Side salad']), price: 39.90, image_url: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&auto=format&fit=crop', active: 1, sort_order: 1 },
    { name: 'Lunch Special', description: 'Quick midday deal', components: JSON.stringify(['1 Pizza of your choice', '1 Drink (330ml)']), price: 13.90, image_url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop', active: 1, sort_order: 2 },
    { name: 'Date Night Duo', description: 'Romantic evening for two', components: JSON.stringify(['2 Pizzas of your choice', '1 Bottle of wine', '2 Desserts of your choice']), price: 49.90, image_url: 'https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?w=600&auto=format&fit=crop', active: 1, sort_order: 3 },
  ];
  const stmt = db.prepare('INSERT INTO meals (name, description, components, price, image_url, active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');
  meals.forEach(m => stmt.run(m.name, m.description, m.components, m.price, m.image_url, m.active, m.sort_order));
}

// ── Seed: reviews ────────────────────────────────────────────────────────────
const reviewCount = db.prepare('SELECT COUNT(*) as count FROM reviews').get();
if (reviewCount.count === 0) {
  const names = ['Marie D.', 'Jean-Paul M.', 'Sophie L.', 'Thomas B.', 'Emma R.', 'Lucas F.', 'Clara N.', 'Antoine V.', 'Léa M.', 'Hugo P.'];
  const comments = [
    'Absolutely delicious! Best pizza in Paris.', 'Incredible flavors, will order again!',
    'The crust is perfect, love the toppings.', 'Quick delivery and still hot!',
    'Fresh ingredients make all the difference.', 'My family loves this place.',
    'Great value for money, generous portions.', 'The wood-fired taste is unbeatable.',
    'Top quality every single time.', 'Highly recommend to everyone!',
  ];
  const pizzaIds = db.prepare('SELECT id FROM pizzas').all().map(r => r.id);
  const now = Math.floor(Date.now() / 1000);
  const stmt = db.prepare('INSERT INTO reviews (pizza_id, reviewer_name, rating, comment, created_at) VALUES (?, ?, ?, ?, ?)');
  pizzaIds.forEach(pid => {
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const rating = 3 + Math.floor(Math.random() * 3);
      stmt.run(pid, names[Math.floor(Math.random() * names.length)], rating, comments[Math.floor(Math.random() * comments.length)], now - Math.floor(Math.random() * 30 * 86400));
    }
  });
}

// ── Seed: orders ─────────────────────────────────────────────────────────────
const orderCount = db.prepare('SELECT COUNT(*) as count FROM orders').get();
if (orderCount.count === 0) {
  const now = Math.floor(Date.now() / 1000);
  const pizzaData = [
    { name: "L'Cinco", price_m: 12.90 }, { name: "Oriental", price_m: 12.90 },
    { name: "Goat Cheese & Honey", price_m: 12.90 }, { name: "Texane", price_m: 12.90 },
    { name: "Spicy Chicken", price_m: 12.90 }, { name: "Vegetarian", price_m: 12.90 },
  ];
  const customers = [
    { name: 'Alice Martin', email: 'alice@example.com', phone: '+33 6 11 22 33 44', address: '12 Rue de Rivoli, 75001 Paris' },
    { name: 'Pierre Dubois', email: 'pierre@example.com', phone: '+33 6 55 66 77 88', address: '8 Avenue Montaigne, 75008 Paris' },
    { name: 'Sophie Laurent', email: 'sophie@example.com', phone: '+33 6 99 88 77 66', address: '45 Rue Saint-Antoine, 75004 Paris' },
    { name: 'Marc Bernard', email: 'marc@example.com', phone: '+33 6 12 34 56 78', address: '23 Boulevard Haussmann, 75009 Paris' },
    { name: 'Julie Moreau', email: 'julie@example.com', phone: '+33 6 87 65 43 21', address: '7 Rue de la Paix, 75002 Paris' },
    { name: 'Thomas Petit', email: 'thomas@example.com', phone: '+33 6 44 33 22 11', address: '15 Rue Oberkampf, 75011 Paris' },
  ];
  const statuses = ['completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'cancelled'];

  const orderStmt = db.prepare('INSERT INTO orders (order_number, customer_name, customer_email, customer_phone, delivery_address, items, coupon_code, coupon_discount, subtotal, delivery_fee, total, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

  // Generate historical orders (past 30 days)
  for (let i = 0; i < 45; i++) {
    const c = customers[Math.floor(Math.random() * customers.length)];
    const numItems = 1 + Math.floor(Math.random() * 3);
    const items = [];
    let subtotal = 0;
    for (let j = 0; j < numItems; j++) {
      const p = pizzaData[Math.floor(Math.random() * pizzaData.length)];
      const qty = 1 + Math.floor(Math.random() * 2);
      items.push({ name: p.name, size: 'M', price: p.price_m, qty });
      subtotal += p.price_m * qty;
    }
    const daysBack = Math.floor(Math.random() * 30);
    const secondsBack = daysBack * 86400 + Math.floor(Math.random() * 43200);
    const createdAt = now - secondsBack;
    const hasCoupon = Math.random() > 0.75;
    const couponCode = hasCoupon ? 'WELCOME10' : null;
    const discount = hasCoupon ? Math.round(subtotal * 0.1 * 100) / 100 : 0;
    const delivery = subtotal > 25 ? 0 : 2.99;
    const total = subtotal - discount + delivery;
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    orderStmt.run(`LC-${String(i + 1).padStart(4, '0')}`, c.name, c.email, c.phone, c.address, JSON.stringify(items), couponCode, discount, Math.round(subtotal * 100) / 100, delivery, Math.round(total * 100) / 100, status, createdAt, createdAt + Math.floor(Math.random() * 1800));
  }

  // Active orders (recent)
  const activeOrders = [
    { num: 'LC-0046', status: 'received', minsAgo: 8, c: customers[0], items: [{ name: "L'Cinco", size: 'M', price: 12.90, qty: 1 }, { name: 'Oriental', size: 'L', price: 15.90, qty: 1 }] },
    { num: 'LC-0047', status: 'processing', minsAgo: 22, c: customers[1], items: [{ name: 'Goat Cheese & Honey', size: 'M', price: 12.90, qty: 2 }] },
    { num: 'LC-0048', status: 'out_for_delivery', minsAgo: 35, c: customers[2], items: [{ name: 'Spicy Chicken', size: 'L', price: 15.90, qty: 1 }, { name: 'Vegetarian', size: 'M', price: 12.90, qty: 1 }] },
    { num: 'LC-0049', status: 'received', minsAgo: 4, c: customers[3], items: [{ name: "L'Cinco", size: 'L', price: 15.90, qty: 2 }] },
  ];
  activeOrders.forEach(o => {
    const sub = o.items.reduce((s, i) => s + i.price * i.qty, 0);
    const del = sub > 25 ? 0 : 2.99;
    const ts = now - o.minsAgo * 60;
    orderStmt.run(o.num, o.c.name, o.c.email, o.c.phone, o.c.address, JSON.stringify(o.items), null, 0, Math.round(sub * 100) / 100, del, Math.round((sub + del) * 100) / 100, o.status, ts, ts);
  });
}

// ── Seed: store settings ─────────────────────────────────────────────────────
const storeSettingsCount = db.prepare('SELECT COUNT(*) as count FROM store_settings').get();
if (storeSettingsCount.count === 0) {
  const schedule = {
    monday: { enabled: true, open: '11:00', close: '23:00' },
    tuesday: { enabled: true, open: '11:00', close: '23:00' },
    wednesday: { enabled: true, open: '11:00', close: '23:00' },
    thursday: { enabled: true, open: '11:00', close: '23:00' },
    friday: { enabled: true, open: '11:00', close: '00:00' },
    saturday: { enabled: true, open: '11:00', close: '00:00' },
    sunday: { enabled: true, open: '12:00', close: '22:00' },
  };
  const stmt = db.prepare('INSERT OR IGNORE INTO store_settings (key, value) VALUES (?, ?)');
  stmt.run('is_open', '1');
  stmt.run('auto_schedule', '1');
  stmt.run('schedule', JSON.stringify(schedule));
  stmt.run('status_message', 'We are open! Order now for fast delivery.');
}

module.exports = db;
