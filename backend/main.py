from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text, inspect
import logging

from app.config import settings
from app.database import engine, Base
from app.routers import auth, donations, claims, predictions
from app.websocket import manager

from contextlib import asynccontextmanager

logger = logging.getLogger("uvicorn")


def run_db_migration():
    """Ensure database schema is up-to-date with new columns."""
    try:
        Base.metadata.create_all(bind=engine)
        with engine.connect() as conn:
            inspector = inspect(engine)
            if "users" in inspector.get_table_names():
                columns = [c["name"] for c in inspector.get_columns("users")]
                if "email" not in columns:
                    logger.info("Migrating users table: adding email column")
                    conn.execute(text("ALTER TABLE users ADD COLUMN email VARCHAR(120)"))
                if "hashed_password" not in columns:
                    logger.info("Migrating users table: adding hashed_password column")
                    conn.execute(text("ALTER TABLE users ADD COLUMN hashed_password VARCHAR(255)"))
                if "org_name" not in columns:
                    logger.info("Migrating users table: adding org_name column")
                    conn.execute(text("ALTER TABLE users ADD COLUMN org_name VARCHAR(150)"))
                if "address" not in columns:
                    logger.info("Migrating users table: adding address column")
                    conn.execute(text("ALTER TABLE users ADD COLUMN address VARCHAR(255)"))
                conn.commit()
                logger.info("Database migration completed successfully.")
    except Exception as e:
        logger.error(f"Error during database migration: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    run_db_migration()
    yield


app = FastAPI(
    title="NourishNet API",
    description="Surplus food redistribution platform API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"https://.*\.vercel\.app|https://.*\.onrender\.com|http://localhost:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/migrate")
def trigger_migration():
    run_db_migration()
    return {"status": "migration completed"}



# Register routers
app.include_router(auth.router)
app.include_router(donations.router)
app.include_router(claims.router)
app.include_router(predictions.router)



@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str | None = Query(None)):
    """
    Authenticated WebSocket endpoint for real-time updates.
    Rejects unauthenticated connections with code 1008.
    Gracefully handles client disconnects without crashing.
    """
    user_id = await manager.connect(websocket, token)
    if user_id is None:
        return

    try:
        while True:
            # Keep connection open; receive heartbeats or messages from client
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)


@app.get("/")
def root():
    return {
        "name": "NourishNet API",
        "status": "online",
        "docs": "/docs",
        "health": "/health",
        "version": "0.1.0"
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}

