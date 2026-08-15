import yfinance as yf
import pandas as pd
import os
from datetime import datetime

CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')
os.makedirs(CACHE_DIR, exist_ok=True)

US_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'JPM', 'NFLX', 'AMD']
IN_TICKERS = ['RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS', 'WIPRO.NS',
              'ICICIBANK.NS', 'BAJFINANCE.NS', 'HINDUNILVR.NS']
ALL_TICKERS = US_TICKERS + IN_TICKERS

TICKER_NAMES = {
    'AAPL': 'Apple Inc.', 'MSFT': 'Microsoft Corp.', 'GOOGL': 'Alphabet Inc.',
    'AMZN': 'Amazon.com', 'TSLA': 'Tesla Inc.', 'NVDA': 'NVIDIA Corp.',
    'META': 'Meta Platforms', 'JPM': 'JPMorgan Chase', 'NFLX': 'Netflix Inc.',
    'AMD': 'AMD Inc.',
    'RELIANCE.NS': 'Reliance Industries', 'TCS.NS': 'Tata Consultancy',
    'INFY.NS': 'Infosys Ltd.', 'HDFCBANK.NS': 'HDFC Bank',
    'WIPRO.NS': 'Wipro Ltd.', 'ICICIBANK.NS': 'ICICI Bank',
    'BAJFINANCE.NS': 'Bajaj Finance', 'HINDUNILVR.NS': 'Hindustan Unilever',
}

def fetch_historical(ticker, period='5y', interval='1d'):
    """Fetch historical OHLCV data; fallback to cache if network fails."""
    cache_key  = f'{ticker.replace(".", "_")}_{interval}_hist.csv'
    cache_path = os.path.join(CACHE_DIR, cache_key)
    try:
        t  = yf.Ticker(ticker)
        df = t.history(period=period, interval=interval, auto_adjust=True)
        if df.empty:
            raise ValueError("Empty dataframe")
        df.index = df.index.tz_localize(None) if df.index.tzinfo else df.index
        df.reset_index(inplace=True)
        date_col = 'Datetime' if 'Datetime' in df.columns else 'Date'
        df.rename(columns={date_col: 'date', 'Open': 'open', 'High': 'high',
                           'Low': 'low', 'Close': 'close', 'Volume': 'volume'}, inplace=True)
        df = df[['date', 'open', 'high', 'low', 'close', 'volume']].dropna()
        # Only cache daily data (intraday is always fresh)
        if interval == '1d':
            df.to_csv(cache_path, index=False)
        return df
    except Exception as e:
        print(f"[data_fetcher] {ticker}({interval}) live fetch failed: {e}")
        if interval == '1d' and os.path.exists(cache_path):
            return pd.read_csv(cache_path, parse_dates=['date'])
        return None

def fetch_live_quote(ticker):
    """Return a live/delayed price quote dict."""
    try:
        t    = yf.Ticker(ticker)
        info = t.fast_info
        hist = t.history(period='5d', interval='1d', auto_adjust=True)
        price = float(info.last_price) if hasattr(info, 'last_price') and info.last_price else 0.0
        if price == 0 and not hist.empty:
            price = float(hist['Close'].iloc[-1])
        prev_close  = float(hist['Close'].iloc[-2]) if len(hist) >= 2 else price
        change      = price - prev_close
        change_pct  = (change / prev_close * 100) if prev_close else 0
        volume      = int(info.three_month_average_volume) if hasattr(info, 'three_month_average_volume') and info.three_month_average_volume else 0
        mkt_cap     = float(info.market_cap) if hasattr(info, 'market_cap') and info.market_cap else 0
        return {
            'ticker': ticker, 'name': TICKER_NAMES.get(ticker, ticker),
            'price': round(price, 2), 'change': round(change, 2),
            'change_pct': round(change_pct, 2), 'volume': volume,
            'market_cap': mkt_cap,
            'currency': 'INR' if '.NS' in ticker else 'USD',
            'timestamp': datetime.now().isoformat()
        }
    except Exception as e:
        print(f"[data_fetcher] live quote {ticker}: {e}")
        return {'ticker': ticker, 'name': TICKER_NAMES.get(ticker, ticker),
                'price': 0, 'change': 0, 'change_pct': 0, 'volume': 0,
                'market_cap': 0, 'currency': 'INR' if '.NS' in ticker else 'USD',
                'timestamp': datetime.now().isoformat()}

def get_chart_data(ticker, period='6mo', interval='1d'):
    """Return OHLCV list formatted for the frontend (Unix timestamps)."""
    df = fetch_historical(ticker, period=period, interval=interval)
    # Fallback: if intraday returns empty (market closed / weekend), use daily
    if (df is None or df.empty) and interval != '1d':
        df = fetch_historical(ticker, period='1mo', interval='1d')
    if df is None or df.empty:
        return []
    records = []
    for _, row in df.iterrows():
        try:
            ts = int(pd.Timestamp(row['date']).timestamp())
            records.append({
                'time':   ts,
                'open':   round(float(row['open']),   2),
                'high':   round(float(row['high']),   2),
                'low':    round(float(row['low']),    2),
                'close':  round(float(row['close']),  2),
                'volume': int(row['volume'])
            })
        except Exception:
            continue
    return records
