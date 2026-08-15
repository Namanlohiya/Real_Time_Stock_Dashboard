# run.py - Startup: train models then launch Flask
import sys, os

ROOT    = os.path.dirname(__file__)
BACKEND = os.path.join(ROOT, 'backend')
sys.path.insert(0, BACKEND)

os.makedirs(os.path.join(ROOT, 'models'), exist_ok=True)
os.makedirs(os.path.join(ROOT, 'data'),   exist_ok=True)

def train_models():
    from data_fetcher import ALL_TICKERS, fetch_historical
    from model import StockPredictor

    print(f"[run] Training models for {len(ALL_TICKERS)} tickers ...")
    for ticker in ALL_TICKERS:
        pkl = os.path.join(ROOT, 'models', f'{ticker.replace(".", "_")}.pkl')
        if os.path.exists(pkl):
            print(f"  [skip] {ticker} - cached")
            continue
        try:
            print(f"  [train] {ticker} ...")
            df = fetch_historical(ticker, period='5y')
            if df is not None and len(df) >= 200:
                p = StockPredictor(ticker)
                p.train(df)
            else:
                print(f"  [warn] {ticker} - not enough data")
        except Exception as e:
            print(f"  [error] {ticker}: {e}")
    print("[run] Model training complete.")

def launch_server():
    from app import app
    from scheduler import start_scheduler
    print("[run] Starting scheduler ...")
    start_scheduler()
    print("[run] Flask running on http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)

if __name__ == '__main__':
    train_models()
    launch_server()
