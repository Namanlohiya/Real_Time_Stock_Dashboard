/* predictions.js — Signal card, trade setup, portfolio P&L, feature importance */
'use strict';

// ── AI Signal card ────────────────────────────────────────────────────────────
function renderSignal(data) {
  if (!data || data.error) return;
  const { signal, confidence, probabilities, features, metrics, feature_importance } = data;
  const sig  = (signal || 'HOLD').toUpperCase();
  const conf = parseFloat(confidence) || 0;

  // Badge + card glow
  const badge = document.getElementById('signalBadge');
  badge.textContent = sig;
  badge.className   = `signal-badge ${sig.toLowerCase()}`;
  document.getElementById('signalCard').className = `signal-card ${sig.toLowerCase()}`;

  // Confidence ring (SVG-safe setAttribute)
  document.getElementById('confPct').textContent = `${conf}%`;
  const fill = document.getElementById('ringFill');
  const circ = 2 * Math.PI * 40;
  fill.setAttribute('stroke-dasharray', `${((conf / 100) * circ).toFixed(2)} ${circ.toFixed(2)}`);
  fill.setAttribute('class', sig === 'BUY' ? 'ring-fill green-ring'
                            : sig === 'SELL' ? 'ring-fill red-ring' : 'ring-fill yellow-ring');

  // Probability bars
  const COLORS = { BUY: '#00e676', HOLD: '#ffd740', SELL: '#ff1744' };
  document.getElementById('probBars').innerHTML = ['BUY','HOLD','SELL'].map(s => {
    const pct = probabilities?.[s] != null ? +probabilities[s] : 0;
    return `<div class="prob-row">
      <span class="prob-label" style="color:${COLORS[s]}">${s}</span>
      <div class="prob-bar-bg"><div class="prob-bar-fill" style="width:${pct}%;background:${COLORS[s]}"></div></div>
      <span class="prob-val">${pct.toFixed(1)}%</span>
    </div>`;
  }).join('');

  // Key indicators
  if (features && Object.keys(features).length) {
    document.getElementById('keyIndicators').innerHTML = Object.entries(features).map(([k, v]) => {
      const n = parseFloat(v);
      let color = '#e8edf5';
      if (k === 'RSI (14)') color = n > 70 ? '#ff1744' : n < 30 ? '#00e676' : '#ffd740';
      if (k === 'Stoch K')  color = n > 80 ? '#ff1744' : n < 20 ? '#00e676' : '#e8edf5';
      return `<div class="ki-item"><div class="ki-name">${k}</div><div class="ki-value" style="color:${color}">${v}</div></div>`;
    }).join('');
  }

  // Model Metrics
  if (metrics && Object.keys(metrics).length) {
    const set = (id, val, sfx = '') => {
      const el = document.getElementById(id);
      if (el) el.textContent = val != null ? val + sfx : '—';
    };
    set('mAccuracy',  metrics.accuracy,  '%');
    set('mPrecision', metrics.precision, '%');
    set('mRecall',    metrics.recall,    '%');
    set('mF1',        metrics.f1,        '%');
    set('mTrain', metrics.train_samples != null ? Number(metrics.train_samples).toLocaleString() : null);
    set('mTest',  metrics.test_samples  != null ? Number(metrics.test_samples).toLocaleString()  : null);
  }

  // Feature importance
  if (feature_importance && Object.keys(feature_importance).length) {
    const vals = Object.values(feature_importance);
    const max  = Math.max(...vals) || 1;
    document.getElementById('featureList').innerHTML = Object.entries(feature_importance).map(([n, v]) => `
      <div class="feat-row">
        <span class="feat-name">${n}</span>
        <div class="feat-bar-bg"><div class="feat-bar-fill" style="width:${(v/max)*100}%"></div></div>
        <span class="feat-val">${(+v).toFixed(1)}%</span>
      </div>`).join('');
  }
}

// ── Trade Setup card ──────────────────────────────────────────────────────────
function renderTradeSetup(data) {
  if (!data || data.error) return;
  const { currency_symbol: cur = '$', signal, entry, tp1, tp2, stop_loss,
          support, resistance, risk_reward, expected_return } = data;

  const fmt = v => v != null
    ? `${cur}${(+v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : '—';
  const pct = (a, b) => b ? `${((a-b)/b*100).toFixed(1)}%` : '';

  document.getElementById('trEntry').textContent  = fmt(entry);
  document.getElementById('trTP1').textContent    = tp1
    ? `${fmt(tp1)}  (+${Math.abs(+pct(tp1,entry))})` : '—';
  document.getElementById('trTP2').textContent    = tp2
    ? `${fmt(tp2)}  (+${Math.abs(+pct(tp2,entry))})` : '—';
  document.getElementById('trSL').textContent     = stop_loss
    ? `${fmt(stop_loss)}  (${pct(stop_loss,entry)})` : '—';
  document.getElementById('trRR').textContent     = risk_reward != null ? `1 : ${risk_reward}` : '—';
  document.getElementById('trRet').textContent    = expected_return != null
    ? `${expected_return > 0 ? '+' : ''}${expected_return}%` : '—';
  document.getElementById('trSupport').textContent  = fmt(support);
  document.getElementById('trResist').textContent   = fmt(resistance);

  const retEl = document.getElementById('trRet');
  retEl.style.color = expected_return > 0 ? 'var(--green)' : expected_return < 0 ? 'var(--red)' : '';

  // Highlight recommended action button
  document.getElementById('buyBtn').classList.toggle('recommended',  signal === 'BUY');
  document.getElementById('sellBtn').classList.toggle('recommended', signal === 'SELL');

  window._currentTargets = data;
}

// ── Mini Signals grid ─────────────────────────────────────────────────────────
function renderMiniSignals(allPreds) {
  const el = document.getElementById('miniSignals');
  if (!el || !allPreds) return;
  el.innerHTML = Object.entries(allPreds).map(([ticker, d]) => `
    <div class="ms-item" onclick="selectTicker('${ticker}')">
      <div class="ms-sym">${ticker.replace('.NS','').replace('.BO','')}</div>
      <div class="ms-sig ${d.signal}">${d.signal} <small>${d.confidence}%</small></div>
    </div>`).join('');
}

// ── Paper Portfolio — realistic P&L ──────────────────────────────────────────
function renderPortfolio() {
  const trades   = JSON.parse(localStorage.getItem('sp_portfolio') || '[]');
  const listEl   = document.getElementById('portfolioList');
  const sumEl    = document.getElementById('pfSummary');
  const countEl  = document.getElementById('pfCount');
  const clearBtn = document.getElementById('clearBtn');

  countEl.textContent        = trades.length ? `(${trades.length})` : '';
  clearBtn.style.display     = trades.length ? '' : 'none';

  if (!trades.length) {
    listEl.innerHTML = '<p class="no-trades">No trades yet. Hit BUY or SELL above to track a position.</p>';
    sumEl.innerHTML  = '';
    return;
  }

  const cache   = window._liveQuotes || {};
  let usdPnl = 0, inrPnl = 0, usdInv = 0, inrInv = 0;

  listEl.innerHTML = trades.map((t, i) => {
    const q       = cache[t.ticker] || {};
    const qty     = t.qty || 1;
    const cur     = t.currency === 'INR' ? '₹' : '$';
    const entry   = +t.entry;
    const nowRaw  = q.price;
    const now     = (nowRaw && nowRaw > 0) ? nowRaw : null;   // null = unavailable

    const pnlPer  = now != null
      ? (t.action === 'BUY' ? now - entry : entry - now)
      : 0;
    const pnlTot  = pnlPer * qty;
    const pnlPct  = entry ? (pnlPer / entry * 100) : 0;
    const invested = entry * qty;
    const curVal   = now != null ? now * qty : null;

    if (t.currency === 'INR') { inrPnl += pnlTot; inrInv += invested; }
    else                      { usdPnl += pnlTot; usdInv += invested; }

    const pnlCol = pnlTot > 0 ? 'var(--green)' : pnlTot < 0 ? 'var(--red)' : 'var(--text-muted)';

    // Progress bar: SL ──── entry ──── now ──── TP1
    let progressBar = '';
    const tp1 = t.tp1, sl = t.stop_loss;
    if (now != null && tp1 && sl) {
      const lo   = Math.min(sl, tp1, entry, now);
      const hi   = Math.max(sl, tp1, entry, now);
      const rng  = hi - lo || 1;
      const toP  = v => ((v - lo) / rng * 100).toFixed(1);
      const slP  = toP(sl);
      const entP = toP(entry);
      const nowP = toP(now);
      const tp1P = toP(tp1);
      progressBar = `
        <div class="pf-bar-wrap">
          <div class="pf-bar-track">
            <div class="pf-bar-sl"   style="left:${slP}%"  title="Stop Loss ${cur}${(+sl).toFixed(2)}"></div>
            <div class="pf-bar-entry"style="left:${entP}%" title="Entry ${cur}${entry.toFixed(2)}"></div>
            <div class="pf-bar-now"  style="left:${nowP}%" title="Now ${cur}${now.toFixed(2)}"></div>
            <div class="pf-bar-tp1"  style="left:${tp1P}%" title="TP1 ${cur}${(+tp1).toFixed(2)}"></div>
            <div class="pf-bar-fill" style="left:${Math.min(entP,nowP)}%;width:${Math.abs(nowP-entP)}%;background:${pnlTot>=0?'rgba(0,230,118,0.3)':'rgba(255,23,68,0.3)'}"></div>
          </div>
          <div class="pf-bar-labs">
            <span class="red-text">SL ${cur}${(+sl).toFixed(0)}</span>
            <span style="color:var(--text-muted)">Entry ${cur}${entry.toFixed(0)}</span>
            ${now ? `<span style="color:var(--accent)">Now ${cur}${now.toFixed(0)}</span>` : ''}
            <span class="green-text">TP1 ${cur}${(+tp1).toFixed(0)}</span>
          </div>
        </div>`;
    }

    return `<div class="pf-trade-card">
      <div class="pf-tc-header">
        <div class="pf-tc-left">
          <span class="pf-sig ${t.action.toLowerCase()}">${t.action}</span>
          <span class="pf-sym">${t.ticker.replace('.NS','').replace('.BO','')}</span>
          <span class="pf-qty">×${qty}</span>
          <span class="pf-ts">${new Date(t.timestamp).toLocaleDateString('en-IN',{month:'short',day:'numeric'})}</span>
        </div>
        <div class="pf-tc-right">
          <span class="pf-pnl" style="color:${pnlCol}">
            ${pnlTot >= 0 ? '+' : '−'}${cur}${Math.abs(pnlTot).toLocaleString(undefined,{maximumFractionDigits:2})}
          </span>
          <button class="pf-remove" onclick="removeTrade(${i})" title="Remove">✕</button>
        </div>
      </div>
      <div class="pf-tc-detail">
        <div class="pf-detail-item"><span>Entry</span><b>${cur}${entry.toLocaleString(undefined,{maximumFractionDigits:2})}</b></div>
        <div class="pf-detail-item"><span>Now</span><b style="color:${pnlCol}">${now != null ? cur + now.toLocaleString(undefined,{maximumFractionDigits:2}) : '⋯'}</b></div>
        <div class="pf-detail-item"><span>P&L %</span><b style="color:${pnlCol}">${pnlTot>=0?'+':''}${pnlPct.toFixed(2)}%</b></div>
        <div class="pf-detail-item"><span>Invested</span><b>${cur}${invested.toLocaleString(undefined,{maximumFractionDigits:0})}</b></div>
        ${curVal != null ? `<div class="pf-detail-item"><span>Current Val</span><b>${cur}${curVal.toLocaleString(undefined,{maximumFractionDigits:0})}</b></div>` : ''}
        ${t.tp1 ? `<div class="pf-detail-item"><span>TP1</span><b class="green-text">${cur}${(+t.tp1).toLocaleString(undefined,{maximumFractionDigits:2})}</b></div>` : ''}
        ${t.stop_loss ? `<div class="pf-detail-item"><span>Stop Loss</span><b class="red-text">${cur}${(+t.stop_loss).toLocaleString(undefined,{maximumFractionDigits:2})}</b></div>` : ''}
      </div>
      ${progressBar}
    </div>`;
  }).join('');

  // Summary by currency
  let sumHtml = '';
  if (usdInv > 0) sumHtml += `
    <div class="pf-sum-row">
      <span>USD P&amp;L</span>
      <div>
        <b style="color:${usdPnl>=0?'var(--green)':'var(--red)'}">${usdPnl>=0?'+':''}$${usdPnl.toFixed(2)}</b>
        <small style="color:var(--text-muted);margin-left:6px">(inv $${usdInv.toFixed(0)})</small>
      </div>
    </div>`;
  if (inrInv > 0) sumHtml += `
    <div class="pf-sum-row">
      <span>INR P&amp;L</span>
      <div>
        <b style="color:${inrPnl>=0?'var(--green)':'var(--red)'}">${inrPnl>=0?'+':''}₹${inrPnl.toFixed(2)}</b>
        <small style="color:var(--text-muted);margin-left:6px">(inv ₹${inrInv.toFixed(0)})</small>
      </div>
    </div>`;
  sumEl.innerHTML = sumHtml;
}

window.renderSignal      = renderSignal;
window.renderTradeSetup  = renderTradeSetup;
window.renderMiniSignals = renderMiniSignals;
window.renderPortfolio   = renderPortfolio;
