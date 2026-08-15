/* dashboard.js — Main controller */
'use strict';

const API = '';
let allTickers    = { us: [], india: [], all: [], names: {} };
let liveQuotes    = {};
let currentFilter = 'us';
let activeTicker  = 'AAPL';
let refreshTimer  = 60;

// ── Bootstrap ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initCharts();
  updateClock();
  setInterval(updateClock, 1000);
  setInterval(tickRefreshCountdown, 1000);

  setLoading('Fetching ticker list…');
  allTickers = await fetchJSON('/api/tickers');

  setLoading('Loading live quotes…');
  liveQuotes = await fetchJSON('/api/quotes');
  window._liveQuotes = liveQuotes;

  buildWatchlist();
  buildTickerTape();
  buildSearch();
  renderPortfolio();

  await selectTicker('AAPL');
  startSSE();
  loadAllPredictions();
  hideLoading();
});

// ── Select ticker ─────────────────────────────────────────────────────────────
async function selectTicker(ticker) {
  activeTicker = ticker;
  document.querySelectorAll('.watch-item').forEach(el =>
    el.classList.toggle('active', el.dataset.ticker === ticker));

  updateStockHeader(ticker);
  loadChartData(ticker, currentPreset);
  document.getElementById('signalTicker').textContent = ticker.replace('.NS','').replace('.BO','');

  const [pred, targets] = await Promise.all([
    fetchJSON(`/api/predict/${ticker}`),
    fetchJSON(`/api/targets/${ticker}`)
  ]);

  renderSignal(pred);
  renderTradeSetup(targets);
}

// ── Stock header ──────────────────────────────────────────────────────────────
function updateStockHeader(ticker) {
  const q   = liveQuotes[ticker] || {};
  const cur = q.currency === 'INR' ? '₹' : '$';
  document.getElementById('headerTicker').textContent  = ticker.replace('.NS','').replace('.BO','');
  document.getElementById('headerName').textContent    = allTickers.names[ticker] || ticker;
  document.getElementById('exchangeBadge').textContent = ticker.includes('.NS') ? 'NSE'
                                                       : ticker.includes('.BO') ? 'BSE' : 'NASDAQ';
  const price = q.price || 0;
  document.getElementById('headerPrice').textContent   = `${cur}${price.toLocaleString(undefined,{maximumFractionDigits:2})}`;
  const chgEl = document.getElementById('headerChange');
  const chg   = q.change     || 0;
  const chgP  = q.change_pct || 0;
  chgEl.textContent = `${chg >= 0 ? '+' : ''}${chg.toFixed(2)} (${chgP >= 0 ? '+' : ''}${chgP.toFixed(2)}%)`;
  chgEl.className   = `price-change ${chg >= 0 ? 'up' : 'down'}`;
}

// ── Watchlist ─────────────────────────────────────────────────────────────────
function buildWatchlist() {
  const el   = document.getElementById('watchlist');
  const list = currentFilter === 'us'  ? allTickers.us
             : currentFilter === 'in'  ? allTickers.india
             : allTickers.all;
  el.innerHTML = list.map(ticker => {
    const q   = liveQuotes[ticker] || {};
    const cur = q.currency === 'INR' ? '₹' : '$';
    const up  = (q.change_pct || 0) >= 0;
    return `<div class="watch-item ${ticker === activeTicker ? 'active' : ''}"
               data-ticker="${ticker}" onclick="selectTicker('${ticker}')">
      <div class="wi-left">
        <div class="wi-sym">${ticker.replace('.NS','').replace('.BO','')}</div>
        <div class="wi-name">${(allTickers.names[ticker] || '').substring(0,18)}</div>
      </div>
      <div class="wi-right">
        <div class="wi-price">${cur}${(q.price||0).toLocaleString(undefined,{maximumFractionDigits:2})}</div>
        <div class="wi-chg ${up?'up':'down'}">${up?'▲':'▼'} ${Math.abs(q.change_pct||0).toFixed(2)}%</div>
      </div>
    </div>`;
  }).join('');
}

function filterWatchlist(filter) {
  currentFilter = filter;
  ['tabUS','tabIN','tabAll'].forEach(id => document.getElementById(id)?.classList.remove('active'));
  const map = { us:'tabUS', in:'tabIN', all:'tabAll' };
  document.getElementById(map[filter])?.classList.add('active');
  buildWatchlist();
}

// ── Ticker tape ───────────────────────────────────────────────────────────────
function buildTickerTape() {
  const items = allTickers.all.map(t => {
    const q   = liveQuotes[t] || {};
    const cur = q.currency === 'INR' ? '₹' : '$';
    const up  = (q.change_pct || 0) >= 0;
    return `<span class="tape-item" onclick="selectTicker('${t}')">
      <span class="tape-sym">${t.replace('.NS','')}</span>
      <span class="tape-price ${up?'up':'down'}">${cur}${(q.price||0).toLocaleString(undefined,{maximumFractionDigits:2})}</span>
      <span class="tape-chg  ${up?'up':'down'}">${up?'▲':'▼'}${Math.abs(q.change_pct||0).toFixed(2)}%</span>
    </span>`;
  }).join('');
  document.getElementById('tapeInner').innerHTML = items + items;
}

// ── SSE live updates ──────────────────────────────────────────────────────────
function startSSE() {
  try {
    const es = new EventSource('/api/stream');
    es.onmessage = e => {
      try {
        liveQuotes = JSON.parse(e.data);
        window._liveQuotes = liveQuotes;
        buildWatchlist();
        buildTickerTape();
        updateStockHeader(activeTicker);
        renderPortfolio();          // live P&L refresh
        refreshTimer = 60;
      } catch (_) {}
    };
    es.onerror = () => setTimeout(pollQuotes, 60000);
  } catch (_) { setTimeout(pollQuotes, 60000); }
}

async function pollQuotes() {
  liveQuotes = await fetchJSON('/api/quotes');
  window._liveQuotes = liveQuotes;
  buildWatchlist(); buildTickerTape(); updateStockHeader(activeTicker); renderPortfolio();
  setTimeout(pollQuotes, 60000);
}

// ── All predictions (mini signals) ───────────────────────────────────────────
async function loadAllPredictions() {
  const preds = await fetchJSON('/api/predict/all').catch(() => ({}));
  renderMiniSignals(preds);
}

// ── Search ────────────────────────────────────────────────────────────────────
function buildSearch() {
  const input    = document.getElementById('searchInput');
  const dropdown = document.getElementById('searchDropdown');
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { dropdown.style.display = 'none'; return; }
    const matches = allTickers.all.filter(t =>
      t.toLowerCase().includes(q) || (allTickers.names[t]||'').toLowerCase().includes(q)
    ).slice(0, 8);
    if (!matches.length) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = matches.map(t => `
      <div class="search-item" onclick="pickSearch('${t}')">
        <span class="si-ticker">${t}</span>
        <span class="si-name">${allTickers.names[t]||''}</span>
      </div>`).join('');
    dropdown.style.display = 'block';
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrapper')) dropdown.style.display = 'none';
  });
}
function pickSearch(ticker) {
  document.getElementById('searchInput').value = '';
  document.getElementById('searchDropdown').style.display = 'none';
  selectTicker(ticker);
}

// ── Paper Portfolio — BUY / SELL ──────────────────────────────────────────────
// Step 1: Show confirmation modal with qty input
function executeTrade(action) {
  const q       = liveQuotes[activeTicker] || {};
  const price   = q.price || 0;
  const targets = window._currentTargets || {};
  const cur     = q.currency === 'INR' ? '₹' : '$';

  if (!price) {
    _showInfo('No Price Data', '<p style="color:var(--text-muted)">Live price unavailable right now (market may be closed). Try again later.</p>');
    return;
  }

  const tp1Str = targets.tp1
    ? `<b class="green-text">${cur}${(+targets.tp1).toLocaleString(undefined,{maximumFractionDigits:2})} (+${Math.abs(((targets.tp1-price)/price*100)).toFixed(1)}%)</b>`
    : '<b>—</b>';
  const slStr  = targets.stop_loss
    ? `<b class="red-text">${cur}${(+targets.stop_loss).toLocaleString(undefined,{maximumFractionDigits:2})} (${((targets.stop_loss-price)/price*100).toFixed(1)}%)</b>`
    : '<b>—</b>';
  const rrStr  = targets.risk_reward ? `1 : ${targets.risk_reward}` : '—';

  document.getElementById('modalTitle').textContent = `${action} ${activeTicker.replace('.NS','')}`;
  document.getElementById('modalBody').innerHTML = `
    <div class="modal-trade-summary">
      <div class="mts-row"><span>Action</span><b class="${action.toLowerCase()}-text" style="font-size:16px;letter-spacing:2px">${action}</b></div>
      <div class="mts-row"><span>Current Price</span><b>${cur}${price.toLocaleString(undefined,{maximumFractionDigits:2})}</b></div>
      <div class="mts-row"><span>Take Profit 1</span>${tp1Str}</div>
      <div class="mts-row"><span>Stop Loss</span>${slStr}</div>
      <div class="mts-row"><span>Risk / Reward</span><b class="accent-text">${rrStr}</b></div>
    </div>
    <div class="modal-qty-section">
      <div class="qty-row">
        <label class="qty-label">Quantity (shares)</label>
        <div class="qty-controls">
          <button class="qty-btn" onclick="changeQty(-1)">−</button>
          <input type="number" id="tradeQty" class="qty-input" value="1" min="1" step="1" oninput="updateQtyPreview()"/>
          <button class="qty-btn" onclick="changeQty(1)">+</button>
        </div>
      </div>
      <div class="qty-preview-box">
        <div class="qpb-row"><span>Total Investment</span><b id="qtyInvest">${cur}${price.toLocaleString(undefined,{maximumFractionDigits:2})}</b></div>
        <div class="qpb-row green-text"><span>If hits TP1</span><b id="qtyProfit">—</b></div>
        <div class="qpb-row red-text"><span>If hits SL</span><b id="qtyLoss">—</b></div>
      </div>
    </div>`;

  // Store context for confirm
  window._pendingTrade = { action, price, currency: q.currency, targets, cur };
  updateQtyPreview();

  const okBtn = document.getElementById('modalOk');
  okBtn.textContent = `Confirm ${action}`;
  okBtn.className   = `modal-ok ${action === 'BUY' ? 'ok-buy' : 'ok-sell'}`;
  okBtn.onclick     = confirmTrade;

  document.getElementById('modalOverlay').style.display = 'flex';
}

function changeQty(delta) {
  const el  = document.getElementById('tradeQty');
  el.value  = Math.max(1, (parseInt(el.value) || 1) + delta);
  updateQtyPreview();
}

function updateQtyPreview() {
  const p    = window._pendingTrade || {};
  const qty  = Math.max(1, parseInt(document.getElementById('tradeQty')?.value) || 1);
  const price = p.price || 0;
  const cur   = p.cur || '$';
  const t     = p.targets || {};

  const invest  = qty * price;
  const profitTP = t.tp1    ? (p.action === 'BUY' ? (t.tp1 - price) * qty : (price - t.tp1) * qty) : null;
  const lossSL   = t.stop_loss ? (p.action === 'BUY' ? (t.stop_loss - price) * qty : (price - t.stop_loss) * qty) : null;

  const fmt = v => `${cur}${Math.abs(v).toLocaleString(undefined,{maximumFractionDigits:2})}`;

  document.getElementById('qtyInvest').textContent = fmt(invest);
  document.getElementById('qtyProfit').textContent = profitTP != null
    ? `+${fmt(profitTP)} (+${Math.abs((profitTP/invest)*100).toFixed(1)}%)` : '—';
  document.getElementById('qtyLoss').textContent   = lossSL != null
    ? `-${fmt(Math.abs(lossSL))} (${((lossSL/invest)*100).toFixed(1)}%)` : '—';
}

// Step 2: Confirm and save trade
function confirmTrade() {
  const p   = window._pendingTrade || {};
  const qty = Math.max(1, parseInt(document.getElementById('tradeQty')?.value) || 1);

  const trade = {
    ticker:    activeTicker,
    action:    p.action,
    entry:     p.price,
    qty,
    tp1:       p.targets?.tp1,
    tp2:       p.targets?.tp2,
    stop_loss: p.targets?.stop_loss,
    currency:  p.currency,
    timestamp: Date.now(),
  };

  const portfolio = JSON.parse(localStorage.getItem('sp_portfolio') || '[]');
  portfolio.push(trade);
  localStorage.setItem('sp_portfolio', JSON.stringify(portfolio));

  closeModal();
  renderPortfolio();
  showToast(`✅ ${p.action} ×${qty} ${activeTicker.replace('.NS','')} @ ${p.cur}${(+p.price).toLocaleString(undefined,{maximumFractionDigits:2})}`);
}

function removeTrade(index) {
  const portfolio = JSON.parse(localStorage.getItem('sp_portfolio') || '[]');
  portfolio.splice(index, 1);
  localStorage.setItem('sp_portfolio', JSON.stringify(portfolio));
  renderPortfolio();
}

function clearPortfolio() {
  if (!confirm('Clear all paper trades?')) return;
  localStorage.removeItem('sp_portfolio');
  renderPortfolio();
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function _showInfo(title, bodyHtml) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML    = bodyHtml;
  const okBtn = document.getElementById('modalOk');
  okBtn.textContent = 'OK';
  okBtn.className   = 'modal-ok';
  okBtn.onclick     = closeModal;
  document.getElementById('modalOverlay').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
  window._pendingTrade = null;
}

// ── Toast notification ────────────────────────────────────────────────────────
function showToast(msg) {
  const el = document.createElement('div');
  el.className   = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('visible'));
  setTimeout(() => {
    el.classList.remove('visible');
    setTimeout(() => el.remove(), 400);
  }, 3500);
}

// ── Clock / Countdown ─────────────────────────────────────────────────────────
function updateClock() {
  document.getElementById('timeDisplay').textContent =
    new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
}
function tickRefreshCountdown() {
  refreshTimer = Math.max(0, refreshTimer - 1);
  document.getElementById('refreshCountdown').textContent = `${refreshTimer}s`;
  if (refreshTimer === 0) refreshTimer = 60;
}

// ── Loading overlay ───────────────────────────────────────────────────────────
function setLoading(msg) {
  document.getElementById('loadingText').textContent = msg;
  document.getElementById('loadingOverlay').classList.remove('hidden');
}
function hideLoading() {
  document.getElementById('loadingOverlay').classList.add('hidden');
}

// ── Fetch helper ──────────────────────────────────────────────────────────────
async function fetchJSON(url) {
  try {
    const r = await fetch(API + url);
    return r.ok ? r.json() : {};
  } catch (_) { return {}; }
}

// ── Expose globals ────────────────────────────────────────────────────────────
window.selectTicker    = selectTicker;
window.filterWatchlist = filterWatchlist;
window.pickSearch      = pickSearch;
window.executeTrade    = executeTrade;
window.changeQty       = changeQty;
window.updateQtyPreview= updateQtyPreview;
window.confirmTrade    = confirmTrade;
window.removeTrade     = removeTrade;
window.clearPortfolio  = clearPortfolio;
window.closeModal      = closeModal;
window.showToast       = showToast;
