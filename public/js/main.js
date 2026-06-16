/* ═══════════════════════════════════════════════════════════════════
   L'Cinco Pizza — Frontend JavaScript
   ═══════════════════════════════════════════════════════════════════ */

const state = {
  pizzas: [],
  filteredPizzas: [],
  cart: JSON.parse(localStorage.getItem('lcinco_cart') || '[]'),
  wishlist: JSON.parse(localStorage.getItem('lcinco_wishlist') || '[]'),
  selectedSizes: {},
  currentSlide: 0,
  totalSlides: 0,
  slideTimer: null,
  announcements: [],
  lightboxPizzaIndex: -1,
  lightboxSelectedSize: 'M',
};

// ── Init ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initCart();
  loadAll();
  initZipChecker();
  initLightbox();
  initNewsletter();
  loadSettings();
  initDeliveryDropdown();
});

async function loadAll() {
  await Promise.all([loadAnnouncements(), loadHeroBanners(), loadPizzas()]);
}

// ── Settings ────────────────────────────────────────────────────────

async function loadSettings() {
  try {
    const s = await api('/api/settings');
    if (s.total_reviews) document.getElementById('totalReviews').textContent = Number(s.total_reviews).toLocaleString();
    if (s.overall_rating) document.getElementById('heroRatingText').innerHTML = `${s.overall_rating} (<span id="totalReviews">${Number(s.total_reviews || 2134).toLocaleString()}</span> reviews)`;
    if (s.orders_this_week) document.getElementById('ordersThisWeek').textContent = Number(s.orders_this_week).toLocaleString() + '+';
    if (s.meal_price) document.getElementById('mealDealPrice').textContent = '$' + parseFloat(s.meal_price).toFixed(2);
    if (s.phone) document.getElementById('footerPhone').textContent = s.phone;
    if (s.email) document.getElementById('footerEmail').textContent = s.email;
    if (s.address) document.getElementById('footerAddress').innerHTML = s.address.replace(/\n/g, '<br>');
    if (s.overall_rating) document.getElementById('reviewRating').textContent = s.overall_rating;
    if (s.total_reviews) document.getElementById('reviewCount').textContent = Number(s.total_reviews).toLocaleString();
    if (s.whatsapp) document.getElementById('whatsappBtn').href = `https://wa.me/${s.whatsapp.replace(/\D/g, '')}`;
  } catch (_) {}
}

// ── API helper ──────────────────────────────────────────────────────

async function api(url, opts = {}) {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ── Announcements ───────────────────────────────────────────────────

async function loadAnnouncements() {
  try {
    state.announcements = await api('/api/announcements');
    renderAnnouncements();
  } catch (_) {}
}

function renderAnnouncements() {
  const track = document.getElementById('announcementTrack');
  if (!state.announcements.length) return;
  const doubled = [...state.announcements, ...state.announcements];
  track.innerHTML = doubled.map(a => `<span class="announcement-item">${escHtml(a.text)}</span>`).join('');
  const totalWidth = state.announcements.length * 400;
  track.style.animation = `announcementScroll ${state.announcements.length * 8}s linear infinite`;
}

// ── Hero Banners ────────────────────────────────────────────────────

async function loadHeroBanners() {
  try {
    const banners = await api('/api/hero-banners');
    if (!banners.length) return;
    state.totalSlides = banners.length;
    renderHeroSlides(banners);
    renderHeroDots(banners.length);
    updateHeroContent(banners[0]);
    startSlideshow(banners);
  } catch (_) {}
}

function renderHeroSlides(banners) {
  const container = document.getElementById('heroSlides');
  container.innerHTML = banners.map((b, i) => `
    <div class="hero-slide ${i === 0 ? 'active' : ''}"
         style="background-image: url('${escAttr(b.image_url)}')"
         data-index="${i}"></div>
  `).join('');
}

function renderHeroDots(count) {
  const dotsEl = document.getElementById('heroDots');
  dotsEl.innerHTML = Array.from({ length: count }, (_, i) =>
    `<button class="hero-dot ${i === 0 ? 'active' : ''}" data-i="${i}" aria-label="Slide ${i + 1}"></button>`
  ).join('');
  dotsEl.addEventListener('click', e => {
    const btn = e.target.closest('[data-i]');
    if (btn) goToSlide(parseInt(btn.dataset.i), window._heroBanners);
  });
}

function updateHeroContent(banner) {
  document.getElementById('heroTagline').textContent = banner.subtitle || 'Homemade with passion';
  const titleEl = document.getElementById('heroTitle');
  const parts = (banner.title || '').split('!');
  if (parts.length > 1) {
    titleEl.innerHTML = `${escHtml(parts[0])}<span class="hero-title-accent">${escHtml('!' + parts.slice(1).join('!'))}</span>`;
  } else {
    titleEl.innerHTML = escHtml(banner.title || '');
  }
  document.getElementById('heroDesc').textContent = banner.description || '';
  const ctaEl = document.getElementById('heroCta');
  ctaEl.textContent = banner.cta_text || 'Order Now';
  ctaEl.href = banner.cta_link || '#pizzas';
}

function goToSlide(index, banners) {
  if (!banners || !banners.length) return;
  const slides = document.querySelectorAll('.hero-slide');
  const dots = document.querySelectorAll('.hero-dot');
  slides[state.currentSlide]?.classList.remove('active');
  dots[state.currentSlide]?.classList.remove('active');
  state.currentSlide = (index + banners.length) % banners.length;
  slides[state.currentSlide]?.classList.add('active');
  dots[state.currentSlide]?.classList.add('active');
  updateHeroContent(banners[state.currentSlide]);
}

function startSlideshow(banners) {
  window._heroBanners = banners;
  if (banners.length < 2) return;
  state.slideTimer = setInterval(() => {
    goToSlide(state.currentSlide + 1, banners);
  }, 2500);

  document.getElementById('heroPrev').addEventListener('click', () => {
    clearInterval(state.slideTimer);
    goToSlide(state.currentSlide - 1, banners);
    state.slideTimer = setInterval(() => goToSlide(state.currentSlide + 1, banners), 2500);
  });
  document.getElementById('heroNext').addEventListener('click', () => {
    clearInterval(state.slideTimer);
    goToSlide(state.currentSlide + 1, banners);
    state.slideTimer = setInterval(() => goToSlide(state.currentSlide + 1, banners), 2500);
  });
}

// ── Pizzas ──────────────────────────────────────────────────────────

async function loadPizzas() {
  try {
    state.pizzas = await api('/api/pizzas');
    state.filteredPizzas = state.pizzas;
    state.pizzas.forEach(p => { state.selectedSizes[p.id] = 'M'; });
    renderPizzas();
    initFilters();
  } catch (_) {
    document.getElementById('pizzasGrid').innerHTML = `<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:60px 0">Failed to load pizzas. Please refresh.</p>`;
  }
}

function renderPizzas() {
  const grid = document.getElementById('pizzasGrid');
  if (!state.filteredPizzas.length) {
    grid.innerHTML = `<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:60px 0">No pizzas in this category.</p>`;
    return;
  }
  grid.innerHTML = state.filteredPizzas.map(p => pizzaCardHTML(p)).join('');
  bindPizzaCardEvents();
}

function pizzaCardHTML(p) {
  const selectedSize = state.selectedSizes[p.id] || 'M';
  const price = getSizePrice(p, selectedSize);
  const ratingStars = starsHTML(p.rating);
  const badgeHTML = p.badge ? `<span class="badge badge-${escAttr(p.badge)}">${escHtml(p.badge.toUpperCase())}</span>` : '';
  const inWishlist = state.wishlist.includes(p.id);

  return `
    <div class="pizza-card" data-id="${p.id}">
      <div class="pizza-card-img-wrap" data-id="${p.id}" role="button" tabindex="0" aria-label="View ${escAttr(p.name)}">
        <img src="${escAttr(p.image_url)}" alt="${escAttr(p.name)}" loading="lazy" onerror="this.style.background='linear-gradient(135deg,#2a1a0e,#3d1f0a)';this.style.display='block';this.removeAttribute('src')" />
        <div class="pizza-card-badges">${badgeHTML}</div>
        <button class="pizza-wishlist ${inWishlist ? 'active' : ''}" data-id="${p.id}" aria-label="Wishlist">
          <svg viewBox="0 0 24 24" fill="${inWishlist ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
        <div class="pizza-img-expand">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
        </div>
      </div>
      <div class="pizza-card-body">
        <h3 class="pizza-name">${escHtml(p.name)}</h3>
        <p class="pizza-desc">${escHtml(p.description || '')}</p>
        <div class="pizza-rating">
          <span class="pizza-stars">${ratingStars}</span>
          <span class="pizza-rating-count">(${p.reviews_count || 0})</span>
        </div>
        <div class="pizza-sizes">
          ${['S','M','L'].map(s => `
            <button class="size-btn ${s === selectedSize ? 'selected' : ''}" data-pizza="${p.id}" data-size="${s}">${s}</button>
          `).join('')}
        </div>
        <div class="pizza-footer">
          <span class="pizza-price" data-price="${p.id}">$${price.toFixed(2)}</span>
          <div class="pizza-icons">
            ${p.is_vegetarian ? '<span class="pizza-icon pizza-icon-veg" title="Vegetarian">🌱</span>' : ''}
            ${p.is_spicy ? '<span class="pizza-icon pizza-icon-spicy" title="Spicy">🌶️</span>' : ''}
            <span class="pizza-icon pizza-icon-gluten" title="Halal">✓</span>
          </div>
        </div>
      </div>
      <div class="pizza-card-actions">
        <button class="pizza-add-full add-to-cart-btn" data-id="${p.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          ADD TO CART
        </button>
      </div>
    </div>
  `;
}

function bindPizzaCardEvents() {
  // Size selection
  document.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pizzaId = parseInt(btn.dataset.pizza);
      const size = btn.dataset.size;
      state.selectedSizes[pizzaId] = size;
      const card = btn.closest('.pizza-card');
      card.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      const pizza = state.pizzas.find(p => p.id === pizzaId);
      const priceEl = card.querySelector(`[data-price="${pizzaId}"]`);
      if (pizza && priceEl) priceEl.textContent = '$' + getSizePrice(pizza, size).toFixed(2);
    });
  });

  // Add to cart
  document.querySelectorAll('.add-to-cart-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      const pizza = state.pizzas.find(p => p.id === id);
      if (pizza) addToCart(pizza, state.selectedSizes[id] || 'M');
    });
  });

  // Wishlist
  document.querySelectorAll('.pizza-wishlist').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      toggleWishlist(id, btn);
    });
  });

  // Gallery open
  document.querySelectorAll('.pizza-card-img-wrap').forEach(wrap => {
    const openGallery = () => {
      const id = parseInt(wrap.dataset.id);
      const index = state.filteredPizzas.findIndex(p => p.id === id);
      if (index !== -1) openLightbox(index);
    };
    wrap.addEventListener('click', openGallery);
    wrap.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openGallery(); });
  });
}

function getSizePrice(pizza, size) {
  const map = { S: pizza.price_s, M: pizza.price_m, L: pizza.price_l };
  return map[size] || pizza.price_m;
}

function starsHTML(rating) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  let s = '★'.repeat(full);
  if (half) s += '½';
  s += '☆'.repeat(5 - full - (half ? 1 : 0));
  return s;
}

// ── Filters ─────────────────────────────────────────────────────────

function initFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      state.filteredPizzas = filter === 'all' ? state.pizzas : state.pizzas.filter(p => p.category === filter);
      state.filteredPizzas.forEach(p => { state.selectedSizes[p.id] = state.selectedSizes[p.id] || 'M'; });
      renderPizzas();
    });
  });
}

// ── Cart ────────────────────────────────────────────────────────────

function initCart() {
  updateCartUI();
  document.getElementById('cartBtn').addEventListener('click', openCart);
  document.getElementById('cartOverlay').addEventListener('click', closeCart);
  document.getElementById('cartClose').addEventListener('click', closeCart);
  document.getElementById('cartClearBtn').addEventListener('click', clearCart);
  document.getElementById('cartEmptyCta').addEventListener('click', closeCart);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeCart(); closeLightbox(); } });
}

function addToCart(pizza, size) {
  const price = getSizePrice(pizza, size);
  const key = `${pizza.id}_${size}`;
  const existing = state.cart.find(i => i.key === key);
  if (existing) {
    existing.qty += 1;
  } else {
    state.cart.push({ key, id: pizza.id, name: pizza.name, size, price, image: pizza.image_url, qty: 1 });
  }
  saveCart();
  updateCartUI();
  showCartPopup(pizza.name, size);
}

function removeFromCart(key) {
  state.cart = state.cart.filter(i => i.key !== key);
  saveCart();
  updateCartUI();
}

function updateQty(key, delta) {
  const item = state.cart.find(i => i.key === key);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) removeFromCart(key);
  else { saveCart(); updateCartUI(); }
}

function clearCart() {
  state.cart = [];
  saveCart();
  updateCartUI();
}

function saveCart() {
  localStorage.setItem('lcinco_cart', JSON.stringify(state.cart));
}

function openCart() {
  document.getElementById('cartSidebar').classList.add('open');
  document.getElementById('cartOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCart() {
  document.getElementById('cartSidebar').classList.remove('open');
  document.getElementById('cartOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

function updateCartUI() {
  const count = state.cart.reduce((s, i) => s + i.qty, 0);
  const countEl = document.getElementById('cartCount');
  countEl.textContent = count;
  countEl.classList.toggle('visible', count > 0);
  const cartBtn = document.getElementById('cartBtn');
  if (cartBtn) {
    cartBtn.classList.toggle('has-items', count > 0);
    if (count > 0) {
      cartBtn.classList.remove('bounce');
      void cartBtn.offsetWidth;
      cartBtn.classList.add('bounce');
    }
  }

  const itemsEl = document.getElementById('cartItems');
  const footerEl = document.getElementById('cartFooter');

  if (!state.cart.length) {
    itemsEl.innerHTML = `
      <div class="cart-empty">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        <p>Your cart is empty</p>
        <button class="btn-primary" id="cartEmptyCta" onclick="closeCart()">Browse Pizzas</button>
      </div>`;
    footerEl.style.display = 'none';
    return;
  }

  itemsEl.innerHTML = state.cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-img">
        <img src="${escAttr(item.image)}" alt="${escAttr(item.name)}" onerror="this.style.background='#1a1a1a';this.removeAttribute('src')" />
      </div>
      <div class="cart-item-info">
        <p class="cart-item-name">${escHtml(item.name)}</p>
        <p class="cart-item-size">Size: ${escHtml(item.size)}</p>
        <div class="cart-item-controls">
          <button class="qty-btn" onclick="updateQty('${item.key}',-1)">−</button>
          <span class="qty-value">${item.qty}</span>
          <button class="qty-btn" onclick="updateQty('${item.key}',1)">+</button>
        </div>
      </div>
      <div class="cart-item-right">
        <span class="cart-item-price">$${(item.price * item.qty).toFixed(2)}</span>
        <button class="cart-item-remove" onclick="removeFromCart('${item.key}')">Remove</button>
      </div>
    </div>
  `).join('');

  const subtotal = state.cart.reduce((s, i) => s + i.price * i.qty, 0);
  const delivery = subtotal > 25 ? 0 : 2.99;
  const total = subtotal + delivery;

  document.getElementById('cartSubtotal').textContent = '$' + subtotal.toFixed(2);
  document.getElementById('cartDelivery').textContent = delivery === 0 ? 'FREE' : '$' + delivery.toFixed(2);
  document.getElementById('cartTotal').textContent = '$' + total.toFixed(2);
  footerEl.style.display = 'block';
}

// ── Wishlist ────────────────────────────────────────────────────────

function toggleWishlist(id, btn) {
  const idx = state.wishlist.indexOf(id);
  if (idx === -1) {
    state.wishlist.push(id);
    btn.classList.add('active');
    btn.querySelector('svg').setAttribute('fill', 'currentColor');
    showToast('Added to wishlist', 'info');
  } else {
    state.wishlist.splice(idx, 1);
    btn.classList.remove('active');
    btn.querySelector('svg').setAttribute('fill', 'none');
  }
  localStorage.setItem('lcinco_wishlist', JSON.stringify(state.wishlist));
}

// ── ZIP Checker ──────────────────────────────────────────────────────

function initZipChecker() {
  const input = document.getElementById('zipInput');
  const btn = document.getElementById('zipBtn');
  const hint = document.getElementById('zipHint');
  if (!btn || !input) return;

  const check = async () => {
    const zip = input.value.trim();
    if (!zip) { hint.textContent = 'Please enter a ZIP code.'; hint.className = 'zip-hint error'; return; }
    try {
      hint.textContent = 'Checking...';
      hint.className = 'zip-hint';
      const res = await fetch('/api/check-delivery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ zip }) });
      const data = await res.json();
      hint.textContent = data.message;
      hint.className = 'zip-hint ' + (data.available ? 'success' : 'error');
      if (data.available) {
        const loc = document.getElementById('deliveryLocation');
        if (loc) loc.textContent = zip;
      }
    } catch (_) { hint.textContent = 'Check failed. Please try again.'; hint.className = 'zip-hint error'; }
  };

  btn.addEventListener('click', check);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') check(); });
}

// ── Gallery Lightbox ─────────────────────────────────────────────────

function initLightbox() {
  document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
  document.getElementById('lightboxOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeLightbox();
  });
  document.getElementById('lightboxPrev').addEventListener('click', () => {
    const next = (state.lightboxPizzaIndex - 1 + state.filteredPizzas.length) % state.filteredPizzas.length;
    openLightbox(next);
  });
  document.getElementById('lightboxNext').addEventListener('click', () => {
    const next = (state.lightboxPizzaIndex + 1) % state.filteredPizzas.length;
    openLightbox(next);
  });
  document.getElementById('lightboxAddCart').addEventListener('click', () => {
    const pizza = state.filteredPizzas[state.lightboxPizzaIndex];
    if (pizza) addToCart(pizza, state.lightboxSelectedSize);
    closeLightbox();
  });
}

function openLightbox(index) {
  state.lightboxPizzaIndex = index;
  state.lightboxSelectedSize = 'M';
  const pizza = state.filteredPizzas[index];
  if (!pizza) return;

  document.getElementById('lightboxImg').src = pizza.image_url;
  document.getElementById('lightboxImg').alt = pizza.name;
  document.getElementById('lightboxName').textContent = pizza.name;
  document.getElementById('lightboxDesc').textContent = pizza.description || '';

  const badgeEl = document.getElementById('lightboxBadge');
  badgeEl.className = 'lightbox-badge';
  if (pizza.badge) {
    badgeEl.textContent = pizza.badge.toUpperCase();
    badgeEl.className = `lightbox-badge badge badge-${pizza.badge}`;
  } else {
    badgeEl.textContent = '';
  }

  const ratingEl = document.getElementById('lightboxRating');
  ratingEl.innerHTML = `<span style="color:var(--accent-yellow)">${starsHTML(pizza.rating)}</span>&nbsp;${pizza.rating} (${pizza.reviews_count} reviews)`;

  const sizesEl = document.getElementById('lightboxSizes');
  const prices = { S: pizza.price_s, M: pizza.price_m, L: pizza.price_l };
  sizesEl.innerHTML = ['S', 'M', 'L'].map(s => `
    <button class="lightbox-size-btn ${s === 'M' ? 'selected' : ''}" data-size="${s}">
      ${s}<span class="lightbox-size-label">$${prices[s].toFixed(2)}</span>
    </button>
  `).join('');
  sizesEl.querySelectorAll('.lightbox-size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      sizesEl.querySelectorAll('.lightbox-size-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.lightboxSelectedSize = btn.dataset.size;
      document.getElementById('lightboxPrice').textContent = '$' + prices[btn.dataset.size].toFixed(2);
    });
  });

  document.getElementById('lightboxPrice').textContent = '$' + pizza.price_m.toFixed(2);
  document.getElementById('lightboxOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  document.getElementById('lightboxOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

// ── Navigation ───────────────────────────────────────────────────────

function initNav() {
  const navbar = document.getElementById('navbar');
  const hamburger = document.getElementById('navHamburger');
  const navLinks = document.getElementById('navLinks');

  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 20);
    updateActiveNavLink();
  }, { passive: true });

  hamburger.addEventListener('click', () => {
    navLinks.classList.toggle('open');
  });

  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => navLinks.classList.remove('open'));
  });
}

function updateActiveNavLink() {
  const sections = ['hero', 'pizzas', 'menu', 'about', 'contact'];
  const links = document.querySelectorAll('.nav-link');
  let current = 'hero';
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el && window.scrollY >= el.offsetTop - 120) current = id;
  });
  links.forEach(link => {
    const href = link.getAttribute('href').replace('#', '') || 'hero';
    link.classList.toggle('active', href === current || (href === '' && current === 'hero'));
  });
}

// ── Newsletter ────────────────────────────────────────────────────────

function initNewsletter() {
  document.getElementById('newsletterForm')?.addEventListener('submit', e => {
    e.preventDefault();
    showToast('Subscribed! You\'ll receive our latest offers.', 'success');
    e.target.reset();
  });
}

// ── Toast ────────────────────────────────────────────────────────────

const _cartMsgs = [
  ['🍕', "One slice closer to paradise!"],
  ['🔥', "Hot choice! Cart's heating up!"],
  ['🤌', "Perfetto! Mama would approve!"],
  ['😍', "Oh yeah, that's a great pick!"],
  ['🎉', "Cart just got way tastier!"],
  ['👑', "A+ pizza decision right there!"],
  ['⚡', "Speed-running to delicious!"],
  ['🏆', "Your future self thanks you!"],
  ['✨', "Excellent taste, chef's kiss!"],
  ['🫶', "L'Cinco loves your taste!"],
];
let _cartMsgIdx = 0;

function showCartPopup(pizzaName, size) {
  const [emoji, msg] = _cartMsgs[_cartMsgIdx++ % _cartMsgs.length];
  const el = document.createElement('div');
  el.className = 'cart-popup';
  el.innerHTML = `
    <div class="cart-popup-emoji">${emoji}</div>
    <div class="cart-popup-body">
      <div class="cart-popup-msg">${msg}</div>
      <div class="cart-popup-sub">${escHtml(pizzaName)} · Size ${size} added to cart</div>
    </div>
    <span class="cart-popup-close" onclick="this.parentElement.remove()">✕</span>
  `;
  document.body.appendChild(el);
  setTimeout(() => {
    el.classList.add('removing');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, 2800);
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ'}</span>
    <span class="toast-msg">${escHtml(msg)}</span>
    <span class="toast-close" onclick="this.parentElement.remove()">✕</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => toast.remove());
  }, 3500);
}

// ── Utilities ────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function escAttr(str) { return escHtml(str || ''); }

// ── Delivery Dropdown ────────────────────────────────────────────────

function initDeliveryDropdown() {
  const btn = document.getElementById('deliveryBtn');
  const dropdown = document.getElementById('deliveryDropdown');
  const locLabel = document.getElementById('deliveryLocation');
  if (!btn || !dropdown) return;

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = dropdown.classList.contains('open');
    dropdown.classList.toggle('open', !isOpen);
    btn.classList.toggle('open', !isOpen);
    btn.setAttribute('aria-expanded', String(!isOpen));
  });

  dropdown.querySelectorAll('.delivery-zone').forEach(zone => {
    zone.addEventListener('click', () => {
      dropdown.querySelectorAll('.delivery-zone').forEach(z => z.classList.remove('active'));
      zone.classList.add('active');
      if (locLabel) locLabel.textContent = zone.dataset.label || zone.dataset.zip;
      dropdown.classList.remove('open');
      btn.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    });
  });

  document.addEventListener('click', e => {
    if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove('open');
      btn.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}
