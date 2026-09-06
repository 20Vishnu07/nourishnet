# 🌱 NourishNet — Surplus Food Redistribution Platform

[![Live Frontend](https://img.shields.io/badge/Vercel-Live%20App-000000?style=for-the-badge&logo=vercel)](https://nourishnet-kappa.vercel.app)
[![Live Backend](https://img.shields.io/badge/Render-Live%20API-46E3B7?style=for-the-badge&logo=render)](https://nourishnet-yrql.onrender.com)
[![Swagger Docs](https://img.shields.io/badge/FastAPI-Interactive%20Docs-009688?style=for-the-badge&logo=fastapi)](https://nourishnet-yrql.onrender.com/docs)
[![Python Version](https://img.shields.io/badge/Python-3.12.8-3776AB?style=for-the-badge&logo=python)](https://www.python.org/)
[![React Version](https://img.shields.io/badge/React-18.3.1-61DAFB?style=for-the-badge&logo=react)](https://react.dev/)
[![Tests](https://img.shields.io/badge/Pytest-25%2F25%20Passed-brightgreen?style=for-the-badge)](https://github.com/20Vishnu07/nourishnet)

> **Zero Food Waste. 100% Human Dignity.**  
> NourishNet connects restaurants, caterers, and households with verified local NGOs and volunteer delivery champions in real-time through interactive Leaflet maps, AI predictive surplus forecasting, and native WebSocket coordination.

---

## 🌐 Live Deployments

- **Web Application:** [https://nourishnet-kappa.vercel.app](https://nourishnet-kappa.vercel.app)
- **Backend API:** [https://nourishnet-yrql.onrender.com](https://nourishnet-yrql.onrender.com)
- **Interactive Swagger Documentation:** [https://nourishnet-yrql.onrender.com/docs](https://nourishnet-yrql.onrender.com/docs)
- **API Health Check:** [https://nourishnet-yrql.onrender.com/health](https://nourishnet-yrql.onrender.com/health)

---

## ✨ Key Features

### 1. Modern Visual Showcase & Role-Based Portals
- **Inspiring Landing Experience:** High-resolution community imagery, impact metrics counter (46,000+ meals shared, 18,500+ kg rescued), and 3-step illustrated workflow.
- **Dedicated Role Entries:**
  - 🍲 **Food Donors (Hotels, Caterers, Households):** 60-second surplus creation, map pin drop, and AI waste prevention forecasts.
  - 🏢 **NGOs & Shelters:** Live radius radar map, audio pings, real-time push alerts, and 1-click claims.
  - 🚗 **Volunteer Champions:** Pickup navigation, turn-by-turn route tracking, and milestone validation (*Assigned* $\to$ *Picked Up* $\to$ *Delivered*).
- **1-Click Instant Demo Testing:** Dedicated preview buttons for Donors, NGOs, and Volunteers for frictionless evaluation without SMS delays.

### 2. Real-Time Push Coordination (WebSockets + Polling Fallback)
- **Native FastAPI WebSockets (`/ws`):** Targeted broadcasting for `NEW_DONATION` and `CLAIM_STATUS_UPDATED`.
- **Automatic Fallback:** Gracefully degrades to 10s REST polling if WebSocket connection drops or on restrictive networks.

### 3. AI Predictive Surplus Forecasting (Machine Learning)
- Built with **scikit-learn** (`GradientBoostingRegressor`) trained on 800 historical donation patterns ($R^2 = 0.980$, $\text{MAE} = 2.15\text{ kg}$).
- Dynamically predicts expected surplus weight based on food category, day of week, and donor history to prevent waste before it happens.

### 4. Interactive Geolocation Maps
- Powered by **Leaflet.js** and **React-Leaflet**.
- Click-to-pin location selection for Donors and live interactive radar radius filtering for NGOs using the Haversine distance formula.

### 5. Multi-Language Internationalization (i18n)
- 100% parity across **4 Indian languages** (124/124 keys verified):
  - 🇬🇧 English (`en`)
  - 🇮🇳 தமிழ் (`ta` - Tamil)
  - 🇮🇳 हिन्दी (`hi` - Hindi)
  - 🇮🇳 ಕನ್ನಡ (`kn` - Kannada)
- Persisted to user profiles in the database and updated in real-time.

---

## 🏗️ Architecture

```
                                  +-----------------------------+
                                  |     Vercel Edge Network     |
                                  |  nourishnet-kappa.vercel.app|
                                  +--------------+--------------+
                                                 |
                       HTTPS REST API Calls      |      WebSockets (wss://)
                       & Authentication          |      Real-Time Radar
                                                 v
                                  +-----------------------------+
                                  |     Render Web Service      |
                                  |  nourishnet-yrql.onrender   |
                                  +--------------+--------------+
                                                 |
                   +-----------------------------+-----------------------------+
                   |                             |                             |
                   v                             v                             v
          +-----------------+           +-----------------+           +-----------------+
          | SQLite Database |           |  FastAPI WS     |           | ML Scikit-Learn |
          | Alembic Schema  |           | Broadcast Hub   |           | GradientBoost   |
          +-----------------+           +-----------------+           +-----------------+
```

---

## 🛠️ Local Development Setup

### Prerequisites
- Node.js >= 20.x
- Python >= 3.12
- npm >= 10.x

### 1. Clone Repository
```bash
git clone https://github.com/20Vishnu07/nourishnet.git
cd nourishnet
```

### 2. Backend Setup
```bash
cd backend
python -m venv .venv

# Windows:
.\.venv\Scripts\Activate.ps1
# macOS / Linux:
# source .venv/bin/activate

pip install -r requirements.txt
alembic upgrade head
python -m app.ml.train
uvicorn main:app --reload --port 8000
```

### 3. Frontend Setup
```bash
cd ../frontend
npm install
npm run dev
```

Visit `http://localhost:5173/` in your browser.

---

## 🧪 Testing

Run backend test suite (25/25 unit & integration tests):
```bash
cd backend
pytest -v
```

Validate i18n key parity across all 4 languages:
```bash
python frontend/verify_translations.py
```

---

## 📄 License

MIT License © 2026 NourishNet Contributors
