"""
scheduler.py — Background jobs: live-quote refresh (60s) + model retrain (30min)
"""
from apscheduler.schedulers.background import BackgroundScheduler
from data_fetcher import ALL_TICKERS, fetch_live_quote, fetch_historical
from model import StockPredictor
import threading

_live_cache: dict = {}
_scheduler = None
_lock = threading.Lock()

def _refresh_quotes():
    for ticker in ALL_TICKERS:
        try:
            data = fetch_live_quote(ticker)
            with _lock:
                _live_cache[ticker] = data
        except Exception as e:
            print(f"[scheduler] quote {ticker}: {e}")

def _retrain_all():
    print("[scheduler] 🔄 Starting model retrain cycle …")
    for ticker in ALL_TICKERS:
        try:
            p = StockPredictor(ticker)
            df = fetch_historical(ticker, period='5y')
            p.train(df)
        except Exception as e:
            print(f"[scheduler] retrain {ticker}: {e}")
    print("[scheduler] Retraining all models ...")

def get_live_cache():
    with _lock:
        return dict(_live_cache)

def start_scheduler():
    global _scheduler
    _refresh_quotes()          # immediate first load
    _scheduler = BackgroundScheduler(daemon=True)
    _scheduler.add_job(_refresh_quotes, 'interval', seconds=60,  id='quotes')
    _scheduler.add_job(_retrain_all,    'interval', minutes=30,  id='retrain')
    _scheduler.start()
    print("[scheduler] Background scheduler started.")
    return _scheduler
