# NourishNet

Surplus food redistribution platform connecting Donors, NGOs, and Volunteers via map-based coordination.

## Tech Stack

- **Frontend:** React 18 + Vite + TypeScript + Leaflet.js (react-leaflet)
- **Backend:** FastAPI (Python 3.12) + SQLite (SQLAlchemy ORM)
- **Auth:** Firebase Phone OTP
- **Real-time:** WebSockets (FastAPI native)
- **ML:** scikit-learn (surplus prediction)
- **i18n:** react-i18next (English, Tamil, Hindi, Kannada)

## Setup

### Prerequisites

- Node.js >= 20.x
- Python >= 3.12
- npm >= 10.x

### Frontend

```bash
cd frontend
cp .env.example .env        # fill in your Firebase config
npm install
npm run dev                  # starts on http://localhost:5173
```

### Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate

cp .env.example .env         # fill in your config
pip install -r requirements.txt
alembic upgrade head         # run migrations
uvicorn main:app --reload    # starts on http://localhost:8000
```

### Verify

- Frontend: open http://localhost:5173
- Backend health check: `curl http://localhost:8000/health`

## Project Structure

```
nourishnet/
├── frontend/          # React + Vite + TypeScript
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
├── backend/           # FastAPI + SQLAlchemy
│   ├── app/
│   ├── alembic/
│   ├── main.py
│   └── requirements.txt
├── .gitignore
└── README.md
```

## Environment Variables

### Frontend (`.env`)

| Variable | Description |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |
| `VITE_API_BASE_URL` | Backend API URL (e.g., `http://localhost:8000`) |
| `VITE_WS_URL` | WebSocket URL (e.g., `ws://localhost:8000/ws`) |

### Backend (`.env`)

| Variable | Description |
|---|---|
| `DATABASE_URL` | SQLite connection string |
| `FIREBASE_CREDENTIALS_PATH` | Path to Firebase service account JSON |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `SECRET_KEY` | Secret key for JWT signing |
