/* charts.js — TradingView Lightweight Charts with 6 chart types + intraday */
'use strict';

let mainChart, volChart;
let candleSeries, haSeries, lineSeries, areaSeries, barSeries, baselineSeries, volumeSeries;

let currentChartType = 'candlestick';
let currentTicker    = 'AAPL';
// preset → {period, interval}
const PRESETS = {
  '5m':  { period: '1d',  interval: '5m'  },
  '15m': { period: '5d',  interval: '15m' },
  '1H':  { period: '1mo', interval: '60m' },
  '1M':  { period: '1mo', interval: '1d'  },
  '3M':  { period: '3mo', interval: '1d'  },
  '6M':  { period: '6mo', interval: '1d'  },
  '1Y':  { period: '1y',  interval: '1d'  },
  '2Y':  { period: '2y',  interval: '1wk' },
  '5Y':  { period: '5y',  interval: '1wk' },
};
let currentPreset = '1M';

// ── Heikin-Ashi computation ───────────────────────────────────────────────────
function toHeikinAshi(data) {
  const ha = [];
  for (let i = 0; i < data.length; i++) {
    const d       = data[i];
    const haClose = (d.open + d.high + d.low + d.close) / 4;
    const haOpen  = i === 0
      ? (d.open + d.close) / 2
      : (ha[i-1].open + ha[i-1].close) / 2;
    ha.push({
      time:  d.time,
      open:  +haOpen.toFixed(4),
      high:  +Math.max(d.high,  haOpen, haClose).toFixed(4),
      low:   +Math.min(d.low,   haOpen, haClose).toFixed(4),
      close: +haClose.toFixed(4),
    });
  }
  return ha;
}

// ── Chart init ────────────────────────────────────────────────────────────────
function initCharts() {
  const chartEl  = document.getElementById('chartContainer');
  const volumeEl = document.getElementById('volumeContainer');

  const baseOpts = {
    layout:          { background: { color: 'transparent' }, textColor: 'rgba(232,237,245,0.6)' },
    grid:            { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
    crosshair:       { mode: LightweightCharts.CrosshairMode.Normal },
    rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
    timeScale:       { borderColor: 'rgba(255,255,255,0.08)', timeVisible: true, secondsVisible: false },
  };

  mainChart = LightweightCharts.createChart(chartEl, {
    ...baseOpts,
    width:  chartEl.offsetWidth,
    height: chartEl.offsetHeight || 380,
  });

  // ── All series (hidden except candlestick) ──────────────────────────────
  candleSeries = mainChart.addCandlestickSeries({
    upColor: '#00e676', downColor: '#ff1744',
    borderUpColor: '#00e676', borderDownColor: '#ff1744',
    wickUpColor: '#00e676', wickDownColor: '#ff1744',
  });

  haSeries = mainChart.addCandlestickSeries({
    upColor: '#26a69a', downColor: '#ef5350',
    borderUpColor: '#26a69a', borderDownColor: '#ef5350',
    wickUpColor: '#26a69a', wickDownColor: '#ef5350',
  });
  haSeries.applyOptions({ visible: false });

  lineSeries = mainChart.addLineSeries({
    color: '#4fc3f7', lineWidth: 2,
    crosshairMarkerVisible: true, priceLineVisible: false,
  });
  lineSeries.applyOptions({ visible: false });

  areaSeries = mainChart.addAreaSeries({
    topColor:    'rgba(79,195,247,0.4)',
    bottomColor: 'rgba(79,195,247,0.0)',
    lineColor:   '#4fc3f7',
    lineWidth:   2,
  });
  areaSeries.applyOptions({ visible: false });

  barSeries = mainChart.addBarSeries({
    upColor:   '#00e676',
    downColor: '#ff1744',
  });
  barSeries.applyOptions({ visible: false });

  baselineSeries = mainChart.addBaselineSeries({
    baseValue:          { type: 'price', price: 0 },
    topLineColor:       '#00e676',
    topFillColor1:      'rgba(0,230,118,0.28)',
    topFillColor2:      'rgba(0,230,118,0.05)',
    bottomLineColor:    '#ff1744',
    bottomFillColor1:   'rgba(255,23,68,0.05)',
    bottomFillColor2:   'rgba(255,23,68,0.28)',
  });
  baselineSeries.applyOptions({ visible: false });

  // ── Volume chart ────────────────────────────────────────────────────────
  volChart = LightweightCharts.createChart(volumeEl, {
    ...baseOpts,
    width:  volumeEl.offsetWidth,
    height: volumeEl.offsetHeight || 80,
  });
  volumeSeries = volChart.addHistogramSeries({
    priceFormat:  { type: 'volume' },
    priceScaleId: '',
    scaleMargins: { top: 0.1, bottom: 0 },
  });

  // ── Crosshair OHLCV tooltip ─────────────────────────────────────────────
  mainChart.subscribeCrosshairMove(param => {
    if (!param.time || !window._chartData) return;
    const raw = window._chartData.find(r => r.time === param.time);
    if (raw) updateOHLCV(raw);
  });

  // ── Responsive resize ───────────────────────────────────────────────────
  new ResizeObserver(() => {
    mainChart.applyOptions({ width: chartEl.offsetWidth, height: chartEl.offsetHeight || 380 });
    volChart.applyOptions({  width: volumeEl.offsetWidth });
  }).observe(chartEl);
}

// ── Load chart data ───────────────────────────────────────────────────────────
function loadChartData(ticker, preset) {
  currentTicker = ticker;
  currentPreset = preset || currentPreset;
  const { period, interval } = PRESETS[currentPreset] || PRESETS['1M'];

  fetch(`/api/chart/${ticker}?period=${period}&interval=${interval}`)
    .then(r => r.json())
    .then(data => {
      if (!Array.isArray(data) || !data.length) return;
      window._chartData = data;

      const candles = data.map(d => ({ time: d.time, open: d.open, high: d.high, low: d.low, close: d.close }));
      const ha      = toHeikinAshi(candles);
      const lines   = data.map(d => ({ time: d.time, value: d.close }));
      const bars    = candles;
      const vols    = data.map(d => ({
        time: d.time, value: d.volume,
        color: d.close >= d.open ? 'rgba(0,230,118,0.4)' : 'rgba(255,23,68,0.4)',
      }));

      // Baseline: use first close as base
      const basePrice = data[0].close;
      baselineSeries.applyOptions({ baseValue: { type: 'price', price: basePrice } });

      candleSeries.setData(candles);
      haSeries.setData(ha);
      lineSeries.setData(lines);
      areaSeries.setData(lines);
      barSeries.setData(bars);
      baselineSeries.setData(lines);
      volumeSeries.setData(vols);

      mainChart.timeScale().fitContent();
      const last = data[data.length - 1];
      if (last) updateOHLCV(last);
    })
    .catch(err => console.error('[charts]', err));
}

// ── Chart type switch ─────────────────────────────────────────────────────────
const ALL_SERIES = () => [
  { key: 'candlestick', s: candleSeries },
  { key: 'heikin_ashi', s: haSeries    },
  { key: 'line',        s: lineSeries  },
  { key: 'area',        s: areaSeries  },
  { key: 'bar',         s: barSeries   },
  { key: 'baseline',    s: baselineSeries },
];

function setChartType(type) {
  currentChartType = type;
  ALL_SERIES().forEach(({ key, s }) => s.applyOptions({ visible: key === type }));
  document.querySelectorAll('.ctype-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`ct-${type}`);
  if (btn) btn.classList.add('active');
}

// ── Period preset switch ──────────────────────────────────────────────────────
function setPreset(btnEl, preset) {
  currentPreset = preset;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  loadChartData(currentTicker, preset);
}

// ── OHLCV bar update ──────────────────────────────────────────────────────────
function updateOHLCV(row) {
  const fmt = v => typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—';
  document.getElementById('oVal').textContent = fmt(row.open);
  document.getElementById('hVal').textContent = fmt(row.high);
  document.getElementById('lVal').textContent = fmt(row.low);
  document.getElementById('cVal').textContent = fmt(row.close);
  document.getElementById('vVal').textContent = row.volume ? (row.volume / 1e6).toFixed(2) + 'M' : '—';
}

window.setChartType = setChartType;
window.setPreset    = setPreset;
window.loadChartData = loadChartData;
