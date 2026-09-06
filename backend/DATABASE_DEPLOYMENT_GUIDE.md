# NourishNet — Production Database Deployment Guide

> [!WARNING]
> ### Critical Notice: Railway Ephemeral Filesystem & SQLite Persistence
> By default, Railway containers utilize an **ephemeral filesystem**. Every redeploy, configuration change, or container restart re-spawns from the build image, completely wiping any un-mounted local SQLite database file (`nourishnet.db`).
>
> If you run SQLite without a persistent volume in production, **all user accounts, food donations, and claim history will be lost on every deployment**.

---

## Deployment Options

### Option A: Railway Persistent Volume (Quickest SQLite Fix)

If you wish to retain SQLite for low-traffic or prototype environments without setting up an external database:

1. **Add a Volume on Railway**:
   - In your Railway project dashboard, click **+ New** > **Volume**.
   - Attach the volume to your `nourishnet-backend` service.
   - Set the Mount Path to `/data`.
2. **Configure Environment Variable**:
   - Set `DATABASE_URL` in your Railway environment variables:
     ```env
     DATABASE_URL=sqlite:////data/nourishnet.db
     ```
3. **Redeploy**:
   - Railway will persist the `/data` directory across all container redeploys and restarts.

---

### Option B: Railway Managed PostgreSQL (Recommended for Production)

For high concurrency, spatial GIS operations, multi-instance horizontal scaling, and enterprise durability, migrating to PostgreSQL is recommended.

#### Step 1: Add PostgreSQL on Railway
1. In your Railway dashboard, click **+ New** > **Database** > **Add PostgreSQL**.
2. Railway will automatically provision a managed Postgres instance and provide the connection string variable: `${{Postgres.DATABASE_URL}}`.

#### Step 2: Add psycopg2 driver to requirements.txt
Add the PostgreSQL driver to `backend/requirements.txt`:
```txt
psycopg2-binary==2.9.10
```

#### Step 3: Connect Backend to PostgreSQL
In your backend service's environment variables on Railway:
```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

#### Step 4: Run Database Migrations
SQLAlchemy and Alembic in NourishNet are completely database-agnostic. Run the migration to apply all 4 tables directly to Postgres:
```bash
alembic upgrade head
```

All models (`User`, `Donation`, `Claim`, `Notification`), indexes, and foreign keys will be created automatically.

---

## Pre-Deployment Verification Checklist

- [x] All 25 backend pytest tests pass (`pytest tests/ -v`)
- [x] Strict TypeScript validation passes with 0 errors (`npx tsc --noEmit`)
- [x] Frontend builds cleanly for production (`npm run build`)
- [x] ML model trained and serialized with matching pinned `scikit-learn==1.6.1` and `joblib==1.4.2`
- [x] Native WebSockets enabled with handshake token authentication
- [x] Fallback REST polling active if WebSocket is blocked or disconnected
- [x] 4 languages (English, Tamil, Hindi, Kannada) verified with 100% dictionary key parity
- [x] CORS origins set to allow Vercel production domains
