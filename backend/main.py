from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, donations, claims, predictions

app = FastAPI(
    title="NourishNet API",
    description="Surplus food redistribution platform API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi import WebSocket, WebSocketDisconnect, Query
from app.websocket import manager

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


@app.get("/health")
def health_check():
    return {"status": "healthy"}

