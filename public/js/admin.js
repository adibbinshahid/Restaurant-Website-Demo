/* ═══════════════════════════════════════════════════════════════════
   L'Cinco Pizza — Admin JS (Full)
   ═══════════════════════════════════════════════════════════════════ */

const S = {
  pizzas: [], banners: [], announcements: [], orders: [], coupons: [], meals: [],
  stats: null, chartData: [], chartRange: 7, orderFilter: 'all',
  charts: {}, timerInterval: null, activeDetail: null,
};

// ── Boot ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const { authenticated } = await api('/admin/check-auth');
  authenticated ? showApp() : showLogin();
});

// ── Auth ──────────────────────────────────────────────────────────────

function showLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('adminApp').style.display = 'none';
  document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = document.getElementById('loginError');
    try {
      const res = await api('/admin/login', { method: 'POST', body: JSON.stringify({ username: document.getElementById('loginUser').value, password: document.getElementById('loginPass').value }) });
      if (res.success) showApp(); else errEl.textContent = 'Invalid credentials';
    } catch (_) { errEl.textContent = 'Login failed. Please retry.'; }
  });
}

async function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminApp').style.display = 'grid';
  initModal();
  initTabs();
  document.getElementById('logoutBtn').addEventListener('click', async () => { await api('/admin/logout', { method: 'POST' }); location.reload(); });
  await switchTab('dashboard');
}

// ── Tabs ───────────────────────────────────────────────────────────────

function initTabs() {
  document.querySelectorAll('.sidebar-item[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

async function switchTab(tab) {
  S.activeDetail = null;
  clearInterval(S.timerInterval);
  document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
  document.querySelector(`.sidebar-item[data-tab="${tab}"]`)?.classList.add('active');
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-${tab}`)?.classList.add('active');
  const titles = { dashboard:'Dashboard', orders:'Orders', pizzas:'Manage Pizzas', meals:'Meal Deals', coupons:'Coupons & Discounts', banners:'Hero Banners', announcements:'Announcements', store:'Store Settings', notifications:'Notification Settings', settings:'Site Settings' };
  document.getElementById('pageTitle').textContent = titles[tab] || tab;
  const acts = document.getElementById('headerActions');
  acts.innerHTML = '';
  const addBtn = (label, fn) => { const b = document.createElement('button'); b.className = 'btn-primary btn-sm'; b.textContent = label; b.onclick = fn; acts.appendChild(b); };
  if (tab === 'dashboard') await loadDashboard();
  else if (tab === 'orders') { addBtn('+ New Order', () => openOrderModal('create')); await loadOrders(); }
  else if (tab === 'pizzas') { addBtn('+ Add Pizza', () => openPizzaModal('create')); await loadPizzas(); }
  else if (tab === 'meals') { addBtn('+ Add Meal', () => openMealModal('create')); await loadMeals(); }
  else if (tab === 'coupons') { addBtn('+ Add Coupon', () => openCouponModal('create')); await loadCoupons(); }
  else if (tab === 'banners') { addBtn('+ Add Banner', () => openBannerModal('create')); await loadBanners(); }
  else if (tab === 'announcements') { addBtn('+ Add Announcement', () => openAnnouncementModal('create')); await loadAnnouncements(); }
  else if (tab === 'store') await loadStoreSettings();
  else if (tab === 'notifications') await loadNotificationEmails();
  else if (tab === 'settings') await loadSettings();
}

// ══ DASHBOARD ══════════════════════════════════════════════════════════

async function loadDashboard() {
  try {
    S.stats = await api('/admin/api/stats');
    S.chartData = S.stats.chart_data;
    renderStatCards();
    renderIncomeGrid();
    renderCouponMetrics();
    renderCharts();
    initDetailPanel();
    initChartToggles();
    updateOrdersBadge(S.stats.orders.active_count);
  } catch (e) { toast('Failed to load dashboard', 'error'); }
}

function renderStatCards() {
  const s = S.stats;
  setText('dPizzasTotal', s.pizzas.total);
  setText('dPizzasActive', s.pizzas.active);
  setText('dPizzasInactive', s.pizzas.inactive);
  setText('dOrdersActive', s.orders.active_count);
  setText('dOrdersDelivery', s.orders.out_for_delivery || 0);
  setText('dRevenueOngoing', '$' + (+s.revenue.ongoing).toFixed(2));
  setText('dCouponsActive', s.coupons.total_active);
  setText('dRevenueToday', '$' + (+s.revenue.today).toFixed(2));
  const pulse = document.getElementById('dOrdersPulse');
  if (pulse) pulse.style.display = s.orders.active_count > 0 ? 'block' : 'none';
}

function renderIncomeGrid() {
  const r = S.stats.revenue;
  setText('incToday', '$' + (+r.today).toFixed(2));
  setText('incWeek', '$' + (+r.week).toFixed(2));
  setText('incMonth', '$' + (+r.month).toFixed(2));
  setText('incLifetime', '$' + (+r.lifetime).toFixed(2));
  setText('incTodaySub', `${S.stats.orders.completed || 0} orders today`);
  setText('incWeekSub', 'Last 7 days');
  setText('incMonthSub', 'Last 30 days');
}

function renderCouponMetrics() {
  const c = S.stats.coupons;
  setText('cmActive', c.total_active);
  setText('cmActiveOrders', c.used_in_active);
  setText('cmToday', c.uses_today);
  setText('cmWeek', c.uses_week);
  setText('cmMonth', c.uses_month);
  setText('cmLifetime', c.uses_lifetime);
}

// ── Charts ─────────────────────────────────────────────────────────────

function renderCharts() {
  renderRevenueChart();
  renderStatusChart();
}

function getChartSlice(range) {
  return S.chartData.slice(-range);
}

function renderRevenueChart() {
  const ctx = document.getElementById('revenueChart');
  if (!ctx) return;
  if (S.charts.revenue) { S.charts.revenue.destroy(); }
  const data = getChartSlice(S.chartRange);
  const labels = data.map(d => { const dt = new Date(d.day); return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); });
  S.charts.revenue = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Revenue ($)', data: data.map(d => d.income), backgroundColor: 'rgba(227,21,21,0.25)', borderColor: '#e31515', borderWidth: 2, borderRadius: 4, yAxisID: 'y', order: 2 },
        { label: 'Orders', data: data.map(d => d.order_count), type: 'line', borderColor: '#f5c842', backgroundColor: 'rgba(245,200,66,0.1)', borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#f5c842', tension: 0.4, yAxisID: 'y1', order: 1, fill: true },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1a1a1a', borderColor: '#2a2a2a', borderWidth: 1, titleColor: '#fff', bodyColor: '#aaa', callbacks: { label: ctx => ctx.dataset.label === 'Revenue ($)' ? ` $${ctx.parsed.y.toFixed(2)}` : ` ${ctx.parsed.y} orders` } } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 }, maxRotation: 0 } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 }, callback: v => '$' + v }, position: 'left' },
        y1: { ticks: { color: 'rgba(245,200,66,0.6)', font: { size: 10 } }, grid: { display: false }, position: 'right' },
      }
    }
  });
}

function renderStatusChart() {
  const ctx = document.getElementById('statusChart');
  if (!ctx) return;
  if (S.charts.status) S.charts.status.destroy();
  const sd = S.stats.status_distribution;
  const labels = ['Received', 'Processing', 'Out for Delivery', 'Completed', 'Cancelled'];
  const keys = ['received', 'processing', 'out_for_delivery', 'completed', 'cancelled'];
  const colors = ['#2196f3', '#f5c842', '#ff6d00', '#4caf50', '#555555'];
  const vals = keys.map(k => sd[k] || 0);
  S.charts.status = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: vals, backgroundColor: colors.map(c => c + '33'), borderColor: colors, borderWidth: 2, hoverOffset: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '65%',
      plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1a1a1a', borderColor: '#2a2a2a', borderWidth: 1, titleColor: '#fff', bodyColor: '#aaa' } }
    }
  });
  const legend = document.getElementById('statusLegend');
  if (legend) legend.innerHTML = keys.map((k, i) => `<div class="legend-item"><span class="legend-dot" style="background:${colors[i]}"></span>${labels[i]}<span class="legend-count">${vals[i]}</span></div>`).join('');
}

function initChartToggles() {
  document.querySelectorAll('.chart-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chart-toggle').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      S.chartRange = parseInt(btn.dataset.range);
      renderRevenueChart();
    });
  });
}

// ── Detail Panel ──────────────────────────────────────────────────────

function initDetailPanel() {
  document.getElementById('detailClose').addEventListener('click', closeDetailPanel);
  document.querySelectorAll('.stat-card.clickable').forEach(card => {
    card.addEventListener('click', () => {
      const detail = card.dataset.detail;
      if (S.activeDetail === detail) { closeDetailPanel(); return; }
      S.activeDetail = detail;
      document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active-detail'));
      card.classList.add('active-detail');
      renderDetailPanel(detail);
    });
  });
}

function closeDetailPanel() {
  S.activeDetail = null;
  document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active-detail'));
  document.getElementById('detailPanel').style.display = 'none';
}

function renderDetailPanel(detail) {
  const panel = document.getElementById('detailPanel');
  const title = document.getElementById('detailPanelTitle');
  const body = document.getElementById('detailPanelBody');
  const s = S.stats;
  const configs = {
    'pizzas-total': { label: 'All Pizzas by Category', html: () => tableHTML(['Category', 'Count', 'Active'], [['Meat', s.pizzas.total, s.pizzas.active], ['Vegetarian', '—', '—'], ['Spicy', '—', '—']]) },
    'pizzas-active': { label: 'Active Menu Items', html: () => `<p style="color:var(--green);font-size:13px">${s.pizzas.active} items visible on the menu. Manage in the <a href="#" onclick="switchTab('pizzas')" style="color:var(--red)">Pizzas tab</a>.</p>` },
    'pizzas-inactive': { label: 'Deactivated Items', html: () => s.pizzas.inactive > 0 ? `<p style="color:var(--yellow);font-size:13px">${s.pizzas.inactive} items hidden from menu. Re-activate in the <a href="#" onclick="switchTab('pizzas')" style="color:var(--red)">Pizzas tab</a>.</p>` : `<p style="color:var(--muted);font-size:13px">No inactive items. All pizzas are visible on the menu.</p>` },
    'orders-active': { label: 'Current Active Orders', html: () => tableHTML(['Order #', 'Customer', 'Status', 'Total'], [['received','processing','out_for_delivery'].flatMap(st => (s.status_distribution[st] || 0)).map ? [] : []].concat(activeOrderRows())) },
    'orders-delivery': { label: 'Orders Out for Delivery', html: () => `<p style="font-size:13px;color:var(--orange)">${s.orders.out_for_delivery || 0} order(s) currently out for delivery. <a href="#" onclick="switchTab('orders')" style="color:var(--red)">View in Orders tab →</a></p>` },
    'revenue-ongoing': { label: 'Revenue from Active Orders', html: () => `<div style="display:flex;gap:24px;font-size:13px"><div><span style="color:var(--txt2)">Active orders:</span> <strong>${s.orders.active_count}</strong></div><div><span style="color:var(--txt2)">Total revenue:</span> <strong style="color:var(--green)">$${(+s.revenue.ongoing).toFixed(2)}</strong></div><div><span style="color:var(--txt2)">Avg per order:</span> <strong>$${s.orders.active_count ? ((+s.revenue.ongoing) / s.orders.active_count).toFixed(2) : '0.00'}</strong></div></div>` },
    'coupons-active': { label: 'Active Coupons', html: () => `<p style="font-size:13px;color:var(--txt2)">${s.coupons.total_active} active coupons. ${s.coupons.used_in_active} used in current orders. <a href="#" onclick="switchTab('coupons')" style="color:var(--red)">Manage coupons →</a></p>` },
    'revenue-today': { label: "Today's Revenue Breakdown", html: () => tableHTML(['Period', 'Revenue', 'vs Yesterday'], [["Today", '$' + (+s.revenue.today).toFixed(2), '—'], ["This Week", '$' + (+s.revenue.week).toFixed(2), '—'], ["This Month", '$' + (+s.revenue.month).toFixed(2), '—']]) },
  };
  const cfg = configs[detail];
  if (!cfg) return;
  title.textContent = cfg.label;
  body.innerHTML = cfg.html();
  panel.style.display = 'block';
}

function activeOrderRows() {
  return [['LC-0046', 'Alice M.', 'Received', '$31.79'], ['LC-0047', 'Pierre D.', 'Processing', '$25.80'], ['LC-0048', 'Sophie L.', 'Out for Delivery', '$31.79'], ['LC-0049', 'Marc B.', 'Received', '$34.79']];
}

function tableHTML(headers, rows) {
  return `<table class="detail-table"><thead><tr>${headers.map(h => `<th style="padding:6px 10px;font-size:11px;color:var(--txt2);text-align:left;border-bottom:1px solid var(--border)">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${i === r.length - 1 ? ' style="text-align:right"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function updateOrdersBadge(count) {
  const badge = document.getElementById('ordersBadge');
  if (!badge) return;
  badge.textContent = count;
  badge.classList.toggle('visible', count > 0);
}

// ══ ORDERS ════════════════════════════════════════════════════════════

let ordersData = [];

async function loadOrders() {
  try {
    const url = S.orderFilter === 'all' ? '/admin/api/orders' : `/admin/api/orders?status=${S.orderFilter}`;
    ordersData = await api(url);
    renderOrdersTable();
    startTimers();
  } catch (_) { toast('Failed to load orders', 'error'); }
}

function renderOrdersTable() {
  document.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      S.orderFilter = btn.dataset.status;
      loadOrders();
    });
  });
  const tbody = document.getElementById('ordersTableBody');
  if (!ordersData.length) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:40px">No orders found.</td></tr>'; return; }
  const now = Math.floor(Date.now() / 1000);
  tbody.innerHTML = ordersData.map(o => {
    const items = tryParseJSON(o.items, []);
    const itemsStr = items.map(i => `${i.qty}× ${i.name} (${i.size})`).join(', ');
    const isActive = ['received','processing','out_for_delivery'].includes(o.status);
    const elapsed = now - (o.created_at || now);
    const timerClass = elapsed > 1800 ? 'timer-danger' : elapsed > 900 ? 'timer-warn' : 'timer-ok';
    const timerDisplay = isActive ? `<span class="order-timer ${timerClass}" data-ts="${o.created_at}">${formatElapsed(elapsed)}</span>` : `<span class="timer-done">—</span>`;
    const statusOpts = [['received','Just Received'],['processing','Processing'],['out_for_delivery','Out for Delivery'],['completed','Completed'],['cancelled','Cancelled']];
    const statusEl = `<span class="status-badge status-${o.status}"><select class="status-select" data-id="${o.id}" onchange="updateOrderStatus(${o.id},this.value)">${statusOpts.map(([v,l]) => `<option value="${v}"${v===o.status?' selected':''}>${l}</option>`).join('')}</select></span>`;
    return `<tr data-order-id="${o.id}">
      <td><strong style="font-size:12.5px">${escHtml(o.order_number)}</strong><div style="font-size:10.5px;color:var(--muted)">${new Date(o.created_at*1000).toLocaleDateString()}</div></td>
      <td><div style="font-size:13px;font-weight:600;color:var(--txt)">${escHtml(o.customer_name||'Unknown')}</div><div style="font-size:11px;color:var(--muted)">${escHtml(o.customer_phone||'')}</div></td>
      <td><div class="items-preview">${escHtml(itemsStr)}</div>${o.coupon_code?`<div style="font-size:10.5px;color:var(--yellow);margin-top:2px">🏷 ${escHtml(o.coupon_code)}</div>`:''}</td>
      <td>${o.coupon_code?`<span style="font-size:11.5px;color:var(--yellow)">−$${(+o.coupon_discount).toFixed(2)}</span>`:'<span style="color:var(--muted);font-size:11.5px">—</span>'}</td>
      <td>${statusEl}</td>
      <td>${timerDisplay}</td>
      <td><span class="order-income">$${(+o.total).toFixed(2)}</span></td>
      <td class="td-actions">
        <button class="btn-edit" onclick="openOrderModal('edit',${o.id})">Edit</button>
        <button class="btn-danger" onclick="deleteOrder(${o.id})">Delete</button>
      </td>
    </tr>`;
  }).join('');
}

function startTimers() {
  clearInterval(S.timerInterval);
  S.timerInterval = setInterval(() => {
    const now = Math.floor(Date.now() / 1000);
    document.querySelectorAll('.order-timer[data-ts]').forEach(el => {
      const ts = parseInt(el.dataset.ts);
      const elapsed = now - ts;
      el.textContent = formatElapsed(elapsed);
      el.className = 'order-timer ' + (elapsed > 1800 ? 'timer-danger' : elapsed > 900 ? 'timer-warn' : 'timer-ok');
    });
  }, 1000);
}

function formatElapsed(sec) {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec/60)}m ${sec%60}s`;
  const h = Math.floor(sec/3600);
  const m = Math.floor((sec%3600)/60);
  return `${h}h ${m}m`;
}

async function updateOrderStatus(id, status) {
  try {
    await api(`/admin/api/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    toast('Status updated', 'success');
    await loadOrders();
  } catch (_) { toast('Update failed', 'error'); }
}

async function deleteOrder(id) {
  if (!confirm('Delete this order? Cannot be undone.')) return;
  try { await api(`/admin/api/orders/${id}`, { method: 'DELETE' }); await loadOrders(); toast('Order deleted', 'info'); }
  catch (_) { toast('Delete failed', 'error'); }
}

function openOrderModal(action, id) {
  const o = id ? ordersData.find(x => x.id === id) : null;
  document.getElementById('modalTitle').textContent = action === 'create' ? 'New Order' : 'Edit Order';
  document.getElementById('modalBody').innerHTML = `
    <div class="form-row">
      <div class="form-grid">
        <div class="form-field"><label>Customer Name</label><input type="text" id="o_name" value="${escAttr(o?.customer_name||'')}" placeholder="Full name" /></div>
        <div class="form-field"><label>Phone</label><input type="text" id="o_phone" value="${escAttr(o?.customer_phone||'')}" placeholder="+33 6..." /></div>
      </div>
      <div class="form-field"><label>Email</label><input type="email" id="o_email" value="${escAttr(o?.customer_email||'')}" /></div>
      <div class="form-field"><label>Delivery Address</label><input type="text" id="o_addr" value="${escAttr(o?.delivery_address||'')}" /></div>
      <div class="form-field"><label>Status</label>
        <select id="o_status">
          ${[['received','Just Received'],['processing','Processing'],['out_for_delivery','Out for Delivery'],['completed','Completed'],['cancelled','Cancelled']].map(([v,l])=>`<option value="${v}"${o?.status===v?' selected':''}>${l}</option>`).join('')}
        </select>
      </div>
      <div class="form-field"><label>Notes</label><textarea id="o_notes">${escHtml(o?.notes||'')}</textarea></div>
      ${o ? `<div style="background:var(--bg4);border-radius:8px;padding:12px;font-size:13px">
        <strong>Order:</strong> ${escHtml(o.order_number)}<br/>
        <strong>Items:</strong> ${escHtml(tryParseJSON(o.items,[]).map(i=>`${i.qty}× ${i.name} (${i.size})`).join(', '))}<br/>
        <strong>Total:</strong> $${(+o.total).toFixed(2)}
        ${o.coupon_code?`<br/><strong>Coupon:</strong> ${escHtml(o.coupon_code)} (−$${(+o.coupon_discount).toFixed(2)})`:''}
      </div>` : ''}
    </div>`;
  openModal(async () => {
    try {
      const data = { customer_name: v('o_name'), customer_email: v('o_email'), customer_phone: v('o_phone'), delivery_address: v('o_addr'), status: v('o_status'), notes: v('o_notes') };
      if (action === 'create') { data.items = '[]'; data.subtotal = 0; data.total = 0; }
      await api(action === 'create' ? '/admin/api/orders' : `/admin/api/orders/${id}`, { method: action === 'create' ? 'POST' : 'PUT', body: JSON.stringify(data) });
      closeModal(); await loadOrders(); toast('Order saved', 'success');
    } catch (_) { toast('Save failed', 'error'); }
  });
}

// ══ PIZZAS ════════════════════════════════════════════════════════════

async function loadPizzas() {
  try { S.pizzas = await api('/admin/api/pizzas'); renderPizzasTable(); }
  catch (_) { toast('Failed to load pizzas', 'error'); }
}

function renderPizzasTable() {
  const tbody = document.getElementById('pizzasTableBody');
  if (!S.pizzas.length) { tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:40px">No pizzas.</td></tr>'; return; }
  tbody.innerHTML = S.pizzas.map(p => `<tr>
    <td class="td-img"><img src="${escAttr(p.image_url)}" onerror="this.style.background='#1a1a1a';this.removeAttribute('src')" /></td>
    <td><span class="td-name">${escHtml(p.name)}</span></td>
    <td>${capitalize(p.category)}</td>
    <td class="td-price">$${(+p.price_s).toFixed(2)}</td>
    <td class="td-price">$${(+p.price_m).toFixed(2)}</td>
    <td class="td-price">$${(+p.price_l).toFixed(2)}</td>
    <td>${p.badge ? `<span class="badge-pill ${p.badge}">${p.badge.toUpperCase()}</span>` : '<span class="badge-pill none">—</span>'}</td>
    <td><span class="status-pill ${p.active?'active':'inactive'}"><span class="status-dot"></span>${p.active?'Active':'Hidden'}</span></td>
    <td class="td-actions">
      <button class="btn-edit" onclick="openPizzaModal('edit',${p.id})">Edit</button>
      <button class="btn-danger" onclick="deletePizza(${p.id})">Delete</button>
    </td>
  </tr>`).join('');
}

async function openPizzaModal(action, id) {
  const p = id ? S.pizzas.find(x => x.id === id) : null;
  let reviews = [];
  if (id) { try { reviews = await api(`/admin/api/reviews?pizza_id=${id}`); } catch (_) {} }
  document.getElementById('modalTitle').textContent = action === 'create' ? 'Add Pizza' : 'Edit Pizza';
  document.getElementById('modalBody').innerHTML = `
    <div class="form-row">
      <div class="form-field"><label>Name *</label><input type="text" id="f_name" value="${escAttr(p?.name||'')}" placeholder="Pizza name" required /></div>
      <div class="form-field"><label>Description</label><textarea id="f_desc">${escHtml(p?.description||'')}</textarea></div>
      <div class="form-grid">
        <div class="form-field"><label>Category</label><select id="f_cat">${['meat','vegetarian','spicy'].map(c=>`<option value="${c}"${p?.category===c?' selected':''}>${capitalize(c)}</option>`).join('')}</select></div>
        <div class="form-field"><label>Badge</label><select id="f_badge"><option value=""${!p?.badge?' selected':''}>None</option>${['bestseller','veggie','spicy','new'].map(b=>`<option value="${b}"${p?.badge===b?' selected':''}>${b.toUpperCase()}</option>`).join('')}</select></div>
      </div>
      <div class="form-grid-3">
        <div class="form-field"><label>Price (S)</label><input type="number" id="f_ps" step="0.01" value="${p?.price_s||10.90}" /></div>
        <div class="form-field"><label>Price (M)</label><input type="number" id="f_pm" step="0.01" value="${p?.price_m||12.90}" /></div>
        <div class="form-field"><label>Price (L)</label><input type="number" id="f_pl" step="0.01" value="${p?.price_l||15.90}" /></div>
      </div>
      <div class="form-field"><label>Image URL</label><input type="text" id="f_imgurl" value="${escAttr(p?.image_url||'')}" />${p?.image_url?`<div class="img-preview"><img src="${escAttr(p.image_url)}" /></div>`:''}</div>
      <div class="form-field"><label>Upload Image</label><input type="file" id="f_img" accept="image/*" /></div>
      <div class="form-grid">
        <div class="form-field"><label>Rating</label><input type="number" id="f_rating" step="0.1" min="0" max="5" value="${p?.rating||4.5}" /></div>
        <div class="form-field"><label>Review Count</label><input type="number" id="f_reviews" value="${p?.reviews_count||0}" /></div>
      </div>
      <div class="form-field"><label>Sort Order</label><input type="number" id="f_order" value="${p?.sort_order||0}" /></div>
      <div class="form-check-row"><input type="checkbox" id="f_veg" ${p?.is_vegetarian?'checked':''} /><label for="f_veg">Vegetarian</label></div>
      <div class="form-check-row"><input type="checkbox" id="f_spicy" ${p?.is_spicy?'checked':''} /><label for="f_spicy">Spicy</label></div>
      <div class="form-check-row"><input type="checkbox" id="f_active" ${p?.active!==0?'checked':''} /><label for="f_active">Active (visible on site)</label></div>
      ${id ? renderReviewsSection(reviews, id) : ''}
    </div>`;
  if (id) bindReviewEvents(id);
  openModal(async () => {
    if (!v('f_name').trim()) { toast('Name required', 'error'); return; }
    if (!checkAdminPin()) return;
    const fd = new FormData();
    const fields = { name:v('f_name'), description:v('f_desc'), category:v('f_cat'), badge:v('f_badge'), price_s:v('f_ps'), price_m:v('f_pm'), price_l:v('f_pl'), image_url:v('f_imgurl'), rating:v('f_rating'), reviews_count:v('f_reviews'), sort_order:v('f_order'), is_vegetarian: ck('f_veg')?'1':'0', is_spicy:ck('f_spicy')?'1':'0', active:ck('f_active')?'1':'0' };
    Object.entries(fields).forEach(([k,val]) => fd.append(k, val));
    const img = document.getElementById('f_img')?.files[0];
    if (img) fd.append('image', img);
    try {
      await fetch(action==='create'?'/admin/api/pizzas':`/admin/api/pizzas/${id}`, { method:action==='create'?'POST':'PUT', body:fd });
      closeModal(); await loadPizzas(); toast(action==='create'?'Pizza created':'Pizza updated', 'success');
    } catch (_) { toast('Save failed', 'error'); }
  });
}

function renderReviewsSection(reviews, pizzaId) {
  return `<div class="reviews-section">
    <div class="reviews-section-title">
      Customer Reviews (${reviews.length})
      <button class="btn-primary btn-sm" onclick="showAddReviewForm(${pizzaId})">+ Add Review</button>
    </div>
    <div id="addReviewForm_${pizzaId}" class="edit-review-form">
      <div class="form-grid" style="margin-bottom:10px">
        <div class="form-field"><label>Reviewer Name</label><input type="text" id="rv_name" placeholder="Customer name" /></div>
        <div class="form-field"><label>Rating (1-5)</label><input type="number" id="rv_rating" min="1" max="5" value="5" /></div>
      </div>
      <div class="form-field" style="margin-bottom:10px"><label>Comment</label><textarea id="rv_comment" placeholder="Review text..."></textarea></div>
      <div style="display:flex;gap:8px">
        <button class="btn-primary btn-sm" onclick="submitReview(${pizzaId})">Save Review</button>
        <button class="btn-secondary btn-sm" onclick="hideAddReviewForm(${pizzaId})">Cancel</button>
      </div>
    </div>
    <div id="reviewsList_${pizzaId}">
      ${reviews.length ? reviews.map(r => reviewItemHTML(r)).join('') : '<p style="color:var(--muted);font-size:12.5px;padding:8px 0">No reviews yet.</p>'}
    </div>
  </div>`;
}

function reviewItemHTML(r) {
  const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
  const date = new Date(r.created_at * 1000).toLocaleDateString();
  return `<div class="review-item" id="review_${r.id}">
    <div class="review-item-header">
      <span class="review-stars">${stars}</span>
      <span class="review-name">${escHtml(r.reviewer_name)}</span>
      <span class="review-date">${date}</span>
    </div>
    <div class="review-comment">${escHtml(r.comment||'')}</div>
    <div class="review-actions">
      <button class="btn-edit" onclick="toggleEditReview(${r.id},${r.pizza_id})">Edit</button>
      <button class="btn-danger" onclick="deleteReview(${r.id},${r.pizza_id})">Delete</button>
    </div>
    <div class="edit-review-form" id="editReview_${r.id}">
      <div class="form-grid" style="margin-bottom:10px">
        <div class="form-field"><label>Name</label><input type="text" id="er_name_${r.id}" value="${escAttr(r.reviewer_name)}" /></div>
        <div class="form-field"><label>Rating</label><input type="number" id="er_rating_${r.id}" min="1" max="5" value="${r.rating}" /></div>
      </div>
      <div class="form-field" style="margin-bottom:10px"><label>Comment</label><textarea id="er_comment_${r.id}">${escHtml(r.comment||'')}</textarea></div>
      <div style="display:flex;gap:8px">
        <button class="btn-primary btn-sm" onclick="saveReviewEdit(${r.id},${r.pizza_id})">Save</button>
        <button class="btn-secondary btn-sm" onclick="toggleEditReview(${r.id})">Cancel</button>
      </div>
    </div>
  </div>`;
}

function bindReviewEvents() {}

function showAddReviewForm(pid) { const f = document.getElementById(`addReviewForm_${pid}`); if (f) f.classList.add('open'); }
function hideAddReviewForm(pid) { const f = document.getElementById(`addReviewForm_${pid}`); if (f) f.classList.remove('open'); }
function toggleEditReview(rid) { const f = document.getElementById(`editReview_${rid}`); if (f) f.classList.toggle('open'); }

async function submitReview(pizzaId) {
  const name = document.getElementById('rv_name')?.value || 'Anonymous';
  const rating = parseInt(document.getElementById('rv_rating')?.value) || 5;
  const comment = document.getElementById('rv_comment')?.value || '';
  try {
    await api('/admin/api/reviews', { method: 'POST', body: JSON.stringify({ pizza_id: pizzaId, reviewer_name: name, rating, comment }) });
    const reviews = await api(`/admin/api/reviews?pizza_id=${pizzaId}`);
    document.getElementById(`reviewsList_${pizzaId}`).innerHTML = reviews.map(r => reviewItemHTML(r)).join('');
    document.getElementById(`addReviewForm_${pizzaId}`)?.classList.remove('open');
    S.pizzas = await api('/admin/api/pizzas');
    toast('Review added', 'success');
  } catch (_) { toast('Failed to add review', 'error'); }
}

async function saveReviewEdit(rid, pizzaId) {
  const name = document.getElementById(`er_name_${rid}`)?.value;
  const rating = parseInt(document.getElementById(`er_rating_${rid}`)?.value);
  const comment = document.getElementById(`er_comment_${rid}`)?.value;
  try {
    await api(`/admin/api/reviews/${rid}`, { method: 'PUT', body: JSON.stringify({ reviewer_name: name, rating, comment }) });
    const reviews = await api(`/admin/api/reviews?pizza_id=${pizzaId}`);
    document.getElementById(`reviewsList_${pizzaId}`).innerHTML = reviews.map(r => reviewItemHTML(r)).join('');
    toast('Review updated', 'success');
  } catch (_) { toast('Update failed', 'error'); }
}

async function deleteReview(rid, pizzaId) {
  if (!confirm('Delete this review?')) return;
  try {
    await api(`/admin/api/reviews/${rid}`, { method: 'DELETE' });
    document.getElementById(`review_${rid}`)?.remove();
    toast('Review deleted', 'info');
  } catch (_) { toast('Delete failed', 'error'); }
}

async function deletePizza(id) {
  if (!confirm('Delete this pizza?')) return;
  try { await api(`/admin/api/pizzas/${id}`, { method: 'DELETE' }); await loadPizzas(); toast('Pizza deleted', 'info'); }
  catch (_) { toast('Delete failed', 'error'); }
}

// ══ MEALS ═════════════════════════════════════════════════════════════

async function loadMeals() {
  try { S.meals = await api('/admin/api/meals'); renderMealsTable(); }
  catch (_) { toast('Failed to load meals', 'error'); }
}

function renderMealsTable() {
  const tbody = document.getElementById('mealsTableBody');
  if (!S.meals.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:40px">No meal deals yet.</td></tr>'; return; }
  tbody.innerHTML = S.meals.map(m => {
    const comps = tryParseJSON(m.components, []);
    return `<tr>
      <td class="td-img"><img src="${escAttr(m.image_url)}" onerror="this.style.background='#1a1a1a';this.removeAttribute('src')" /></td>
      <td><span class="td-name">${escHtml(m.name)}</span></td>
      <td style="font-size:12px;color:var(--txt2)">${escHtml(m.description||'')}</td>
      <td style="font-size:11.5px;color:var(--txt2)">${comps.map(c=>`• ${escHtml(c)}`).join('<br>')}</td>
      <td class="td-price">$${(+m.price).toFixed(2)}</td>
      <td><span class="status-pill ${m.active?'active':'inactive'}"><span class="status-dot"></span>${m.active?'Active':'Hidden'}</span></td>
      <td class="td-actions">
        <button class="btn-edit" onclick="openMealModal('edit',${m.id})">Edit</button>
        <button class="btn-danger" onclick="deleteMeal(${m.id})">Delete</button>
      </td>
    </tr>`;
  }).join('');
}

function openMealModal(action, id) {
  const m = id ? S.meals.find(x => x.id === id) : null;
  const comps = m ? tryParseJSON(m.components, []).join('\n') : '';
  document.getElementById('modalTitle').textContent = action === 'create' ? 'Add Meal Deal' : 'Edit Meal Deal';
  document.getElementById('modalBody').innerHTML = `
    <div class="form-row">
      <div class="form-field"><label>Meal Name *</label><input type="text" id="m_name" value="${escAttr(m?.name||'')}" placeholder="e.g. Pizza Meal" /></div>
      <div class="form-field"><label>Description</label><input type="text" id="m_desc" value="${escAttr(m?.description||'')}" placeholder="Short tagline" /></div>
      <div class="form-field"><label>Components (one per line)</label><textarea id="m_comps" placeholder="1 Pizza of your choice&#10;1 Drink (330ml)&#10;1 Dessert">${escHtml(comps)}</textarea></div>
      <div class="form-field"><label>Price</label><input type="number" id="m_price" step="0.01" value="${m?.price||16.90}" /></div>
      <div class="form-field"><label>Image URL</label><input type="text" id="m_imgurl" value="${escAttr(m?.image_url||'')}" />${m?.image_url?`<div class="img-preview"><img src="${escAttr(m.image_url)}" /></div>`:''}</div>
      <div class="form-field"><label>Upload Image</label><input type="file" id="m_img" accept="image/*" /></div>
      <div class="form-field"><label>Sort Order</label><input type="number" id="m_order" value="${m?.sort_order||0}" /></div>
      <div class="form-check-row"><input type="checkbox" id="m_active" ${m?.active!==0?'checked':''} /><label for="m_active">Active</label></div>
    </div>`;
  openModal(async () => {
    if (!v('m_name').trim()) { toast('Name required', 'error'); return; }
    const compsArr = v('m_comps').split('\n').map(l => l.trim()).filter(Boolean);
    const fd = new FormData();
    fd.append('name', v('m_name')); fd.append('description', v('m_desc'));
    fd.append('components', JSON.stringify(compsArr)); fd.append('price', v('m_price'));
    fd.append('image_url', v('m_imgurl')); fd.append('sort_order', v('m_order'));
    fd.append('active', ck('m_active')?'1':'0');
    const img = document.getElementById('m_img')?.files[0];
    if (img) fd.append('image', img);
    try {
      await fetch(action==='create'?'/admin/api/meals':`/admin/api/meals/${id}`, { method:action==='create'?'POST':'PUT', body:fd });
      closeModal(); await loadMeals(); toast('Meal saved', 'success');
    } catch (_) { toast('Save failed', 'error'); }
  });
}

async function deleteMeal(id) {
  if (!confirm('Delete this meal deal?')) return;
  try { await api(`/admin/api/meals/${id}`, { method: 'DELETE' }); await loadMeals(); toast('Meal deleted', 'info'); }
  catch (_) { toast('Delete failed', 'error'); }
}

// ══ COUPONS ════════════════════════════════════════════════════════════

async function loadCoupons() {
  try { S.coupons = await api('/admin/api/coupons'); renderCouponsTable(); }
  catch (_) { toast('Failed to load coupons', 'error'); }
}

function renderCouponsTable() {
  const tbody = document.getElementById('couponsTableBody');
  if (!S.coupons.length) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:40px">No coupons.</td></tr>'; return; }
  const now = Math.floor(Date.now() / 1000);
  tbody.innerHTML = S.coupons.map(c => {
    const expired = c.expires_at && c.expires_at < now;
    const usageDisplay = c.max_uses > 0 ? `${c.used_count} / ${c.max_uses}` : `${c.used_count} / ∞`;
    return `<tr>
      <td><code style="font-size:13px;font-weight:700;color:var(--yellow);background:rgba(245,200,66,.08);padding:4px 8px;border-radius:6px">${escHtml(c.code)}</code></td>
      <td style="font-size:12px;color:var(--txt2)">${escHtml(c.description||'')}</td>
      <td><span style="font-size:12px;text-transform:capitalize">${c.type}</span></td>
      <td class="td-price">${c.type==='percent'?c.value+'%':'$'+c.value.toFixed(2)}</td>
      <td style="font-size:12px">$${(+c.min_order).toFixed(2)}</td>
      <td style="font-size:12.5px;font-weight:600">${usageDisplay}</td>
      <td>
        ${expired?'<span class="badge-pill none">EXPIRED</span>':''}
        <span class="status-pill ${c.active&&!expired?'active':'inactive'}"><span class="status-dot"></span>${c.active&&!expired?'Active':'Inactive'}</span>
      </td>
      <td class="td-actions">
        <button class="btn-edit" onclick="openCouponModal('edit',${c.id})">Edit</button>
        <button class="btn-danger" onclick="deleteCoupon(${c.id})">Delete</button>
      </td>
    </tr>`;
  }).join('');
}

function openCouponModal(action, id) {
  const c = id ? S.coupons.find(x => x.id === id) : null;
  document.getElementById('modalTitle').textContent = action === 'create' ? 'Add Coupon' : 'Edit Coupon';
  document.getElementById('modalBody').innerHTML = `
    <div class="form-row">
      <div class="form-grid">
        <div class="form-field"><label>Code *</label><input type="text" id="c_code" value="${escAttr(c?.code||'')}" placeholder="PROMO10" style="text-transform:uppercase" /></div>
        <div class="form-field"><label>Type</label><select id="c_type"><option value="percent"${c?.type==='percent'?' selected':''}>Percentage (%)</option><option value="fixed"${c?.type==='fixed'?' selected':''}>Fixed ($)</option></select></div>
      </div>
      <div class="form-field"><label>Description</label><input type="text" id="c_desc" value="${escAttr(c?.description||'')}" placeholder="What does this coupon do?" /></div>
      <div class="form-grid">
        <div class="form-field"><label>Discount Value</label><input type="number" id="c_val" step="0.01" value="${c?.value||10}" placeholder="e.g. 20 for 20% off" /></div>
        <div class="form-field"><label>Min Order ($)</label><input type="number" id="c_min" step="0.01" value="${c?.min_order||0}" /></div>
      </div>
      <div class="form-field"><label>Max Uses (0 = unlimited)</label><input type="number" id="c_maxuses" value="${c?.max_uses||0}" /></div>
      <div class="form-field"><label>Expires At (leave blank for never)</label><input type="datetime-local" id="c_exp" value="${c?.expires_at?new Date(c.expires_at*1000).toISOString().slice(0,16):''}" /></div>
      <div class="form-check-row"><input type="checkbox" id="c_active" ${c?.active!==0?'checked':''} /><label for="c_active">Active</label></div>
    </div>`;
  openModal(async () => {
    if (!v('c_code').trim()) { toast('Code required', 'error'); return; }
    const expVal = v('c_exp');
    const body = { code: v('c_code').toUpperCase(), description: v('c_desc'), type: v('c_type'), value: v('c_val'), min_order: v('c_min'), max_uses: v('c_maxuses'), active: ck('c_active')?'1':'0', expires_at: expVal ? String(Math.floor(new Date(expVal).getTime()/1000)) : '' };
    try {
      await api(action==='create'?'/admin/api/coupons':`/admin/api/coupons/${id}`, { method:action==='create'?'POST':'PUT', body:JSON.stringify(body) });
      closeModal(); await loadCoupons(); toast('Coupon saved', 'success');
    } catch (_) { toast('Save failed', 'error'); }
  });
}

async function deleteCoupon(id) {
  if (!confirm('Delete this coupon?')) return;
  try { await api(`/admin/api/coupons/${id}`, { method: 'DELETE' }); await loadCoupons(); toast('Coupon deleted', 'info'); }
  catch (_) { toast('Delete failed', 'error'); }
}

// ══ BANNERS ════════════════════════════════════════════════════════════

async function loadBanners() {
  try { S.banners = await api('/admin/api/banners'); renderBannersTable(); }
  catch (_) { toast('Failed to load banners', 'error'); }
}

function renderBannersTable() {
  const tbody = document.getElementById('bannersTableBody');
  if (!S.banners.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:40px">No banners.</td></tr>'; return; }
  tbody.innerHTML = S.banners.map(b => `<tr>
    <td class="td-img"><img src="${escAttr(b.image_url)}" onerror="this.style.background='#1a1a1a';this.removeAttribute('src')" /></td>
    <td><span class="td-name">${escHtml(b.title)}</span></td>
    <td style="font-size:12px;color:var(--txt2)">${escHtml(b.subtitle||'—')}</td>
    <td style="font-size:12px">${escHtml(b.cta_text||'—')}</td>
    <td>${b.sort_order}</td>
    <td><span class="status-pill ${b.active?'active':'inactive'}"><span class="status-dot"></span>${b.active?'Active':'Hidden'}</span></td>
    <td class="td-actions"><button class="btn-edit" onclick="openBannerModal('edit',${b.id})">Edit</button><button class="btn-danger" onclick="deleteBanner(${b.id})">Delete</button></td>
  </tr>`).join('');
}

function openBannerModal(action, id) {
  const b = id ? S.banners.find(x => x.id === id) : null;
  document.getElementById('modalTitle').textContent = action === 'create' ? 'Add Banner' : 'Edit Banner';
  document.getElementById('modalBody').innerHTML = `
    <div class="form-row">
      <div class="form-field"><label>Title *</label><input type="text" id="b_title" value="${escAttr(b?.title||'')}" /></div>
      <div class="form-field"><label>Subtitle</label><input type="text" id="b_sub" value="${escAttr(b?.subtitle||'')}" /></div>
      <div class="form-field"><label>Description</label><textarea id="b_desc">${escHtml(b?.description||'')}</textarea></div>
      <div class="form-grid">
        <div class="form-field"><label>CTA Text</label><input type="text" id="b_cta" value="${escAttr(b?.cta_text||'Order Now')}" /></div>
        <div class="form-field"><label>CTA Link</label><input type="text" id="b_link" value="${escAttr(b?.cta_link||'#pizzas')}" /></div>
      </div>
      <div class="form-field"><label>Image URL</label><input type="text" id="b_imgurl" value="${escAttr(b?.image_url||'')}" />${b?.image_url?`<div class="img-preview"><img src="${escAttr(b.image_url)}" /></div>`:''}</div>
      <div class="form-field"><label>Upload Image</label><input type="file" id="b_img" accept="image/*" /></div>
      <div class="form-field"><label>Sort Order</label><input type="number" id="b_order" value="${b?.sort_order||0}" /></div>
      <div class="form-check-row"><input type="checkbox" id="b_active" ${b?.active!==0?'checked':''} /><label for="b_active">Active</label></div>
    </div>`;
  openModal(async () => {
    if (!v('b_title').trim()) { toast('Title required', 'error'); return; }
    if (!checkAdminPin()) return;
    const fd = new FormData();
    ['title:b_title','subtitle:b_sub','description:b_desc','cta_text:b_cta','cta_link:b_link','image_url:b_imgurl','sort_order:b_order'].forEach(pair => { const [k,i] = pair.split(':'); fd.append(k, v(i)); });
    fd.append('active', ck('b_active')?'1':'0');
    const img = document.getElementById('b_img')?.files[0];
    if (img) fd.append('image', img);
    try { await fetch(action==='create'?'/admin/api/banners':`/admin/api/banners/${id}`, { method:action==='create'?'POST':'PUT', body:fd }); closeModal(); await loadBanners(); toast('Banner saved', 'success'); }
    catch (_) { toast('Save failed', 'error'); }
  });
}

async function deleteBanner(id) {
  if (!confirm('Delete banner?')) return;
  try { await api(`/admin/api/banners/${id}`, { method: 'DELETE' }); await loadBanners(); toast('Deleted', 'info'); }
  catch (_) { toast('Failed', 'error'); }
}

// ══ ANNOUNCEMENTS ══════════════════════════════════════════════════════

async function loadAnnouncements() {
  try { S.announcements = await api('/admin/api/announcements'); renderAnnouncementsTable(); }
  catch (_) { toast('Failed', 'error'); }
}

function renderAnnouncementsTable() {
  const tbody = document.getElementById('announcementsTableBody');
  if (!S.announcements.length) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:40px">No announcements.</td></tr>'; return; }
  tbody.innerHTML = S.announcements.map(a => `<tr>
    <td style="color:var(--muted);font-size:12px">#${a.id}</td>
    <td style="max-width:400px;word-break:break-word;font-size:12.5px">${escHtml(a.text)}</td>
    <td><span class="status-pill ${a.active?'active':'inactive'}"><span class="status-dot"></span>${a.active?'Active':'Hidden'}</span></td>
    <td class="td-actions"><button class="btn-edit" onclick="openAnnouncementModal('edit',${a.id})">Edit</button><button class="btn-danger" onclick="deleteAnnouncement(${a.id})">Delete</button></td>
  </tr>`).join('');
}

function openAnnouncementModal(action, id) {
  const a = id ? S.announcements.find(x => x.id === id) : null;
  document.getElementById('modalTitle').textContent = action === 'create' ? 'Add Announcement' : 'Edit Announcement';
  document.getElementById('modalBody').innerHTML = `<div class="form-row"><div class="form-field"><label>Text *</label><textarea id="a_text" placeholder="🍕 FREE DELIVERY...">${escHtml(a?.text||'')}</textarea></div><div class="form-check-row"><input type="checkbox" id="a_active" ${a?.active!==0?'checked':''} /><label for="a_active">Active</label></div></div>`;
  openModal(async () => {
    if (!v('a_text').trim()) { toast('Text required', 'error'); return; }
    try { await api(action==='create'?'/admin/api/announcements':`/admin/api/announcements/${id}`, { method:action==='create'?'POST':'PUT', body:JSON.stringify({ text:v('a_text'), active:ck('a_active')?'1':'0' }) }); closeModal(); await loadAnnouncements(); toast('Saved', 'success'); }
    catch (_) { toast('Save failed', 'error'); }
  });
}

async function deleteAnnouncement(id) {
  if (!confirm('Delete?')) return;
  try { await api(`/admin/api/announcements/${id}`, { method: 'DELETE' }); await loadAnnouncements(); toast('Deleted', 'info'); }
  catch (_) {}
}

// ══ STORE SETTINGS ═════════════════════════════════════════════════════

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

async function loadStoreSettings() {
  try {
    const settings = await api('/admin/api/store-settings');
    const isOpen = settings.is_open === '1';
    const autoSchedule = settings.auto_schedule === '1';
    const schedule = tryParseJSON(settings.schedule, {});
    const statusMsg = settings.status_message || '';

    // Toggle
    const toggle = document.getElementById('storeOpenToggle');
    toggle.checked = isOpen;
    updateStoreIndicator(isOpen);
    toggle.addEventListener('change', async () => {
      const val = toggle.checked ? '1' : '0';
      await api('/admin/api/store-settings', { method: 'POST', body: JSON.stringify({ key: 'is_open', value: val }) });
      updateStoreIndicator(toggle.checked);
      toast(toggle.checked ? 'Store is now OPEN' : 'Store is now CLOSED', toggle.checked ? 'success' : 'info');
    });

    // Auto schedule toggle
    const autoToggle = document.getElementById('autoScheduleToggle');
    autoToggle.checked = autoSchedule;
    autoToggle.addEventListener('change', async () => {
      await api('/admin/api/store-settings', { method: 'POST', body: JSON.stringify({ key: 'auto_schedule', value: autoToggle.checked ? '1' : '0' }) });
      toast('Auto-schedule ' + (autoToggle.checked ? 'enabled' : 'disabled'), 'info');
    });

    // Status message
    document.getElementById('storeStatusMsg').value = statusMsg;
    document.getElementById('saveStatusMsg').addEventListener('click', async () => {
      const msg = document.getElementById('storeStatusMsg').value;
      await api('/admin/api/store-settings', { method: 'POST', body: JSON.stringify({ key: 'status_message', value: msg }) });
      toast('Status message saved', 'success');
    });

    // Schedule grid
    const grid = document.getElementById('scheduleGrid');
    grid.innerHTML = DAYS.map(day => {
      const dayData = schedule[day] || { enabled: true, open: '11:00', close: '23:00' };
      return `<div class="schedule-row ${dayData.enabled?'':'disabled'}" id="srow_${day}">
        <span class="schedule-day">${day.charAt(0).toUpperCase() + day.slice(1)}</span>
        <div class="schedule-toggle"><input type="checkbox" id="sch_en_${day}" ${dayData.enabled?'checked':''} onchange="toggleScheduleDay('${day}')" /></div>
        <div class="schedule-time"><label>Open</label><input type="time" id="sch_open_${day}" value="${dayData.open}" /></div>
        <div class="schedule-time"><label>Close</label><input type="time" id="sch_close_${day}" value="${dayData.close}" /></div>
      </div>`;
    }).join('');

    document.getElementById('saveScheduleBtn').addEventListener('click', saveSchedule);
  } catch (e) { toast('Failed to load store settings', 'error'); }
}

function updateStoreIndicator(isOpen) {
  const dot = document.getElementById('storeIndicatorDot');
  const label = document.getElementById('storeIndicatorLabel');
  const toggleLabel = document.getElementById('storeToggleLabel');
  dot.className = 'store-indicator-dot ' + (isOpen ? 'open' : 'closed');
  label.textContent = isOpen ? '● OPEN — Accepting orders' : '● CLOSED — Not accepting orders';
  label.style.color = isOpen ? 'var(--green)' : 'var(--red)';
  toggleLabel.textContent = isOpen ? 'Store is Open' : 'Store is Closed';
  toggleLabel.style.color = isOpen ? 'var(--green)' : 'var(--red)';
}

function toggleScheduleDay(day) {
  const isEnabled = document.getElementById(`sch_en_${day}`)?.checked;
  const row = document.getElementById(`srow_${day}`);
  if (row) row.className = 'schedule-row ' + (isEnabled ? '' : 'disabled');
}

async function saveSchedule() {
  const schedule = {};
  DAYS.forEach(day => {
    schedule[day] = {
      enabled: document.getElementById(`sch_en_${day}`)?.checked || false,
      open: document.getElementById(`sch_open_${day}`)?.value || '11:00',
      close: document.getElementById(`sch_close_${day}`)?.value || '23:00',
    };
  });
  try {
    await api('/admin/api/store-settings', { method: 'POST', body: JSON.stringify({ key: 'schedule', value: JSON.stringify(schedule) }) });
    toast('Schedule saved!', 'success');
  } catch (_) { toast('Save failed', 'error'); }
}

// ══ SITE SETTINGS ══════════════════════════════════════════════════════

async function loadSettings() {
  try {
    const rows = await api('/admin/api/settings');
    const HIDDEN_SETTINGS = new Set(['hours','meal_price','meal_description','orders_this_week','total_reviews','overall_rating']);
    const labels = { site_name:'Site Name', tagline:'Tagline', phone:'Phone', email:'Email', address:'Address', delivery_time:'Delivery Time', whatsapp:'WhatsApp Number' };
    document.getElementById('settingsGrid').innerHTML = rows.filter(s => !HIDDEN_SETTINGS.has(s.key)).map(s => `<div class="setting-card"><h4>${escHtml(labels[s.key]||s.key)}</h4><div class="setting-input-wrap"><input type="text" value="${escAttr(s.value||'')}" id="setting_${escAttr(s.key)}" /><button class="setting-save-btn" onclick="saveSetting('${escAttr(s.key)}')">Save</button></div></div>`).join('');
  } catch (_) { toast('Failed to load settings', 'error'); }
}

async function saveSetting(key) {
  const input = document.getElementById(`setting_${key}`);
  if (!input) return;
  try { await api('/admin/api/settings', { method: 'POST', body: JSON.stringify({ key, value: input.value }) }); toast('Saved', 'success'); }
  catch (_) { toast('Save failed', 'error'); }
}

// ══ MODAL ══════════════════════════════════════════════════════════════

let _saveCb = null;
function initModal() {
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modalSave').addEventListener('click', () => _saveCb && _saveCb());
  document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}
function openModal(onSave) { _saveCb = onSave; document.getElementById('modalOverlay').classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); document.body.style.overflow = ''; _saveCb = null; }

// ══ API ════════════════════════════════════════════════════════════════

async function api(url, opts = {}) {
  const options = { ...opts };
  if (opts.body && typeof opts.body === 'string') options.headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const r = await fetch(url, options);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ══ TOAST ══════════════════════════════════════════════════════════════

function toast(msg, type = 'info') {
  const c = document.getElementById('adminToastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-msg">${escHtml(msg)}</span>`;
  c.appendChild(el);
  setTimeout(() => { el.classList.add('removing'); el.addEventListener('animationend', () => el.remove()); }, 3000);
}

// ══ NOTIFICATION EMAILS ════════════════════════════════════════════════

let notifEmails = [];

async function loadNotificationEmails() {
  try {
    notifEmails = await api('/admin/api/notification-emails');
    renderNotifEmailsTable();
    const addBtn = document.getElementById('notifAddBtn');
    if (addBtn && !addBtn._bound) {
      addBtn._bound = true;
      addBtn.addEventListener('click', addNotificationEmail);
    }
    const emailInput = document.getElementById('notifEmailInput');
    if (emailInput && !emailInput._bound) {
      emailInput._bound = true;
      emailInput.addEventListener('keydown', e => { if (e.key === 'Enter') addNotificationEmail(); });
    }
  } catch (_) { toast('Failed to load notification settings', 'error'); }
}

function renderNotifEmailsTable() {
  const tbody = document.getElementById('notifEmailsTableBody');
  if (!notifEmails.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:40px">No email recipients yet. Add one above.</td></tr>';
    return;
  }
  tbody.innerHTML = notifEmails.map(e => `<tr id="nrow_${e.id}">
    <td><strong style="font-size:13px">${escHtml(e.email)}</strong></td>
    <td style="font-size:12px;color:var(--txt2)">${escHtml(e.label || '—')}</td>
    <td><span class="status-pill ${e.active ? 'active' : 'inactive'}"><span class="status-dot"></span>${e.active ? 'Active' : 'Inactive'}</span></td>
    <td style="font-size:11.5px;color:var(--muted)">${new Date(e.created_at * 1000).toLocaleDateString()}</td>
    <td class="td-actions">
      <button class="btn-edit" onclick="toggleNotifEmail(${e.id}, ${e.active ? 0 : 1}, '${escAttr(e.email)}', '${escAttr(e.label || '')}')">
        ${e.active ? 'Deactivate' : 'Activate'}
      </button>
      <button class="btn-danger" onclick="deleteNotifEmail(${e.id})">Remove</button>
    </td>
  </tr>`).join('');
}

async function addNotificationEmail() {
  const emailEl = document.getElementById('notifEmailInput');
  const labelEl = document.getElementById('notifLabelInput');
  const email = emailEl?.value.trim();
  const label = labelEl?.value.trim();
  if (!email || !email.includes('@')) { toast('Valid email required', 'error'); return; }
  try {
    await api('/admin/api/notification-emails', { method: 'POST', body: JSON.stringify({ email, label }) });
    if (emailEl) emailEl.value = '';
    if (labelEl) labelEl.value = '';
    await loadNotificationEmails();
    toast('Email added', 'success');
  } catch (_) { toast('Email already exists or invalid', 'error'); }
}

async function toggleNotifEmail(id, newActive, email, label) {
  try {
    await api(`/admin/api/notification-emails/${id}`, { method: 'PUT', body: JSON.stringify({ email, label, active: newActive ? '1' : '0' }) });
    await loadNotificationEmails();
    toast(newActive ? 'Email activated' : 'Email deactivated', 'info');
  } catch (_) { toast('Update failed', 'error'); }
}

async function deleteNotifEmail(id) {
  if (!confirm('Remove this email from notifications?')) return;
  try {
    await api(`/admin/api/notification-emails/${id}`, { method: 'DELETE' });
    document.getElementById(`nrow_${id}`)?.remove();
    notifEmails = notifEmails.filter(e => e.id !== id);
    if (!notifEmails.length) renderNotifEmailsTable();
    toast('Email removed', 'info');
  } catch (_) { toast('Remove failed', 'error'); }
}

// ══ PIN PROTECTION ══════════════════════════════════════════════════════

function checkAdminPin() {
  const pin = prompt('Enter admin PIN to save changes:');
  if (pin === null) return false;
  if (pin.trim() !== '2342') { toast('Incorrect PIN — changes not saved', 'error'); return false; }
  return true;
}

// ══ UTILS ══════════════════════════════════════════════════════════════

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function escAttr(s) { return escHtml(s); }
function capitalize(s) { return String(s).charAt(0).toUpperCase() + s.slice(1); }
function v(id) { return document.getElementById(id)?.value || ''; }
function ck(id) { return document.getElementById(id)?.checked || false; }
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function tryParseJSON(str, fallback) { try { return JSON.parse(str); } catch (_) { return fallback; } }
