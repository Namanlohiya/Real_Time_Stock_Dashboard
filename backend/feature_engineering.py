import pandas as pd
import numpy as np

# ── Low-level indicator helpers ─────────────────────────────────────────────

def _rsi(series, period=14):
    delta = series.diff()
    gain = delta.clip(lower=0).rolling(period, min_periods=1).mean()
    loss = (-delta.clip(upper=0)).rolling(period, min_periods=1).mean()
    rs = gain / (loss + 1e-10)
    return 100 - 100 / (1 + rs)

def _macd(series, fast=12, slow=26, sig=9):
    ema_f = series.ewm(span=fast, adjust=False).mean()
    ema_s = series.ewm(span=slow, adjust=False).mean()
    macd = ema_f - ema_s
    signal = macd.ewm(span=sig, adjust=False).mean()
    return macd, signal, macd - signal

def _bollinger(series, period=20, k=2):
    sma = series.rolling(period).mean()
    std = series.rolling(period).std()
    upper = sma + k * std
    lower = sma - k * std
    width = upper - lower
    pct = (series - lower) / (width + 1e-10)
    return upper, sma, lower, width, pct

def _stoch(high, low, close, kp=14, dp=3):
    lo = low.rolling(kp).min()
    hi = high.rolling(kp).max()
    k = 100 * (close - lo) / (hi - lo + 1e-10)
    return k, k.rolling(dp).mean()

def _atr(high, low, close, period=14):
    tr = pd.concat([high - low,
                    (high - close.shift()).abs(),
                    (low - close.shift()).abs()], axis=1).max(axis=1)
    return tr.rolling(period).mean()

def _obv(close, volume):
    direction = np.sign(close.diff().fillna(0))
    return (volume * direction).cumsum()

# ── Main feature computation ─────────────────────────────────────────────────

FEATURE_COLUMNS = [
    'ema_9', 'ema_21', 'ema_50',
    'ema_9_21_cross', 'ema_21_50_cross',
    'price_ema9_ratio', 'price_ema50_ratio',
    'macd', 'macd_signal', 'macd_hist',
    'rsi_14', 'rsi_7',
    'bb_upper', 'bb_lower', 'bb_width', 'bb_pct',
    'stoch_k', 'stoch_d',
    'williams_r',
    'atr_14', 'atr_ratio',
    'obv_signal',
    'volume_ratio',
    'return_1d', 'return_5d', 'return_10d',
    'high_low_ratio', 'open_close_ratio',
    'roc_5', 'roc_10', 'momentum_14'
]

def compute_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    c, h, l, v, o = df['close'], df['high'], df['low'], df['volume'], df['open']

    df['ema_9']  = c.ewm(span=9,  adjust=False).mean()
    df['ema_21'] = c.ewm(span=21, adjust=False).mean()
    df['ema_50'] = c.ewm(span=50, adjust=False).mean()

    df['ema_9_21_cross']  = df['ema_9']  - df['ema_21']
    df['ema_21_50_cross'] = df['ema_21'] - df['ema_50']
    df['price_ema9_ratio']  = c / (df['ema_9']  + 1e-10)
    df['price_ema50_ratio'] = c / (df['ema_50'] + 1e-10)

    df['macd'], df['macd_signal'], df['macd_hist'] = _macd(c)

    df['rsi_14'] = _rsi(c, 14)
    df['rsi_7']  = _rsi(c, 7)

    df['bb_upper'], _, df['bb_lower'], df['bb_width'], df['bb_pct'] = _bollinger(c)

    df['stoch_k'], df['stoch_d'] = _stoch(h, l, c)

    hi14 = h.rolling(14).max()
    lo14 = l.rolling(14).min()
    df['williams_r'] = -100 * (hi14 - c) / (hi14 - lo14 + 1e-10)

    df['atr_14']   = _atr(h, l, c)
    df['atr_ratio'] = df['atr_14'] / (c + 1e-10)

    obv = _obv(c, v)
    obv_ema = pd.Series(obv).ewm(span=20, adjust=False).mean()
    df['obv_signal'] = obv - obv_ema.values

    vol_ma = v.rolling(20).mean()
    df['volume_ratio'] = v / (vol_ma + 1e-10)

    df['return_1d']  = c.pct_change(1)
    df['return_5d']  = c.pct_change(5)
    df['return_10d'] = c.pct_change(10)

    df['high_low_ratio']    = (h - l) / (c + 1e-10)
    df['open_close_ratio']  = (c - o) / (c + 1e-10)

    df['roc_5']  = c.pct_change(5)
    df['roc_10'] = c.pct_change(10)
    df['momentum_14'] = c - c.shift(14)

    return df

def create_target_labels(df: pd.DataFrame,
                         forward_days=5,
                         buy_thr=0.015,
                         sell_thr=-0.015) -> pd.DataFrame:
    """Label: 1=BUY, -1=SELL, 0=HOLD based on next-5-day return."""
    df = df.copy()
    fwd = df['close'].pct_change(forward_days).shift(-forward_days)
    df['target'] = 0
    df.loc[fwd >  buy_thr,  'target'] =  1
    df.loc[fwd < sell_thr,  'target'] = -1
    return df.dropna(subset=FEATURE_COLUMNS + ['target'])
