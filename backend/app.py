"""
app.py — Flask REST API for the Stock Market Dashboard
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

import json, time, threading
import pandas as pd
from flask import Flask, jsonify, Response, send_from_directory, request
from flask_cors import CORS

from data_fetcher import (ALL_TICKERS, US_TICKERS, IN_TICKERS,
                           TICKER_NAMES, get_chart_data, fetch_live_quote,
                           fetch_historical)
from model import StockPredictor
from scheduler import start_scheduler, get_live_cache

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'frontend')
app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='')
CORS(app)

_predictors: dict = {}
_pred_lock  = threading.Lock()

def _get_predictor(ticker: str) -> StockPredictor:
    with _pred_lock:
        if ticker not in _predictors:
            p = StockPredictor(ticker)
            p.load()
            _predictors[ticker] = p
        return _predictors[ticker]

# ── ATR helper (inline, no extra import) ─────────────────────────────────────
def _atr_series(high, low, close, period=14):
    tr = pd.concat([high - low,
                    (high - close.shift()).abs(),
                    (low  - close.shift()).abs()], axis=1).max(axis=1)
    return tr.rolling(period).mean()

# ── Static frontend ───────────────────────────────────────────────────────────
@app.route('/')
def index():
    return send_from_directory(FRONTEND_DIR, 'index.html')

# ── Tickers ───────────────────────────────────────────────────────────────────
@app.route('/api/tickers')
def api_tickers():
    return jsonify({'us': US_TICKERS, 'india': IN_TICKERS,
                    'all': ALL_TICKERS, 'names': TICKER_NAMES})

# ── Quotes ────────────────────────────────────────────────────────────────────
@app.route('/api/quote/<ticker>')
def api_quote(ticker):
    cache = get_live_cache()
    t = ticker.upper()
    return jsonify(cache[t] if t in cache else fetch_live_quote(t))

@app.route('/api/quotes')
def api_quotes_all():
    return jsonify(get_live_cache())

# ── Chart data (supports interval param: 5m, 15m, 60m, 1d, 1wk) ──────────────
@app.route('/api/chart/<ticker>')
def api_chart(ticker):
    period   = request.args.get('period',   '6mo')
    interval = request.args.get('interval', '1d')
    data = get_chart_data(ticker.upper(), period=period, interval=interval)
    return jsonify(data)

# ── Trade Targets (entry / TP / SL / R:R) ────────────────────────────────────
@app.route('/api/targets/<ticker>')
def api_targets(ticker):
    ticker = ticker.upper()
    try:
        df = fetch_historical(ticker, period='3mo', interval='1d')
        if df is None or df.empty:
            return jsonify({'error': 'No data'}), 404

        close = df['close']
        high  = df['high']
        low   = df['low']

        current_price = float(close.iloc[-1])
        atr_s         = _atr_series(high, low, close, 14)
        atr           = float(atr_s.iloc[-1]) if not atr_s.empty else current_price * 0.02

        support    = float(low.rolling(20).min().iloc[-1])
        resistance = float(high.rolling(20).max().iloc[-1])

        pred   = _get_predictor(ticker).predict()
        signal = pred['signal'] if pred else 'HOLD'
        cur    = '₹' if '.NS' in ticker else '$'

        if signal == 'BUY':
            entry     = current_price
            stop_loss = round(entry - 1.5 * atr, 2)
            tp1       = round(entry + 2.0 * atr, 2)
            tp2       = round(entry + 4.0 * atr, 2)
            risk      = entry - stop_loss
            reward    = tp1 - entry
            exp_ret   = round((tp1 - entry) / entry * 100, 2)
        elif signal == 'SELL':
            entry     = current_price
            stop_loss = round(entry + 1.5 * atr, 2)
            tp1       = round(entry - 2.0 * atr, 2)
            tp2       = round(entry - 4.0 * atr, 2)
            risk      = stop_loss - entry
            reward    = entry - tp1
            exp_ret   = round((entry - tp1) / entry * 100, 2)
        else:  # HOLD
            entry     = current_price
            stop_loss = round(entry - 1.5 * atr, 2)
            tp1       = round(entry + 2.0 * atr, 2)
            tp2       = round(resistance, 2)
            risk      = entry - stop_loss
            reward    = tp1 - entry
            exp_ret   = round((tp1 - entry) / entry * 100, 2)

        rr = round(reward / risk, 1) if risk > 0 else 0

        return jsonify({
            'signal':          signal,
            'current_price':   round(current_price, 2),
            'entry':           round(entry, 2),
            'stop_loss':       stop_loss,
            'tp1':             tp1,
            'tp2':             tp2,
            'support':         round(support, 2),
            'resistance':      round(resistance, 2),
            'risk_reward':     rr,
            'expected_return': exp_ret,
            'atr':             round(atr, 2),
            'currency_symbol': cur,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ── Predictions ───────────────────────────────────────────────────────────────
_all_preds_cache   = {}
_all_preds_time    = 0

@app.route('/api/predict/all')
def api_predict_all():
    global _all_preds_cache, _all_preds_time
    if time.time() - _all_preds_time < 60 and _all_preds_cache:
        return jsonify(_all_preds_cache)
    results = {}
    for t in ALL_TICKERS:
        try:
            pred = _get_predictor(t).predict()
            if pred:
                results[t] = {'signal': pred['signal'], 'confidence': pred['confidence']}
        except Exception:
            pass
    _all_preds_cache = results
    _all_preds_time  = time.time()
    return jsonify(results)

@app.route('/api/predict/<ticker>')
def api_predict(ticker):
    ticker = ticker.upper()
    try:
        pred = _get_predictor(ticker).predict()
        if pred is None:
            return jsonify({'error': 'Model not trained yet'}), 503
        pred['ticker'] = ticker
        return jsonify(pred)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/metrics/<ticker>')
def api_metrics(ticker):
    p = _get_predictor(ticker.upper())
    return jsonify(p.metrics or {'error': 'No metrics'})

# ── SSE live stream ───────────────────────────────────────────────────────────
@app.route('/api/stream')
def api_stream():
    def gen():
        while True:
            try:
                yield f"data: {json.dumps(get_live_cache())}\n\n"
            except Exception:
                pass
            time.sleep(5)
    return Response(gen(), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})

if __name__ == '__main__':
    start_scheduler()
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
