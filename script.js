/* ============================================
   StockFlow – script.js
   Supabase-powered stock management app
   ============================================ */

// ---- Supabase Config ----
const SUPABASE_URL  = 'https://yilxxxosdnusrsfvpxfq.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpbHh4eG9zZG51c3JzZnZweGZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NTY5MDAsImV4cCI6MjA4ODMzMjkwMH0.Re37rvmguYcFML2rlXhCbNgnF1o2rLKq1RMkEUShDsA';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// ---- State ----
let state = {
  products:   [],
  categories: [],
  suppliers:  [],
  sales:      [],
  saleItems:  [],
  settings:   { currency: 'FCFA', company_name: 'Mon Entreprise', low_stock_alert: 'true', out_of_stock_alert: 'true', low_stock_default: '5' },
  charts:     {},
  currentPage: 'dashboard',
  searchFilter: ''
};

// ---- Helpers ----
const $  = id => document.getElementById(id);
const qs = sel => document.querySelector(sel);

function fmt(n)    { return new Intl.NumberFormat('fr-FR').format(Math.round(+n || 0)); }
function fmtCur(n) { return fmt(n) + ' ' + state.settings.currency; }
function fmtDate(d){ if(!d) return '—'; const dt = new Date(d); return dt.toLocaleDateString('fr-FR'); }
function now()     { return new Date().toISOString().slice(0,10); }

function stockStatus(p) {
  if (+p.stock === 0)              return { label: 'Rupture',     cls: 'out' };
  if (+p.stock <= +p.min_stock)    return { label: 'Stock faible',cls: 'warn' };
  return                                  { label: 'Normal',       cls: 'ok' };
}

function getAlerts() {
  return state.products.filter(p => +p.stock === 0 || +p.stock <= +p.min_stock);
}

function updateBadge() {
  const n = getAlerts().length;
  const b = $('alert-badge');
  if (!b) return;
  b.textContent = n;
  b.style.display = n ? 'inline' : 'none';
}

function showLoading(show) {
  const el = $('loading-overlay');
  if (el) el.classList.toggle('hidden', !show);
  const dot = qs('.sync-dot');
  const lbl = $('sync-label');
  if (dot) dot.className = 'sync-dot' + (show ? ' loading' : '');
  if (lbl) lbl.textContent = show ? 'Synchronisation...' : 'Connecté';
}

function toast(msg, type = 'success') {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type] || '📢'}</span><span>${msg}</span>`;
  $('toast-container').appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toast-out .3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

// ---- Navigation ----
function showPage(page) {
  state.currentPage = page;
  state.searchFilter = '';
  const si = $('global-search');
  if (si) si.value = '';
  document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active'));
  const ni = qs(`[data-page="${page}"]`);
  if (ni) ni.classList.add('active');
  const titles = {
    dashboard: 'Tableau de bord', products: 'Produits', stock: 'Gestion du stock',
    sales: 'Ventes', reports: 'Rapports & Statistiques', settings: 'Paramètres'
  };
  $('page-title').textContent = titles[page] || page;
  const btnCfg = {
    dashboard:  { label: '+ Produit',       fn: openAddProduct },
    products:   { label: '+ Produit',       fn: openAddProduct },
    stock:      { label: '+ Mouvement',     fn: openAddStock   },
    sales:      { label: '+ Vente',         fn: openAddSale    },
    reports:    { label: null },
    settings:   { label: null }
  };
  const btn = $('main-action-btn');
  const cfg = btnCfg[page];
  if (cfg && cfg.label) {
    btn.textContent = cfg.label;
    btn.style.display = 'inline-flex';
    btn.onclick = cfg.fn;
  } else {
    btn.style.display = 'none';
  }
  // Close mobile sidebar
  qs('.sidebar')?.classList.remove('mobile-open');
  render();
}

function toggleSidebar() {
  const sb = qs('.sidebar');
  if (!sb) return;
  if (window.innerWidth <= 700) {
    sb.classList.toggle('mobile-open');
  } else {
    sb.classList.toggle('collapsed');
  }
}

// ---- Supabase: Data Loading ----
async function loadAll() {
  showLoading(true);
  try {
    const [cats, sups, prods, sls, sitems, sets] = await Promise.all([
      db.from('categories').select('*').order('name'),
      db.from('suppliers').select('*').order('name'),
      db.from('products').select('*, category:categories(name,icon,color), supplier:suppliers(name)').order('name'),
      db.from('sales').select('*').order('sale_date', { ascending: false }),
      db.from('sale_items').select('*'),
      db.from('settings').select('*')
    ]);
    state.categories = cats.data || [];
    state.suppliers  = sups.data || [];
    state.products   = prods.data || [];
    state.sales      = sls.data || [];
    state.saleItems  = sitems.data || [];
    // Map settings
    (sets.data || []).forEach(s => { state.settings[s.key] = s.value; });
    // Update company name display
    const cn = $('company-name-display');
    if (cn) cn.textContent = state.settings.company_name || 'Mon Entreprise';
    updateBadge();
    render();
  } catch(e) {
    toast('Erreur de chargement: ' + e.message, 'error');
    const dot = qs('.sync-dot');
    const lbl = $('sync-label');
    if (dot) { dot.className = 'sync-dot offline'; }
    if (lbl) lbl.textContent = 'Hors ligne';
  } finally {
    showLoading(false);
  }
}

// ---- Render Router ----
function render() {
  // Destroy existing charts
  Object.values(state.charts).forEach(c => { try { c.destroy(); } catch(e){} });
  state.charts = {};
  const c = $('main-content');
  if (!c) return;
  const pages = {
    dashboard: renderDashboard,
    products:  renderProducts,
    stock:     renderStock,
    sales:     renderSales,
    reports:   renderReports,
    settings:  renderSettings
  };
  c.innerHTML = (pages[state.currentPage] || renderDashboard)();
  if (state.currentPage === 'reports') initReportCharts();
  if (state.currentPage === 'settings') bindSettings();
}

function onSearch(val) {
  state.searchFilter = val.toLowerCase();
  if (state.currentPage === 'products') {
    $('main-content').innerHTML = renderProducts();
  }
}

// ============================================
// DASHBOARD
// ============================================
function renderDashboard() {
  const totalStockVal = state.products.reduce((a, p) => a + (+p.cost * +p.stock), 0);
  const totalSalesVal = state.sales.reduce((a, s) => a + +s.total, 0);
  const alerts = getAlerts();
  const totalItems = state.products.reduce((a, p) => a + +p.stock, 0);
  const margin = calcMargin();
  const marginPct = totalSalesVal > 0 ? Math.round(margin / totalSalesVal * 100) : 0;

  return `
  <div class="grid-4">
    <div class="kpi blue">
      <div class="kpi-accent"></div><div class="kpi-icon">📦</div>
      <div class="kpi-label">Produits</div>
      <div class="kpi-value">${state.products.length}</div>
      <div class="kpi-sub">${totalItems} unités en stock</div>
    </div>
    <div class="kpi green">
      <div class="kpi-accent"></div><div class="kpi-icon">💰</div>
      <div class="kpi-label">Valeur du stock</div>
      <div class="kpi-value sm">${fmtCur(totalStockVal)}</div>
      <div class="kpi-change up">↑ coût d'achat</div>
    </div>
    <div class="kpi amber">
      <div class="kpi-accent"></div><div class="kpi-icon">🛒</div>
      <div class="kpi-label">Chiffre d'affaires</div>
      <div class="kpi-value sm">${fmtCur(totalSalesVal)}</div>
      <div class="kpi-sub">Marge ${marginPct}% · ${fmtCur(margin)}</div>
    </div>
    <div class="kpi ${alerts.length ? 'red' : 'cyan'}">
      <div class="kpi-accent"></div><div class="kpi-icon">⚠️</div>
      <div class="kpi-label">Alertes stock</div>
      <div class="kpi-value" style="color:${alerts.length ? 'var(--red)' : 'var(--green)'}">${alerts.length}</div>
      <div class="kpi-sub">${alerts.filter(p => +p.stock === 0).length} ruptures · ${alerts.filter(p => +p.stock > 0).length} faibles</div>
    </div>
  </div>

  ${alerts.length ? `
  <div class="card mb-16">
    <div class="section-header"><h3>🔔 Alertes actives</h3><span class="text-muted" style="font-size:12px">${alerts.length} produit(s) à réapprovisionner</span></div>
    ${alerts.slice(0,5).map(p => `
      <div class="alert-item ${+p.stock === 0 ? 'critical' : 'warning'}">
        <span class="alert-icon">${p.icon || '📦'}</span>
        <div class="alert-text">
          <strong>${p.name}</strong>
          <span>${+p.stock === 0 ? '⛔ Rupture totale' : '⚠️ Stock faible'} · Stock: ${p.stock} ${p.unit} · Min: ${p.min_stock}</span>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="openAddStock('${p.id}')">Réappro</button>
      </div>`).join('')}
  </div>` : `
  <div class="card mb-16">
    <div class="alert-item success">
      <span class="alert-icon">✅</span>
      <div class="alert-text"><strong>Tous les stocks sont OK</strong><span>Aucune alerte en ce moment</span></div>
    </div>
  </div>`}

  <div class="grid-2">
    <div class="card">
      <div class="section-header">
        <h3>📦 Produits récents</h3>
        <button class="btn btn-ghost btn-sm" onclick="showPage('products')">Voir tout →</button>
      </div>
      <div class="table-wrap">
      <table><thead><tr><th>Produit</th><th>Catégorie</th><th>Stock</th><th>Statut</th></tr></thead><tbody>
      ${state.products.slice(0,6).map(p => {
        const s = stockStatus(p);
        return `<tr onclick="openEditProduct('${p.id}')">
          <td class="prod-name-col"><span class="prod-icon">${p.icon||'📦'}</span><div class="prod-info"><div class="name">${p.name}</div></div></td>
          <td>${p.category?.name || '—'}</td>
          <td><strong>${p.stock}</strong> <span class="text-muted">${p.unit}</span></td>
          <td><span class="pill ${s.cls}">${s.label}</span></td>
        </tr>`;
      }).join('')}
      </tbody></table></div>
    </div>
    <div class="card">
      <div class="section-header">
        <h3>💰 Dernières ventes</h3>
        <button class="btn btn-ghost btn-sm" onclick="showPage('sales')">Voir tout →</button>
      </div>
      <div class="table-wrap">
      <table><thead><tr><th>Date</th><th>Client</th><th>Total</th></tr></thead><tbody>
      ${state.sales.slice(0,6).map(s => `
        <tr>
          <td class="td-muted">${fmtDate(s.sale_date)}</td>
          <td>${s.client || '—'}</td>
          <td class="text-green fw-bold">${fmtCur(s.total)}</td>
        </tr>`).join('')}
      ${state.sales.length === 0 ? '<tr class="empty-row"><td colspan="3">Aucune vente</td></tr>' : ''}
      </tbody></table></div>
    </div>
  </div>`;
}

// ============================================
// PRODUCTS
// ============================================
function renderProducts() {
  const f = state.searchFilter;
  const prods = f
    ? state.products.filter(p =>
        p.name.toLowerCase().includes(f) ||
        (p.category?.name || '').toLowerCase().includes(f) ||
        (p.sku || '').toLowerCase().includes(f))
    : state.products;

  return `
  <div class="section-header">
    <h3>${prods.length} produit(s)</h3>
    <div class="section-actions">
      <select onchange="filterProductsByCategory(this.value)" style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:7px 12px;color:var(--text);font-size:12px;font-family:var(--font);cursor:pointer;outline:none">
        <option value="">Toutes catégories</option>
        ${state.categories.map(c => `<option value="${c.name}">${c.icon || '📦'} ${c.name}</option>`).join('')}
      </select>
      <button class="export-btn export-excel" onclick="exportProductsExcel()">📊 Excel</button>
      <button class="export-btn export-pdf"   onclick="exportProductsPDF()">📄 PDF</button>
    </div>
  </div>
  <div class="card card-flush">
  <div class="table-wrap">
  <table><thead><tr>
    <th>Produit</th><th>SKU</th><th>Catégorie</th><th>Fournisseur</th>
    <th>Prix vente</th><th>Coût</th><th>Stock</th><th>Valeur</th><th>Statut</th><th>Actions</th>
  </tr></thead><tbody>
  ${prods.length === 0 ? '<tr class="empty-row"><td colspan="10">Aucun produit trouvé</td></tr>' : ''}
  ${prods.map(p => {
    const s = stockStatus(p);
    const pct = +p.min_stock > 0 ? Math.min(100, Math.round(+p.stock / +p.min_stock * 50)) : 50;
    const gc = +p.stock === 0 ? 'var(--red)' : +p.stock <= +p.min_stock ? 'var(--amber)' : 'var(--green)';
    return `<tr>
      <td class="prod-name-col"><span class="prod-icon">${p.icon||'📦'}</span>
        <div class="prod-info">
          <div class="name">${p.name}</div>
          <div class="meta">${p.supplier?.name || '—'} · ${p.unit}</div>
        </div>
      </td>
      <td><code class="sku">${p.sku || '—'}</code></td>
      <td>${p.category?.name || '—'}</td>
      <td class="td-muted">${p.supplier?.name || '—'}</td>
      <td class="text-accent fw-bold">${fmtCur(p.price)}</td>
      <td class="td-muted">${fmtCur(p.cost)}</td>
      <td>
        <div class="stock-gauge">
          <div class="gauge-bar"><div class="gauge-fill" style="width:${Math.min(100,pct)}%;background:${gc}"></div></div>
          <strong>${p.stock}</strong>
        </div>
      </td>
      <td>${fmtCur(+p.cost * +p.stock)}</td>
      <td><span class="pill ${s.cls}"><span class="dot ${s.cls==='ok'?'green':s.cls==='warn'?'amber':'red'}"></span>${s.label}</span></td>
      <td>
        <div class="flex gap-8">
          <button class="btn btn-ghost btn-icon btn-sm" onclick="openEditProduct('${p.id}');event.stopPropagation()" title="Modifier">✏️</button>
          <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteProduct('${p.id}');event.stopPropagation()" title="Supprimer">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('')}
  </tbody></table></div></div>`;
}

function filterProductsByCategory(cat) {
  state.searchFilter = cat.toLowerCase();
  $('main-content').innerHTML = renderProducts();
}

// ============================================
// STOCK
// ============================================
function renderStock() {
  const alerts = getAlerts();
  const totalVal = state.products.reduce((a, p) => a + +p.cost * +p.stock, 0);
  return `
  ${alerts.length ? `
  <div class="card mb-16">
    <div class="section-header"><h3>⚠️ Alertes (${alerts.length})</h3></div>
    ${alerts.map(p => `
      <div class="alert-item ${+p.stock===0?'critical':'warning'}">
        <span class="alert-icon">${p.icon||'📦'}</span>
        <div class="alert-text">
          <strong>${p.name}</strong>
          <span>${+p.stock===0?'⛔ RUPTURE DE STOCK':'⚠️ Stock faible'} · Actuel: ${p.stock} ${p.unit} · Min: ${p.min_stock} · Fournisseur: ${p.supplier?.name||'—'}</span>
        </div>
        <button class="btn btn-primary btn-sm" onclick="openAddStock('${p.id}')">+ Réappro</button>
      </div>`).join('')}
  </div>` : `
  <div class="card mb-16">
    <div class="alert-item success">
      <span class="alert-icon">✅</span>
      <div class="alert-text"><strong>Tous les stocks sont OK</strong><span>Aucune rupture ni stock faible</span></div>
    </div>
  </div>`}

  <div class="card card-flush">
    <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <h3 style="font-size:14px;font-weight:600">Niveaux de stock</h3>
      <div class="flex gap-8 flex-wrap">
        <span class="text-muted" style="font-size:12px">Valeur totale: <strong class="text-accent">${fmtCur(totalVal)}</strong></span>
        <button class="export-btn export-excel" onclick="exportStockExcel()">📊 Excel</button>
        <button class="export-btn export-pdf"   onclick="exportStockPDF()">📄 PDF</button>
      </div>
    </div>
    <div class="table-wrap">
    <table><thead><tr>
      <th>Produit</th><th>Catégorie</th><th>Stock actuel</th><th>Min</th><th>Jauge</th>
      <th>Prix vente</th><th>Coût achat</th><th>Valeur stock</th><th>Statut</th>
    </tr></thead><tbody>
    ${state.products.map(p => {
      const s = stockStatus(p);
      const pct = +p.min_stock > 0 ? Math.min(100, Math.round(+p.stock / +p.min_stock * 50)) : 50;
      const gc = +p.stock===0?'var(--red)':+p.stock<=+p.min_stock?'var(--amber)':'var(--green)';
      return `<tr>
        <td class="prod-name-col"><span class="prod-icon">${p.icon||'📦'}</span>${p.name}</td>
        <td class="td-muted">${p.category?.name||'—'}</td>
        <td><strong>${p.stock}</strong> <span class="td-muted">${p.unit}</span></td>
        <td class="td-muted">${p.min_stock}</td>
        <td><div class="gauge-bar" style="width:80px"><div class="gauge-fill" style="width:${Math.min(100,pct)}%;background:${gc}"></div></div></td>
        <td class="text-accent">${fmtCur(p.price)}</td>
        <td class="td-muted">${fmtCur(p.cost)}</td>
        <td>${fmtCur(+p.cost * +p.stock)}</td>
        <td><span class="pill ${s.cls}"><span class="dot ${s.cls==='ok'?'green':s.cls==='warn'?'amber':'red'}"></span>${s.label}</span></td>
      </tr>`;
    }).join('')}
    </tbody></table></div>
  </div>`;
}

// ============================================
// SALES
// ============================================
function renderSales() {
  const total = state.sales.reduce((a, s) => a + +s.total, 0);
  const qty   = state.saleItems.reduce((a, i) => a + +i.quantity, 0);
  const avg   = state.sales.length ? total / state.sales.length : 0;
  return `
  <div class="grid-3">
    <div class="kpi green"><div class="kpi-accent"></div><div class="kpi-icon">💰</div>
      <div class="kpi-label">Chiffre d'affaires</div>
      <div class="kpi-value sm">${fmtCur(total)}</div>
    </div>
    <div class="kpi blue"><div class="kpi-accent"></div><div class="kpi-icon">🧾</div>
      <div class="kpi-label">Transactions</div>
      <div class="kpi-value">${state.sales.length}</div>
      <div class="kpi-sub">Panier moyen: ${fmtCur(avg)}</div>
    </div>
    <div class="kpi amber"><div class="kpi-accent"></div><div class="kpi-icon">📦</div>
      <div class="kpi-label">Unités vendues</div>
      <div class="kpi-value">${qty}</div>
    </div>
  </div>
  <div class="card card-flush">
    <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <h3 style="font-size:14px;font-weight:600">Historique des ventes</h3>
      <div class="flex gap-8 flex-wrap">
        <button class="export-btn export-excel" onclick="exportSalesExcel()">📊 Excel</button>
        <button class="export-btn export-pdf"   onclick="exportSalesPDF()">📄 PDF</button>
      </div>
    </div>
    <div class="table-wrap">
    <table><thead><tr>
      <th>Date</th><th>Référence</th><th>Client</th><th>Produits</th><th>Total</th><th>Actions</th>
    </tr></thead><tbody>
    ${state.sales.length===0?'<tr class="empty-row"><td colspan="6">Aucune vente enregistrée</td></tr>':''}
    ${state.sales.map(s => {
      const items = state.saleItems.filter(i => i.sale_id === s.id);
      return `<tr>
        <td class="td-muted">${fmtDate(s.sale_date)}</td>
        <td><code class="sku">${s.reference||'—'}</code></td>
        <td>${s.client||'—'}</td>
        <td class="td-muted">${items.length} article(s)</td>
        <td class="text-green fw-bold">${fmtCur(s.total)}</td>
        <td>
          <div class="flex gap-8">
            <button class="btn btn-ghost btn-icon btn-sm" onclick="viewSaleDetail('${s.id}');event.stopPropagation()" title="Détails">👁️</button>
            <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteSale('${s.id}');event.stopPropagation()" title="Supprimer">🗑️</button>
          </div>
        </td>
      </tr>`;
    }).join('')}
    </tbody></table></div>
  </div>`;
}

// ============================================
// REPORTS
// ============================================
function calcMargin() {
  return state.saleItems.reduce((a, item) => {
    const p = state.products.find(x => x.id === item.product_id);
    return a + (p ? (+item.unit_price - +p.cost) * +item.quantity : 0);
  }, 0);
}

function renderReports() {
  const totalSales = state.sales.reduce((a, s) => a + +s.total, 0);
  const margin     = calcMargin();
  const marginPct  = totalSales > 0 ? Math.round(margin / totalSales * 100) : 0;
  const totalStock = state.products.reduce((a, p) => a + +p.cost * +p.stock, 0);
  const ruptures   = state.products.filter(p => +p.stock === 0).length;

  // Category breakdown
  const catMap = {};
  state.products.forEach(p => {
    const k = p.category?.name || 'Autre';
    if (!catMap[k]) catMap[k] = { val: 0, count: 0, color: p.category?.color || '#4A90E2' };
    catMap[k].val   += +p.cost * +p.stock;
    catMap[k].count++;
  });
  const catEntries = Object.entries(catMap).sort((a,b) => b[1].val - a[1].val);
  const totalCatVal = catEntries.reduce((a, c) => a + c[1].val, 0);

  // Top products by sales
  const prodMap = {};
  state.saleItems.forEach(item => {
    if (!prodMap[item.product_name]) prodMap[item.product_name] = 0;
    prodMap[item.product_name] += +item.total;
  });
  const topProds = Object.entries(prodMap).sort((a,b) => b[1]-a[1]).slice(0,6);

  // Sales by day (last 7 days as labels, grouped)
  const dayLabels = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
  const salesByDay = [0,0,0,0,0,0,0];
  state.sales.forEach(s => {
    const d = new Date(s.sale_date);
    const idx = (d.getDay() + 6) % 7; // Mon=0
    salesByDay[idx] += +s.total;
  });

  return `
  <div class="section-header">
    <h3>Vue d'ensemble</h3>
    <div class="export-bar">
      <button class="export-btn export-excel" onclick="exportFullReportExcel()">📊 Rapport Excel</button>
      <button class="export-btn export-pdf"   onclick="exportFullReportPDF()">📄 Rapport PDF</button>
    </div>
  </div>

  <div class="grid-4">
    <div class="kpi blue"><div class="kpi-accent"></div><div class="kpi-icon">🗄️</div>
      <div class="kpi-label">Valeur totale stock</div><div class="kpi-value sm">${fmtCur(totalStock)}</div>
    </div>
    <div class="kpi green"><div class="kpi-accent"></div><div class="kpi-icon">📈</div>
      <div class="kpi-label">Marge bénéficiaire</div><div class="kpi-value">${marginPct}%</div>
      <div class="kpi-sub">${fmtCur(margin)}</div>
    </div>
    <div class="kpi red"><div class="kpi-accent"></div><div class="kpi-icon">⛔</div>
      <div class="kpi-label">Ruptures</div><div class="kpi-value" style="color:var(--red)">${ruptures}</div>
    </div>
    <div class="kpi amber"><div class="kpi-accent"></div><div class="kpi-icon">🧾</div>
      <div class="kpi-label">Transactions</div><div class="kpi-value">${state.sales.length}</div>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="section-header"><h3>📊 Ventes par jour de la semaine</h3></div>
      <div style="position:relative;height:200px">
        <canvas id="chart-sales-day"></canvas>
      </div>
    </div>
    <div class="card">
      <div class="section-header"><h3>🥧 Répartition stock par catégorie</h3></div>
      <div style="position:relative;height:200px">
        <canvas id="chart-stock-cat"></canvas>
      </div>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="section-header"><h3>🏆 Top produits (ventes)</h3></div>
      ${topProds.length === 0 ? '<div class="text-muted text-center" style="padding:20px">Aucune vente</div>' : topProds.map(([name, val], i) => `
        <div class="progress-row">
          <div class="progress-label">${i===0?'🥇':i===1?'🥈':i===2?'🥉':'·'} ${name.substring(0,15)}</div>
          <div class="progress-bar"><div class="progress-fill" style="width:${topProds[0][1]>0?Math.round(val/topProds[0][1]*100):0}%;background:var(--green)"></div></div>
          <div class="progress-val">${fmtCur(val)}</div>
        </div>`).join('')}
    </div>
    <div class="card">
      <div class="section-header"><h3>📋 Résumé financier</h3></div>
      <div class="fin-row"><span class="label">Chiffre d'affaires</span><span class="value text-green">${fmtCur(totalSales)}</span></div>
      <div class="fin-row"><span class="label">Coût des marchandises</span><span class="value text-red">${fmtCur(totalSales - margin)}</span></div>
      <div class="fin-row highlight"><span class="label" style="font-weight:600;color:var(--text)">Bénéfice brut</span><span class="value">${fmtCur(margin)}</span></div>
      <div class="fin-row"><span class="label">Taux de marge</span><span class="value text-accent">${marginPct}%</span></div>
      <div class="fin-row"><span class="label">Valeur totale stock</span><span class="value">${fmtCur(totalStock)}</span></div>
    </div>
  </div>

  <div class="card">
    <div class="section-header"><h3>🏷️ Stock par catégorie</h3></div>
    ${catEntries.map(([cat, data]) => `
      <div class="progress-row">
        <div class="progress-label">${cat}</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${totalCatVal>0?Math.round(data.val/totalCatVal*100):0}%;background:${data.color}"></div></div>
        <div class="progress-val">${fmtCur(data.val)} <span class="text-muted">(${data.count})</span></div>
      </div>`).join('')}
  </div>`;
}

function initReportCharts() {
  // Sales by weekday
  const dayLabels = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
  const salesByDay = [0,0,0,0,0,0,0];
  state.sales.forEach(s => {
    const d = new Date(s.sale_date);
    const idx = (d.getDay() + 6) % 7;
    salesByDay[idx] += +s.total;
  });

  const ctx1 = document.getElementById('chart-sales-day');
  if (ctx1) {
    state.charts.salesDay = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: dayLabels,
        datasets: [{
          data: salesByDay,
          backgroundColor: 'rgba(74,144,226,0.6)',
          borderColor: 'rgba(74,144,226,1)',
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8892A4' } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8892A4', callback: v => fmtCur(v) } }
        }
      }
    });
  }

  // Stock by category pie
  const catMap = {};
  state.products.forEach(p => {
    const k = p.category?.name || 'Autre';
    if (!catMap[k]) catMap[k] = { val: 0, color: p.category?.color || '#4A90E2' };
    catMap[k].val += +p.cost * +p.stock;
  });
  const catLabels = Object.keys(catMap);
  const catVals   = catLabels.map(k => catMap[k].val);
  const catColors = catLabels.map(k => catMap[k].color);

  const ctx2 = document.getElementById('chart-stock-cat');
  if (ctx2) {
    state.charts.stockCat = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: catLabels,
        datasets: [{ data: catVals, backgroundColor: catColors, borderWidth: 2, borderColor: '#131620' }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: '#8892A4', font: { size: 11 }, boxWidth: 12 } }
        }
      }
    });
  }
}

// ============================================
// SETTINGS
// ============================================
function renderSettings() {
  const s = state.settings;
  return `
  <div class="grid-2">
    <div class="card settings-group">
      <h3>🏢 Entreprise</h3>
      <div class="form-group">
        <label>Nom de l'entreprise</label>
        <input id="s-company" value="${s.company_name||''}" onchange="saveSetting('company_name',this.value)" />
      </div>
      <div class="form-group">
        <label>Devise</label>
        <select id="s-currency" onchange="saveSetting('currency',this.value)">
          ${['FCFA','XOF','EUR','USD','MAD','CDF','DZD','TND','GHS','NGN'].map(c =>
            `<option ${s.currency===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="card settings-group">
      <h3>🔔 Alertes de stock</h3>
      <div class="toggle-row">
        <div class="toggle-info"><strong>Alerte rupture de stock</strong><span>Notifier quand stock = 0</span></div>
        <div class="toggle-switch ${s.out_of_stock_alert==='true'?'on':''}" id="t-out" onclick="toggleSetting('out_of_stock_alert','t-out')"></div>
      </div>
      <div class="toggle-row">
        <div class="toggle-info"><strong>Alerte stock faible</strong><span>Notifier sous le seuil minimum</span></div>
        <div class="toggle-switch ${s.low_stock_alert==='true'?'on':''}" id="t-low" onclick="toggleSetting('low_stock_alert','t-low')"></div>
      </div>
      <div class="form-group mt-16">
        <label>Seuil stock faible par défaut</label>
        <input type="number" id="s-threshold" value="${s.low_stock_default||5}" min="1" onchange="saveSetting('low_stock_default',this.value)" />
      </div>
    </div>
  </div>

  <div class="card settings-group">
    <h3>🏷️ Catégories disponibles</h3>
    <p class="text-muted" style="font-size:12px;margin-bottom:12px">Toutes sortes de produits acceptées — créez vos propres catégories</p>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">
      ${state.categories.map(c => `<span class="pill info">${c.icon||'📦'} ${c.name}</span>`).join('')}
    </div>
    <button class="btn btn-secondary btn-sm" onclick="openAddCategory()">+ Nouvelle catégorie</button>
  </div>

  <div class="card settings-group">
    <h3>🏭 Fournisseurs</h3>
    <div class="table-wrap" style="margin-bottom:12px">
    <table><thead><tr><th>Nom</th><th>Email</th><th>Téléphone</th><th>Actions</th></tr></thead><tbody>
    ${state.suppliers.length===0?'<tr class="empty-row"><td colspan="4">Aucun fournisseur</td></tr>':''}
    ${state.suppliers.map(s => `<tr>
      <td>${s.name}</td>
      <td class="td-muted">${s.email||'—'}</td>
      <td class="td-muted">${s.phone||'—'}</td>
      <td><button class="btn btn-ghost btn-xs" onclick="deleteSupplier('${s.id}')">🗑️</button></td>
    </tr>`).join('')}
    </tbody></table></div>
    <button class="btn btn-secondary btn-sm" onclick="openAddSupplier()">+ Fournisseur</button>
  </div>

  <div class="card settings-group">
    <h3>📥 Données</h3>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn btn-secondary" onclick="exportFullReportExcel()">📊 Export complet Excel</button>
      <button class="btn btn-secondary" onclick="exportFullReportPDF()">📄 Export complet PDF</button>
      <button class="btn btn-danger"    onclick="confirmReset()">🗑️ Réinitialiser</button>
    </div>
    <div class="form-note mt-8">
      ${state.products.length} produit(s) · ${state.sales.length} vente(s) · ${state.categories.length} catégorie(s)
    </div>
  </div>`;
}

function bindSettings() { /* already using inline onchange */ }

async function saveSetting(key, val) {
  state.settings[key] = val;
  if (key === 'company_name') {
    const cn = $('company-name-display');
    if (cn) cn.textContent = val;
  }
  await db.from('settings').upsert({ key, value: String(val) }, { onConflict: 'key' });
  toast('Paramètre sauvegardé', 'success');
}

function toggleSetting(key, elId) {
  const val = state.settings[key] !== 'true';
  state.settings[key] = val ? 'true' : 'false';
  const el = $(elId);
  if (el) el.classList.toggle('on', val);
  db.from('settings').upsert({ key, value: String(val) }, { onConflict: 'key' });
}

// ============================================
// MODAL HELPERS
// ============================================
function showModal(html, wide = false) {
  const m = $('modal');
  const mi = $('modal-inner');
  mi.className = 'modal-box' + (wide ? ' wide' : '');
  mi.innerHTML = html;
  m.classList.remove('hidden');
}
function closeModal() { $('modal').classList.add('hidden'); }

// ============================================
// PRODUCT CRUD
// ============================================
function openAddProduct() {
  const EMOJIS = ['📦','🌾','🫙','📱','🧼','🔌','🧱','👗','🍫','💊','🥤','🌱','🪑','🔧','🛞','📚','💻','⚽','🎸','🎨','🧴','🔑','💡','🎁','🥩','🍞','🥛','🧲'];
  showModal(`
  <div class="modal-header"><h3>➕ Nouveau produit</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
  <div class="modal-body">
    <div class="form-group">
      <label>Icône</label>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <span id="selected-emoji" style="font-size:30px">📦</span>
        <input id="m-img" type="text" value="📦" maxlength="4" style="width:80px" oninput="$('selected-emoji').textContent=this.value" placeholder="📦" />
      </div>
      <div class="emoji-grid">
        ${EMOJIS.map(e => `<div class="emoji-btn" onclick="selectEmoji('${e}')">${e}</div>`).join('')}
      </div>
    </div>
    <div class="form-group"><label>Nom du produit <span class="required-mark">*</span></label><input id="m-name" placeholder="Ex: Riz Premium 25kg" /></div>
    <div class="form-row">
      <div class="form-group">
        <label>Catégorie <span class="required-mark">*</span></label>
        <select id="m-cat">
          <option value="">-- Choisir --</option>
          ${state.categories.map(c => `<option value="${c.id}">${c.icon||''} ${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Fournisseur</label>
        <select id="m-sup">
          <option value="">-- Aucun --</option>
          ${state.suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Prix de vente (${state.settings.currency}) <span class="required-mark">*</span></label><input id="m-price" type="number" placeholder="0" min="0" step="any" /></div>
      <div class="form-group"><label>Coût d'achat (${state.settings.currency})</label><input id="m-cost" type="number" placeholder="0" min="0" step="any" /></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Stock initial</label><input id="m-stock" type="number" placeholder="0" min="0" /></div>
      <div class="form-group"><label>Stock minimum (alerte)</label><input id="m-minstock" type="number" placeholder="${state.settings.low_stock_default||5}" min="0" /></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Unité de mesure</label><input id="m-unit" placeholder="Pièce, Kg, Litre, Sac..." value="Pièce" /></div>
      <div class="form-group"><label>Référence / SKU</label><input id="m-sku" placeholder="Ex: ALI-001" /></div>
    </div>
    <div class="form-group"><label>Description (optionnel)</label><textarea id="m-desc" placeholder="Description du produit..."></textarea></div>
  </div>
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
    <button class="btn btn-primary" onclick="addProduct()">💾 Enregistrer</button>
  </div>`);
}

function selectEmoji(e) {
  const inp = $('m-img'); if (inp) inp.value = e;
  const disp = $('selected-emoji'); if (disp) disp.textContent = e;
  document.querySelectorAll('.emoji-btn').forEach(b => b.classList.toggle('selected', b.textContent === e));
}

async function addProduct() {
  const name  = $('m-name')?.value.trim();
  const catId = $('m-cat')?.value;
  const price = parseFloat($('m-price')?.value || 0);
  if (!name)  { toast('Le nom est requis', 'error'); return; }
  if (!catId) { toast('La catégorie est requise', 'error'); return; }
  if (!price) { toast('Le prix de vente est requis', 'error'); return; }
  const payload = {
    name, category_id: catId,
    supplier_id:  $('m-sup')?.value || null,
    price,
    cost:      parseFloat($('m-cost')?.value || 0),
    stock:     parseInt($('m-stock')?.value || 0),
    min_stock: parseInt($('m-minstock')?.value || state.settings.low_stock_default || 5),
    unit:      $('m-unit')?.value.trim() || 'Pièce',
    sku:       $('m-sku')?.value.trim() || null,
    description: $('m-desc')?.value.trim() || null,
    icon:      $('m-img')?.value.trim() || '📦'
  };
  const { error } = await db.from('products').insert(payload);
  if (error) { toast('Erreur: ' + error.message, 'error'); return; }
  toast('Produit ajouté avec succès !', 'success');
  closeModal();
  await loadAll();
}

function openEditProduct(id) {
  const p = state.products.find(x => x.id === id);
  if (!p) return;
  showModal(`
  <div class="modal-header"><h3>✏️ Modifier: ${p.name}</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
  <div class="modal-body">
    <div class="form-row">
      <div class="form-group"><label>Icône</label><input id="e-img" value="${p.icon||'📦'}" maxlength="4" /></div>
      <div class="form-group"><label>Nom <span class="required-mark">*</span></label><input id="e-name" value="${p.name}" /></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Catégorie</label>
        <select id="e-cat">
          ${state.categories.map(c => `<option value="${c.id}" ${c.id===p.category_id?'selected':''}>${c.icon||''} ${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Fournisseur</label>
        <select id="e-sup">
          <option value="">-- Aucun --</option>
          ${state.suppliers.map(s => `<option value="${s.id}" ${s.id===p.supplier_id?'selected':''}>${s.name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Prix vente (${state.settings.currency})</label><input id="e-price" type="number" value="${p.price}" min="0" step="any" /></div>
      <div class="form-group"><label>Coût achat</label><input id="e-cost" type="number" value="${p.cost}" min="0" step="any" /></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Stock actuel</label><input id="e-stock" type="number" value="${p.stock}" min="0" /></div>
      <div class="form-group"><label>Stock minimum</label><input id="e-minstock" type="number" value="${p.min_stock}" min="0" /></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Unité</label><input id="e-unit" value="${p.unit}" /></div>
      <div class="form-group"><label>SKU</label><input id="e-sku" value="${p.sku||''}" /></div>
    </div>
  </div>
  <div class="modal-footer">
    <button class="btn btn-danger btn-sm" onclick="deleteProduct('${id}');closeModal()">Supprimer</button>
    <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
    <button class="btn btn-primary" onclick="saveEdit('${id}')">💾 Sauvegarder</button>
  </div>`);
}

async function saveEdit(id) {
  const payload = {
    name:         $('e-name')?.value.trim(),
    icon:         $('e-img')?.value.trim() || '📦',
    category_id:  $('e-cat')?.value || null,
    supplier_id:  $('e-sup')?.value || null,
    price:        parseFloat($('e-price')?.value || 0),
    cost:         parseFloat($('e-cost')?.value || 0),
    stock:        parseInt($('e-stock')?.value || 0),
    min_stock:    parseInt($('e-minstock')?.value || 5),
    unit:         $('e-unit')?.value.trim() || 'Pièce',
    sku:          $('e-sku')?.value.trim() || null
  };
  if (!payload.name) { toast('Le nom est requis', 'error'); return; }
  const { error } = await db.from('products').update(payload).eq('id', id);
  if (error) { toast('Erreur: ' + error.message, 'error'); return; }
  toast('Produit mis à jour !', 'success');
  closeModal();
  await loadAll();
}

async function deleteProduct(id) {
  if (!confirm('Supprimer ce produit définitivement ?')) return;
  const { error } = await db.from('products').delete().eq('id', id);
  if (error) { toast('Erreur: ' + error.message, 'error'); return; }
  toast('Produit supprimé', 'warning');
  await loadAll();
}

// ============================================
// STOCK MOVEMENTS
// ============================================
function openAddStock(preId) {
  showModal(`
  <div class="modal-header"><h3>📥 Mouvement de stock</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
  <div class="modal-body">
    <div class="form-group"><label>Produit <span class="required-mark">*</span></label>
      <select id="s-prod">
        ${state.products.map(p => `<option value="${p.id}" ${p.id===preId?'selected':''}>${p.icon||'📦'} ${p.name} (stock: ${p.stock} ${p.unit})</option>`).join('')}
      </select>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Type <span class="required-mark">*</span></label>
        <select id="s-type">
          <option value="in">➕ Entrée (réapprovisionnement)</option>
          <option value="out">➖ Sortie (retour / perte)</option>
          <option value="adjustment">📋 Ajustement (inventaire)</option>
        </select>
      </div>
      <div class="form-group"><label>Quantité <span class="required-mark">*</span></label>
        <input id="s-qty" type="number" placeholder="0" min="1" />
      </div>
    </div>
    <div class="form-group"><label>Motif</label>
      <input id="s-reason" placeholder="Réapprovisionnement, retour fournisseur, inventaire..." />
    </div>
    <div class="form-group"><label>Coût unitaire (optionnel)</label>
      <input id="s-ucost" type="number" placeholder="0" min="0" step="any" />
    </div>
  </div>
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
    <button class="btn btn-primary" onclick="applyStock()">✅ Appliquer</button>
  </div>`);
}

async function applyStock() {
  const pid   = $('s-prod')?.value;
  const type  = $('s-type')?.value;
  const qty   = parseInt($('s-qty')?.value || 0);
  if (!qty || qty < 1) { toast('Quantité invalide', 'error'); return; }
  const p = state.products.find(x => x.id === pid);
  if (!p) return;
  let newStock = +p.stock;
  if (type === 'in')          newStock += qty;
  else if (type === 'out')    newStock = Math.max(0, newStock - qty);
  else                        newStock = qty;

  const { error: mvErr } = await db.from('stock_movements').insert({
    product_id: pid, type, quantity: qty,
    reason: $('s-reason')?.value.trim() || null,
    unit_cost: parseFloat($('s-ucost')?.value || 0) || null
  });
  const { error: prodErr } = await db.from('products').update({ stock: newStock }).eq('id', pid);
  if (mvErr || prodErr) { toast('Erreur lors de la mise à jour', 'error'); return; }
  toast(`Stock mis à jour: ${p.name} → ${newStock} ${p.unit}`, 'success');
  closeModal();
  await loadAll();
}

// ============================================
// SALES
// ============================================
function openAddSale() {
  const avail = state.products.filter(p => +p.stock > 0);
  if (!avail.length) { toast('Aucun produit disponible en stock', 'warning'); return; }
  showModal(`
  <div class="modal-header"><h3>💰 Nouvelle vente</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
  <div class="modal-body">
    <div class="form-row">
      <div class="form-group"><label>Client</label><input id="v-client" placeholder="Nom du client" /></div>
      <div class="form-group"><label>Date</label><input id="v-date" type="date" value="${now()}" /></div>
    </div>
    <div class="form-group"><label>Référence</label><input id="v-ref" placeholder="FAC-0001" /></div>
    <div class="divider"></div>
    <div id="sale-lines">
      ${saleLineHTML(avail, 0)}
    </div>
    <button class="btn btn-ghost btn-sm mt-8" onclick="addSaleLine()">+ Ajouter un article</button>
    <div class="divider"></div>
    <div class="sale-total-box">
      <div class="label">TOTAL</div>
      <div class="amount" id="v-total">0 ${state.settings.currency}</div>
    </div>
  </div>
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
    <button class="btn btn-success" onclick="addSale()">💰 Enregistrer la vente</button>
  </div>`, true);
  updateSaleTotal();
}

let saleLineCount = 0;
function saleLineHTML(avail, idx) {
  saleLineCount = Math.max(saleLineCount, idx + 1);
  return `<div id="sale-line-${idx}" style="display:grid;grid-template-columns:2fr 80px 120px auto;gap:8px;align-items:end;margin-bottom:8px">
    <div class="form-group" style="margin:0">
      ${idx===0?'<label>Produit</label>':''}
      <select id="vp-${idx}" onchange="setSaleLinePrice(${idx})">
        ${avail.map(p=>`<option value="${p.id}" data-price="${p.price}" data-stock="${p.stock}">${p.icon||'📦'} ${p.name}</option>`).join('')}
      </select>
    </div>
    <div class="form-group" style="margin:0">
      ${idx===0?'<label>Qté</label>':''}
      <input id="vq-${idx}" type="number" min="1" value="1" oninput="updateSaleTotal()" />
    </div>
    <div class="form-group" style="margin:0">
      ${idx===0?'<label>Prix unit.</label>':''}
      <input id="vu-${idx}" type="number" min="0" step="any" oninput="updateSaleTotal()" />
    </div>
    <button class="btn btn-ghost btn-icon btn-sm" ${idx===0?'style="margin-top:22px"':''} onclick="removeSaleLine(${idx})">✕</button>
  </div>`;
}

function addSaleLine() {
  const avail = state.products.filter(p => +p.stock > 0);
  const cont = $('sale-lines');
  if (!cont) return;
  const div = document.createElement('div');
  div.innerHTML = saleLineHTML(avail, saleLineCount);
  cont.appendChild(div.firstChild);
  setSaleLinePrice(saleLineCount - 1);
  updateSaleTotal();
}

function removeSaleLine(idx) {
  const el = $(`sale-line-${idx}`);
  if (el) el.remove();
  updateSaleTotal();
}

function setSaleLinePrice(idx) {
  const sel = $(`vp-${idx}`);
  if (!sel) return;
  const opt = sel.options[sel.selectedIndex];
  const priceEl = $(`vu-${idx}`);
  if (priceEl) priceEl.value = opt?.dataset?.price || 0;
  updateSaleTotal();
}

function updateSaleTotal() {
  let total = 0;
  for (let i = 0; i < saleLineCount; i++) {
    const q = parseFloat($(`vq-${i}`)?.value || 0);
    const u = parseFloat($(`vu-${i}`)?.value || 0);
    total += q * u;
  }
  const el = $('v-total');
  if (el) el.textContent = fmt(total) + ' ' + state.settings.currency;
}

async function addSale() {
  const lines = [];
  for (let i = 0; i < saleLineCount; i++) {
    const sel = $(`vp-${i}`);
    if (!sel || !sel.closest('#sale-lines') || !document.contains(sel)) continue; // removed lines
    if (!$(`sale-line-${i}`) || !document.contains($(`sale-line-${i}`))) continue;
    const pid = sel.value;
    const qty = parseInt($(`vq-${i}`)?.value || 0);
    const up  = parseFloat($(`vu-${i}`)?.value || 0);
    if (!pid || qty < 1 || !up) continue;
    const p = state.products.find(x => x.id === pid);
    if (!p) continue;
    if (+p.stock < qty) { toast(`Stock insuffisant: ${p.name} (dispo: ${p.stock})`, 'error'); return; }
    lines.push({ product: p, qty, up });
  }
  if (!lines.length) { toast('Aucun article valide', 'error'); return; }
  const total = lines.reduce((a, l) => a + l.qty * l.up, 0);
  const { data: saleData, error: sErr } = await db.from('sales').insert({
    sale_date: $('v-date')?.value || now(),
    client: $('v-client')?.value.trim() || 'Client anonyme',
    reference: $('v-ref')?.value.trim() || null,
    total
  }).select().single();
  if (sErr || !saleData) { toast('Erreur création vente: ' + (sErr?.message||'?'), 'error'); return; }
  const itemsPayload = lines.map(l => ({
    sale_id: saleData.id,
    product_id: l.product.id,
    product_name: l.product.name,
    quantity: l.qty,
    unit_price: l.up
  }));
  await db.from('sale_items').insert(itemsPayload);
  // Decrement stocks
  for (const l of lines) {
    await db.from('products').update({ stock: +l.product.stock - l.qty }).eq('id', l.product.id);
    await db.from('stock_movements').insert({ product_id: l.product.id, type: 'out', quantity: l.qty, reason: 'Vente ' + (saleData.reference || saleData.id) });
  }
  toast('Vente enregistrée avec succès !', 'success');
  closeModal();
  saleLineCount = 0;
  await loadAll();
}

async function deleteSale(id) {
  if (!confirm('Supprimer cette vente ?')) return;
  await db.from('sale_items').delete().eq('sale_id', id);
  await db.from('sales').delete().eq('id', id);
  toast('Vente supprimée', 'warning');
  await loadAll();
}

function viewSaleDetail(id) {
  const sale = state.sales.find(s => s.id === id);
  if (!sale) return;
  const items = state.saleItems.filter(i => i.sale_id === id);
  showModal(`
  <div class="modal-header"><h3>🧾 Détails vente</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
  <div class="modal-body">
    <div class="fin-row"><span class="label">Date</span><span class="value">${fmtDate(sale.sale_date)}</span></div>
    <div class="fin-row"><span class="label">Client</span><span class="value">${sale.client||'—'}</span></div>
    <div class="fin-row"><span class="label">Référence</span><span class="value">${sale.reference||'—'}</span></div>
    <div class="divider"></div>
    <table><thead><tr><th>Produit</th><th>Qté</th><th>Prix unit.</th><th>Total</th></tr></thead><tbody>
    ${items.map(i => `<tr>
      <td>${i.product_name}</td>
      <td>${i.quantity}</td>
      <td>${fmtCur(i.unit_price)}</td>
      <td class="text-green fw-bold">${fmtCur(i.total)}</td>
    </tr>`).join('')}
    </tbody></table>
    <div class="divider"></div>
    <div class="fin-row highlight"><span class="label" style="font-weight:700;color:var(--text)">TOTAL</span><span class="value">${fmtCur(sale.total)}</span></div>
  </div>
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="closeModal()">Fermer</button>
    <button class="export-btn export-pdf" onclick="exportSingleSalePDF('${id}')">📄 PDF</button>
  </div>`);
}

// ============================================
// CATEGORIES & SUPPLIERS
// ============================================
function openAddCategory() {
  showModal(`
  <div class="modal-header"><h3>🏷️ Nouvelle catégorie</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
  <div class="modal-body">
    <div class="form-row">
      <div class="form-group"><label>Icône</label><input id="nc-icon" value="📦" maxlength="4" /></div>
      <div class="form-group"><label>Nom <span class="required-mark">*</span></label><input id="nc-name" placeholder="Ex: Électronique" /></div>
    </div>
    <div class="form-group"><label>Couleur (hex)</label><input id="nc-color" type="color" value="#4A90E2" /></div>
  </div>
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
    <button class="btn btn-primary" onclick="addCategory()">Enregistrer</button>
  </div>`);
}

async function addCategory() {
  const name = $('nc-name')?.value.trim();
  if (!name) { toast('Nom requis', 'error'); return; }
  await db.from('categories').insert({ name, icon: $('nc-icon')?.value.trim()||'📦', color: $('nc-color')?.value||'#4A90E2' });
  toast('Catégorie ajoutée', 'success');
  closeModal();
  await loadAll();
}

function openAddSupplier() {
  showModal(`
  <div class="modal-header"><h3>🏭 Nouveau fournisseur</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
  <div class="modal-body">
    <div class="form-group"><label>Nom <span class="required-mark">*</span></label><input id="ns-name" placeholder="Nom du fournisseur" /></div>
    <div class="form-row">
      <div class="form-group"><label>Email</label><input id="ns-email" type="email" placeholder="email@exemple.com" /></div>
      <div class="form-group"><label>Téléphone</label><input id="ns-phone" placeholder="+221 XX XXX XXXX" /></div>
    </div>
    <div class="form-group"><label>Adresse</label><input id="ns-addr" placeholder="Adresse complète" /></div>
  </div>
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
    <button class="btn btn-primary" onclick="addSupplier()">Enregistrer</button>
  </div>`);
}

async function addSupplier() {
  const name = $('ns-name')?.value.trim();
  if (!name) { toast('Nom requis', 'error'); return; }
  await db.from('suppliers').insert({ name, email: $('ns-email')?.value.trim()||null, phone: $('ns-phone')?.value.trim()||null, address: $('ns-addr')?.value.trim()||null });
  toast('Fournisseur ajouté', 'success');
  closeModal();
  await loadAll();
}

async function deleteSupplier(id) {
  if (!confirm('Supprimer ce fournisseur ?')) return;
  await db.from('suppliers').delete().eq('id', id);
  toast('Fournisseur supprimé', 'warning');
  await loadAll();
}

// ============================================
// RESET
// ============================================
async function confirmReset() {
  if (!confirm('⚠️ Supprimer TOUS les produits et ventes ? Cette action est irréversible !')) return;
  await db.from('sale_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await db.from('sales').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await db.from('stock_movements').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await db.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  toast('Données réinitialisées', 'warning');
  await loadAll();
}

// ============================================
// EXPORTS – EXCEL
// ============================================
function exportProductsExcel() {
  const rows = state.products.map(p => ({
    'Nom': p.name, 'SKU': p.sku||'', 'Catégorie': p.category?.name||'', 'Fournisseur': p.supplier?.name||'',
    'Prix vente': +p.price, 'Coût achat': +p.cost, 'Stock': +p.stock, 'Stock min': +p.min_stock,
    'Unité': p.unit, 'Valeur stock': +p.cost * +p.stock,
    'Statut': +p.stock===0?'Rupture':+p.stock<=+p.min_stock?'Stock faible':'Normal'
  }));
  excelExport([{ name: 'Produits', data: rows }], 'StockFlow_Produits');
}

function exportStockExcel() {
  const rows = state.products.map(p => ({
    'Produit': p.name, 'Catégorie': p.category?.name||'', 'Stock': +p.stock, 'Minimum': +p.min_stock,
    'Fournisseur': p.supplier?.name||'', 'Coût unit.': +p.cost, 'Valeur': +p.cost * +p.stock,
    'Statut': +p.stock===0?'Rupture':+p.stock<=+p.min_stock?'Stock faible':'Normal'
  }));
  excelExport([{ name: 'Stock', data: rows }], 'StockFlow_Stock');
}

function exportSalesExcel() {
  const rows = state.sales.map(s => {
    const items = state.saleItems.filter(i => i.sale_id === s.id);
    return {
      'Date': s.sale_date, 'Référence': s.reference||'', 'Client': s.client||'',
      'Articles': items.length, 'Total': +s.total
    };
  });
  excelExport([{ name: 'Ventes', data: rows }], 'StockFlow_Ventes');
}

function exportFullReportExcel() {
  const prodRows = state.products.map(p => ({
    'Nom': p.name, 'SKU': p.sku||'', 'Catégorie': p.category?.name||'',
    'Prix vente': +p.price, 'Coût': +p.cost, 'Stock': +p.stock, 'Valeur': +p.cost * +p.stock,
    'Statut': +p.stock===0?'Rupture':+p.stock<=+p.min_stock?'Stock faible':'Normal'
  }));
  const saleRows = state.sales.map(s => ({
    'Date': s.sale_date, 'Client': s.client||'', 'Référence': s.reference||'', 'Total': +s.total
  }));
  const totalSales = state.sales.reduce((a,s)=>a+ +s.total,0);
  const margin = calcMargin();
  const summaryRows = [
    { 'Indicateur': 'Valeur totale stock', 'Valeur': state.products.reduce((a,p)=>a+ +p.cost * +p.stock,0) },
    { 'Indicateur': 'Chiffre d\'affaires', 'Valeur': totalSales },
    { 'Indicateur': 'Coût marchandises',  'Valeur': totalSales - margin },
    { 'Indicateur': 'Bénéfice brut',      'Valeur': margin },
    { 'Indicateur': 'Taux de marge',      'Valeur': totalSales>0?Math.round(margin/totalSales*100):0 },
    { 'Indicateur': 'Nb produits',         'Valeur': state.products.length },
    { 'Indicateur': 'Ruptures de stock',  'Valeur': state.products.filter(p=>+p.stock===0).length }
  ];
  excelExport([
    { name: 'Résumé', data: summaryRows },
    { name: 'Produits', data: prodRows },
    { name: 'Ventes', data: saleRows }
  ], 'StockFlow_Rapport_Complet');
}

function excelExport(sheets, filename) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(sh => {
    const ws = XLSX.utils.json_to_sheet(sh.data);
    // Auto column widths
    const cols = sh.data.length ? Object.keys(sh.data[0]).map(k => ({ wch: Math.max(k.length, 12) })) : [];
    ws['!cols'] = cols;
    XLSX.utils.book_append_sheet(wb, ws, sh.name);
  });
  XLSX.writeFile(wb, filename + '_' + now() + '.xlsx');
  toast('Export Excel téléchargé !', 'success');
}

// ============================================
// EXPORTS – PDF
// ============================================
function exportProductsPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape' });
  pdfHeader(doc, 'Rapport Produits');
  doc.autoTable({
    head: [['Produit','SKU','Catégorie','Prix vente','Coût','Stock','Valeur','Statut']],
    body: state.products.map(p => [
      p.name, p.sku||'—', p.category?.name||'—',
      fmtCur(p.price), fmtCur(p.cost), p.stock,
      fmtCur(+p.cost * +p.stock),
      +p.stock===0?'Rupture':+p.stock<=+p.min_stock?'Stock faible':'Normal'
    ]),
    startY: 38,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [74,144,226], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245,247,252] },
    columnStyles: { 7: { textColor: p => p.stock===0?[231,76,60]:p.stock<=p.min_stock?[243,156,18]:[46,204,113] } }
  });
  doc.save('StockFlow_Produits_' + now() + '.pdf');
  toast('Export PDF téléchargé !', 'success');
}

function exportStockPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape' });
  pdfHeader(doc, 'Rapport Stock');
  doc.autoTable({
    head: [['Produit','Catégorie','Stock actuel','Stock min','Fournisseur','Valeur','Statut']],
    body: state.products.map(p => [
      p.name, p.category?.name||'—', p.stock + ' ' + p.unit, p.min_stock,
      p.supplier?.name||'—', fmtCur(+p.cost * +p.stock),
      +p.stock===0?'Rupture':+p.stock<=+p.min_stock?'Stock faible':'Normal'
    ]),
    startY: 38,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [74,144,226], textColor: 255 },
    alternateRowStyles: { fillColor: [245,247,252] }
  });
  doc.save('StockFlow_Stock_' + now() + '.pdf');
  toast('Export PDF téléchargé !', 'success');
}

function exportSalesPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  pdfHeader(doc, 'Rapport Ventes');
  const total = state.sales.reduce((a,s)=>a+ +s.total,0);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text('Total: ' + fmtCur(total), 14, 34);
  doc.autoTable({
    head: [['Date','Référence','Client','Articles','Total']],
    body: state.sales.map(s => [
      fmtDate(s.sale_date), s.reference||'—', s.client||'—',
      state.saleItems.filter(i=>i.sale_id===s.id).length,
      fmtCur(s.total)
    ]),
    startY: 40,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [46,204,113], textColor: 255 },
    alternateRowStyles: { fillColor: [245,252,247] }
  });
  doc.save('StockFlow_Ventes_' + now() + '.pdf');
  toast('Export PDF téléchargé !', 'success');
}

function exportFullReportPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait' });
  pdfHeader(doc, 'Rapport Complet StockFlow');
  const totalSales = state.sales.reduce((a,s)=>a+ +s.total,0);
  const margin = calcMargin();
  const marginPct = totalSales>0?Math.round(margin/totalSales*100):0;
  const totalStock = state.products.reduce((a,p)=>a+ +p.cost * +p.stock,0);

  // Summary table
  doc.autoTable({
    head: [['Indicateur','Valeur']],
    body: [
      ['Valeur totale du stock', fmtCur(totalStock)],
      ['Chiffre d\'affaires', fmtCur(totalSales)],
      ['Coût des marchandises', fmtCur(totalSales - margin)],
      ['Bénéfice brut', fmtCur(margin)],
      ['Taux de marge', marginPct + '%'],
      ['Nombre de produits', state.products.length],
      ['Ruptures de stock', state.products.filter(p=>+p.stock===0).length],
      ['Nombre de ventes', state.sales.length]
    ],
    startY: 38,
    styles: { fontSize: 10 },
    headStyles: { fillColor: [74,144,226], textColor: 255 },
    columnStyles: { 1: { fontStyle: 'bold', textColor: [30,30,30] } }
  });

  // Products
  let y = doc.lastAutoTable.finalY + 12;
  doc.setFontSize(12); doc.setTextColor(30,30,30);
  doc.text('Détail des produits', 14, y);
  doc.autoTable({
    head: [['Produit','Stock','Valeur','Statut']],
    body: state.products.map(p => [
      p.name, p.stock + ' ' + p.unit, fmtCur(+p.cost * +p.stock),
      +p.stock===0?'Rupture':+p.stock<=+p.min_stock?'Stock faible':'Normal'
    ]),
    startY: y + 5,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [74,144,226], textColor: 255 },
    alternateRowStyles: { fillColor: [245,247,252] }
  });

  // Sales
  if (state.sales.length > 0) {
    doc.addPage();
    pdfHeader(doc, 'Historique des ventes');
    doc.autoTable({
      head: [['Date','Client','Référence','Total']],
      body: state.sales.map(s => [fmtDate(s.sale_date), s.client||'—', s.reference||'—', fmtCur(s.total)]),
      startY: 38,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [46,204,113], textColor: 255 },
      alternateRowStyles: { fillColor: [245,252,247] }
    });
  }

  doc.save('StockFlow_Rapport_' + now() + '.pdf');
  toast('Rapport PDF complet téléchargé !', 'success');
}

function exportSingleSalePDF(id) {
  const sale = state.sales.find(s => s.id === id);
  if (!sale) return;
  const items = state.saleItems.filter(i => i.sale_id === id);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  pdfHeader(doc, 'Facture / Bon de vente');
  doc.setFontSize(10); doc.setTextColor(80);
  doc.text(`Client: ${sale.client||'—'}`, 14, 36);
  doc.text(`Date: ${fmtDate(sale.sale_date)}`, 14, 42);
  if (sale.reference) doc.text(`Ref: ${sale.reference}`, 14, 48);
  doc.autoTable({
    head: [['Produit','Qté','Prix unit.','Total']],
    body: items.map(i => [i.product_name, i.quantity, fmtCur(i.unit_price), fmtCur(i.total)]),
    startY: sale.reference ? 55 : 50,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [74,144,226], textColor: 255 },
    foot: [['', '', 'TOTAL', fmtCur(sale.total)]],
    footStyles: { fontStyle: 'bold', fillColor: [245,247,252] }
  });
  doc.save('StockFlow_Vente_' + (sale.reference || id.slice(0,8)) + '.pdf');
  toast('Facture PDF téléchargée !', 'success');
}

function pdfHeader(doc, title) {
  doc.setFillColor(74, 144, 226);
  doc.rect(0, 0, 300, 22, 'F');
  doc.setTextColor(255);
  doc.setFontSize(14); doc.setFont('helvetica', 'bold');
  doc.text('📦 StockFlow', 14, 14);
  doc.setFontSize(11); doc.setFont('helvetica', 'normal');
  doc.text(title, 80, 14);
  doc.setFontSize(9);
  doc.text('Généré le ' + new Date().toLocaleDateString('fr-FR'), 150, 14);
  doc.setTextColor(30);
  const company = state.settings.company_name || 'Mon Entreprise';
  doc.setFontSize(8); doc.setTextColor(120);
  doc.text(company, 14, 28);
}

// ============================================
// REALTIME
// ============================================
function initRealtime() {
  db.channel('stockflow-changes')
    .on('postgres_changes', { event: '*', schema: 'public' }, () => loadAll())
    .subscribe();
}

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  // Close modal on background click already in HTML
  showLoading(true);
  await loadAll();
  initRealtime();
  // First sale line init
  saleLineCount = 0;
});
