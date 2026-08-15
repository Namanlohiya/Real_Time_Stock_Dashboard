# 📈 StockPulse AI — Real-Time Stock Market Dashboard

A full-stack **real-time stock market dashboard** built with **Python, Flask, JavaScript, and Machine Learning**. The application combines live/delayed market data, interactive technical charts, automated data updates, and ML-based **BUY / HOLD / SELL** predictions for selected US and Indian stocks.

> **Disclaimer:** This project is for educational and demonstration purposes only. The predictions, trade setups, and signals are not financial advice.

---

## 🚀 Features

### 📊 Market Dashboard
- Real-time/delayed stock quotes using Yahoo Finance data through `yfinance`
- Support for **US and Indian stocks**
- Live price, price change, percentage change, volume, and market-cap information
- Searchable stock watchlist
- Automatic quote refresh every **60 seconds**

### 📈 Interactive Charts
- Candlestick charts
- Heikin Ashi
- Line chart
- Area chart
- OHLC chart
- Baseline chart
- Intraday intervals:
  - 5 minutes
  - 15 minutes
  - 1 hour
- Historical timeframes:
  - 1 day
  - 3 months
  - 6 months
  - 1 year
  - 2 years
  - 5 years
- OHLCV information and volume visualization

### 🤖 Machine Learning Predictions
The dashboard provides:
- BUY / HOLD / SELL signals
- Prediction confidence
- Class probabilities
- Current technical indicators
- Model accuracy
- Precision
- Recall
- F1 score
- Training and testing sample counts
- Feature importance

The ML system uses an ensemble voting classifier combining:

- Random Forest
- Gradient Boosting
- XGBoost

### 🔬 Technical Indicators

The feature-engineering pipeline uses indicators and market features including:

- EMA 9, 21, 50
- EMA crossovers
- Price/EMA ratios
- MACD
- RSI 7 and RSI 14
- Bollinger Bands
- Stochastic Oscillator
- Williams %R
- ATR
- ATR ratio
- OBV signal
- Volume ratio
- 1-day, 5-day and 10-day returns
- Rate of Change
- Momentum
- High-low ratio
- Open-close ratio

### 🎯 Trade Setup

For each selected stock, the dashboard calculates an educational trade setup containing:

- Entry price
- Take Profit 1
- Take Profit 2
- Stop Loss
- Risk/Reward ratio
- Expected return
- Support
- Resistance
- ATR

### 💼 Paper Portfolio

The frontend also includes a paper-trading interface where users can simulate BUY/SELL actions and view their paper portfolio without executing real trades.

### 🔄 Automated Background Processing

The application uses APScheduler to:

- Refresh market quotes every **60 seconds**
- Retrain all stock prediction models every **30 minutes**

Historical daily data is also cached locally so the application can fall back to cached data when the live data request fails.

---

## 🌎 Supported Stocks

### 🇺🇸 US Stocks

| Ticker | Company |
|---|---|
| AAPL | Apple Inc. |
| MSFT | Microsoft Corp. |
| GOOGL | Alphabet Inc. |
| AMZN | Amazon.com |
| TSLA | Tesla Inc. |
| NVDA | NVIDIA Corp. |
| META | Meta Platforms |
| JPM | JPMorgan Chase |
| NFLX | Netflix Inc. |
| AMD | AMD Inc. |

### 🇮🇳 Indian Stocks

| Ticker | Company |
|---|---|
| RELIANCE.NS | Reliance Industries |
| TCS.NS | Tata Consultancy Services |
| INFY.NS | Infosys Ltd. |
| HDFCBANK.NS | HDFC Bank |
| WIPRO.NS | Wipro Ltd. |
| ICICIBANK.NS | ICICI Bank |
| BAJFINANCE.NS | Bajaj Finance |
| HINDUNILVR.NS | Hindustan Unilever |

---

## 🧠 Machine Learning Pipeline

The prediction pipeline follows this workflow:

```text
Yahoo Finance
     ↓
Historical OHLCV Data
     ↓
Feature Engineering
     ↓
Technical Indicators
     ↓
BUY / HOLD / SELL Target Labels
     ↓
80/20 Train-Test Split
     ↓
StandardScaler
     ↓
Random Forest + Gradient Boosting + XGBoost
     ↓
Soft Voting Ensemble
     ↓
Prediction + Confidence
     ↓
Flask REST API
     ↓
Interactive Web Dashboard
```

### Target Label Generation

The model uses the future 5-day return to create training labels:

- **BUY** → forward return > +1.5%
- **SELL** → forward return < -1.5%
- **HOLD** → otherwise

The model is trained on approximately **5 years of historical daily data** when sufficient data is available.

---

## 🏗️ Project Structure

```text
Stock_Market_Dashboard/
│
├── backend/
│   ├── app.py
│   ├── data_fetcher.py
│   ├── feature_engineering.py
│   ├── model.py
│   └── scheduler.py
│
├── frontend/
│   ├── index.html
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── charts.js
│       ├── dashboard.js
│       └── predictions.js
│
├── data/
│   └── Cached historical stock data
│
├── models/
│   └── Trained ML models (.pkl)
│
├── requirements.txt
├── run.py
├── .gitignore
└── README.md
```

---

## 🛠️ Technologies Used

### Backend
- Python
- Flask
- Flask-CORS
- APScheduler

### Data & Machine Learning
- yfinance
- Pandas
- NumPy
- Scikit-learn
- XGBoost

### Frontend
- HTML5
- CSS3
- JavaScript
- Lightweight Charts

### Machine Learning
- Random Forest
- Gradient Boosting
- XGBoost
- Voting Classifier
- StandardScaler

---

## 💻 Installation

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/Stock_Market_Dashboard.git
cd Stock_Market_Dashboard
```

Replace `YOUR_USERNAME` with your GitHub username.

### 2. Create a virtual environment

#### Windows

```bash
python -m venv .venv
.venv\Scripts\activate
```

#### macOS / Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

---

## ▶️ Run the Application

From the project root:

```bash
python run.py
```

The application will:

1. Check for existing trained models.
2. Train missing models using historical data.
3. Start the background scheduler.
4. Start the Flask server.

Open your browser and visit:

```text
http://localhost:5000
```

> The first startup can take some time if trained model files are not already available because historical data must be downloaded and models must be trained.

---

## 🔌 REST API

The Flask backend provides several API endpoints.

| Endpoint | Purpose |
|---|---|
| `/api/tickers` | Get supported stocks |
| `/api/quote/<ticker>` | Get a stock quote |
| `/api/quotes` | Get cached quotes for all stocks |
| `/api/chart/<ticker>` | Get OHLCV chart data |
| `/api/targets/<ticker>` | Get trade setup levels |
| `/api/predict/<ticker>` | Get ML prediction |
| `/api/predict/all` | Get predictions for all stocks |
| `/api/metrics/<ticker>` | Get model performance metrics |
| `/api/stream` | Server-sent live data stream |

### Example

```text
http://localhost:5000/api/predict/AAPL
```

Example response:

```json
{
  "signal": "BUY",
  "confidence": 78.4,
  "probabilities": {
    "BUY": 78.4,
    "HOLD": 15.2,
    "SELL": 6.4
  }
}
```

---

## 📦 Dependencies

The project uses the following core Python packages:

```text
Flask
Flask-CORS
yfinance
pandas
numpy
scikit-learn
xgboost
APScheduler
```

Install the exact project versions with:

```bash
pip install -r requirements.txt
```

---

## ⚡ Important Notes

### Market Data

Market data is retrieved through `yfinance`. Depending on the exchange, market conditions, and Yahoo Finance availability, quote data may be delayed or temporarily unavailable.

### Cached Data

Daily historical data is stored in the `data/` directory. If a live historical-data request fails, the application can use the locally cached daily data.

### Model Files

Pre-trained models are stored as `.pkl` files in the `models/` directory. If a model is missing, `run.py` attempts to train it automatically.

### API Rate Limits

Because the application requests market data for multiple stocks, excessive refreshes or API requests may encounter temporary data-provider limitations.

---

## 🔮 Future Improvements

- User authentication and personalized watchlists
- More technical indicators
- Deep-learning models such as LSTM/GRU
- News and sentiment analysis
- Portfolio performance analytics
- Real brokerage API integration
- Docker deployment
- Cloud deployment
- WebSocket-based real-time updates
- Backtesting engine
- Advanced risk-management module
- More global stock exchanges

---

## 📸 Dashboard

Add screenshots of the dashboard here:

```text
docs/
├── dashboard.png
├── prediction.png
└── portfolio.png
```

Example Markdown:

```markdown
![StockPulse AI Dashboard](docs/dashboard.png)
```

---

## 👨‍💻 Author

**Naman Lohiya**

B.Tech — Automation & Robotics

Areas of interest:
- Artificial Intelligence
- Machine Learning
- Computer Vision
- Robotics & Automation
- Data Analytics
- Full-Stack Development

---

## 📄 License

This project is intended for educational and portfolio purposes.

If you choose to add an open-source license, consider adding an `MIT License` file to the repository.

---

## ⚠️ Disclaimer

StockPulse AI is an educational software project. Its market data, predictions, BUY/HOLD/SELL signals, confidence values, and calculated trade setups should **not** be considered financial advice or recommendations to buy or sell securities.

Always perform independent research and consult a qualified financial professional before making investment decisions.
