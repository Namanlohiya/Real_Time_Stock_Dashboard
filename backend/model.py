import os, pickle, warnings
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier, VotingClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
import xgboost as xgb
warnings.filterwarnings('ignore')

from feature_engineering import compute_features, create_target_labels, FEATURE_COLUMNS
from data_fetcher import fetch_historical

MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'models')
os.makedirs(MODELS_DIR, exist_ok=True)

class StockPredictor:
    def __init__(self, ticker):
        self.ticker = ticker
        self.model  = None
        self.scaler = StandardScaler()
        self.metrics = {}
        self.feature_importance = {}
        self.is_trained = False

    # ── Model definition ─────────────────────────────────────────────────
    @staticmethod
    def _build():
        rf = RandomForestClassifier(
            n_estimators=300, max_depth=10, min_samples_leaf=5,
            class_weight='balanced', random_state=42, n_jobs=-1)
        gb = GradientBoostingClassifier(
            n_estimators=150, max_depth=5, learning_rate=0.05,
            subsample=0.8, random_state=42)
        xgb_clf = xgb.XGBClassifier(
            n_estimators=200, max_depth=6, learning_rate=0.05,
            subsample=0.8, colsample_bytree=0.8,
            eval_metric='mlogloss', random_state=42, verbosity=0)
        return VotingClassifier(
            estimators=[('rf', rf), ('gb', gb), ('xgb', xgb_clf)],
            voting='soft')

    # ── Training ──────────────────────────────────────────────────────────
    def train(self, df=None):
        if df is None:
            df = fetch_historical(self.ticker, period='5y')
        if df is None or len(df) < 200:
            print(f"[model] {self.ticker}: not enough data ({len(df) if df is not None else 0} rows)")
            return False

        df = compute_features(df)
        df = create_target_labels(df)
        df = df.dropna(subset=FEATURE_COLUMNS + ['target'])

        if len(df) < 100:
            return False

        X = df[FEATURE_COLUMNS].values.astype(float)
        y = df['target'].values.astype(int)

        split = int(len(X) * 0.80)
        X_tr, X_te = X[:split], X[split:]
        y_tr, y_te = y[:split], y[split:]

        X_tr_s = self.scaler.fit_transform(X_tr)
        X_te_s = self.scaler.transform(X_te)

        self.model = self._build()
        self.model.fit(X_tr_s, y_tr)

        y_pred = self.model.predict(X_te_s)
        self.metrics = {
            'accuracy':  round(accuracy_score(y_te, y_pred) * 100, 1),
            'precision': round(precision_score(y_te, y_pred, average='weighted', zero_division=0) * 100, 1),
            'recall':    round(recall_score(y_te, y_pred,    average='weighted', zero_division=0) * 100, 1),
            'f1':        round(f1_score(y_te, y_pred,        average='weighted', zero_division=0) * 100, 1),
            'train_samples': len(X_tr),
            'test_samples':  len(X_te),
        }

        try:
            rf_est = self.model.estimators_[0]
            imp = rf_est.feature_importances_
            self.feature_importance = {
                col: round(float(v) * 100, 2)
                for col, v in sorted(zip(FEATURE_COLUMNS, imp), key=lambda x: -x[1])[:8]
            }
        except Exception:
            pass

        self.is_trained = True
        self.save()
        print(f"[model] OK {self.ticker} accuracy={self.metrics['accuracy']}%  samples={len(X)}")
        return True

    # ── Inference ────────────────────────────────────────────────────────
    def predict(self, df_recent=None):
        if not self.is_trained:
            self.load()
        if not self.is_trained:
            return None

        if df_recent is None:
            df_recent = fetch_historical(self.ticker, period='1y')
        if df_recent is None or df_recent.empty:
            return None

        df_f = compute_features(df_recent).dropna(subset=FEATURE_COLUMNS)
        if df_f.empty:
            return None

        X = df_f[FEATURE_COLUMNS].iloc[-1:].values.astype(float)
        X_s = self.scaler.transform(X)

        pred  = self.model.predict(X_s)[0]
        proba = self.model.predict_proba(X_s)[0]
        classes = self.model.classes_

        SIG = {1: 'BUY', -1: 'SELL', 0: 'HOLD'}
        signal = SIG.get(int(pred), 'HOLD')
        confidence = round(float(max(proba)) * 100, 1)
        proba_dict = {SIG.get(int(c), 'HOLD'): round(float(p) * 100, 1)
                      for c, p in zip(classes, proba)}

        lr = df_f.iloc[-1]
        cur_feat = {
            'RSI (14)':     round(float(lr.get('rsi_14', 50)), 1),
            'MACD':         round(float(lr.get('macd', 0)), 4),
            'BB %':         round(float(lr.get('bb_pct', 0.5)) * 100, 1),
            'Stoch K':      round(float(lr.get('stoch_k', 50)), 1),
            'Volume Ratio': round(float(lr.get('volume_ratio', 1)), 2),
        }

        return {
            'signal': signal, 'confidence': confidence,
            'probabilities': proba_dict,
            'features': cur_feat,
            'metrics': self.metrics,
            'feature_importance': self.feature_importance,
        }

    # ── Persistence ───────────────────────────────────────────────────────
    def _path(self):
        return os.path.join(MODELS_DIR, f'{self.ticker.replace(".", "_")}.pkl')

    def save(self):
        with open(self._path(), 'wb') as f:
            pickle.dump({'model': self.model, 'scaler': self.scaler,
                         'metrics': self.metrics,
                         'feature_importance': self.feature_importance}, f)

    def load(self):
        if not os.path.exists(self._path()):
            return False
        with open(self._path(), 'rb') as f:
            d = pickle.load(f)
        self.model = d['model']; self.scaler = d['scaler']
        self.metrics = d.get('metrics', {}); self.feature_importance = d.get('feature_importance', {})
        self.is_trained = True
        return True
