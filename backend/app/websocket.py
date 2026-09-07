"""
FastAPI native WebSocket Connection Manager for NourishNet.

Handles:
- Authenticated WebSocket handshake via JWT query param
- Disconnect / reconnect resilience without crashing
- Role-based and targeted user broadcasting:
  - New donations broadcast to active NGOs (with location filtering where applicable)
  - Claim status updates broadcast to relevant donor, NGO, and volunteer
"""

import logging
from typing import Dict, Set, Any
from fastapi import WebSocket, WebSocketDisconnect
from app.auth.jwt_handler import decode_access_token

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        # user_id -> set of active WebSockets (supports multiple tabs per user)
        self.active_connections: Dict[int, Set[WebSocket]] = {}
        # socket -> user info dict: {"user_id": int, "role": str}
        self.socket_user_meta: Dict[WebSocket, Dict[str, Any]] = {}

    async def connect(self, websocket: WebSocket, token: str | None) -> int | None:
        """
        Validate token and accept connection.
        Returns user_id if authenticated, or None if rejected.
        """
        if not token:
            await websocket.close(code=1008, reason="Missing authentication token")
            return None

        payload = decode_access_token(token)
        if not payload or "user_id" not in payload:
            await websocket.close(code=1008, reason="Invalid or expired token")
            return None

        user_id = payload["user_id"]
        role = payload.get("role", "unknown")

        await websocket.accept()

        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        self.active_connections[user_id].add(websocket)
        self.socket_user_meta[websocket] = {"user_id": user_id, "role": role}

        logger.info(f"User {user_id} ({role}) connected via WebSocket. Active users: {len(self.active_connections)}")
        return user_id

    def disconnect(self, websocket: WebSocket):
        """Remove disconnected websocket safely."""
        meta = self.socket_user_meta.pop(websocket, None)
        if meta:
            user_id = meta["user_id"]
            if user_id in self.active_connections:
                self.active_connections[user_id].discard(websocket)
                if not self.active_connections[user_id]:
                    del self.active_connections[user_id]
            logger.info(f"User {user_id} disconnected from WebSocket.")

    async def send_to_user(self, user_id: int, message: dict):
        """Send message to all active sockets of a specific user."""
        if user_id not in self.active_connections:
            return

        dead_sockets = set()
        for socket in self.active_connections[user_id]:
            try:
                await socket.send_json(message)
            except Exception as e:
                logger.warning(f"Error sending message to user {user_id}: {e}")
                dead_sockets.add(socket)

        for socket in dead_sockets:
            self.disconnect(socket)

    async def broadcast_new_donation(self, donation_data: dict):
        """Broadcast new donation notification to all connected NGOs."""
        message = {
            "type": "NEW_DONATION",
            "donation": donation_data,
        }
        dead_sockets = set()

        for socket, meta in self.socket_user_meta.items():
            if meta.get("role") == "ngo":
                try:
                    await socket.send_json(message)
                except Exception as e:
                    logger.warning(f"Error broadcasting new donation to socket: {e}")
                    dead_sockets.add(socket)

        for socket in dead_sockets:
            self.disconnect(socket)

    async def broadcast_claim_status_change(
        self,
        claim_data: dict,
        donor_id: int,
        ngo_id: int,
        volunteer_id: int | None = None,
    ):
        """Broadcast claim status updates to the donor, NGO, and assigned volunteer."""
        message = {
            "type": "CLAIM_STATUS_UPDATED",
            "claim": claim_data,
        }

        # Target relevant parties
        recipient_ids = {donor_id, ngo_id}
        if volunteer_id:
            recipient_ids.add(volunteer_id)

        for recipient_id in recipient_ids:
            await self.send_to_user(recipient_id, message)

    async def broadcast_volunteer_location(
        self,
        claim_id: int,
        ngo_id: int,
        volunteer_id: int,
        lat: float,
        lng: float,
        status: str | None = None,
    ):
        """Broadcast live GPS coordinates of volunteer to the claiming NGO and volunteer."""
        message = {
            "type": "VOLUNTEER_LOCATION_UPDATED",
            "claim_id": claim_id,
            "ngo_id": ngo_id,
            "volunteer_id": volunteer_id,
            "lat": lat,
            "lng": lng,
            "status": status,
        }
        await self.send_to_user(ngo_id, message)
        await self.send_to_user(volunteer_id, message)

    async def broadcast_volunteer_request(self, claim_data: dict):
        """Broadcast new delivery request needing volunteer pickup to all active volunteers."""
        message = {
            "type": "VOLUNTEER_REQUEST_CREATED",
            "claim": claim_data,
        }
        dead_sockets = set()
        for socket, meta in self.socket_user_meta.items():
            if meta.get("role") == "volunteer":
                try:
                    await socket.send_json(message)
                except Exception as e:
                    logger.warning(f"Error broadcasting volunteer request to socket: {e}")
                    dead_sockets.add(socket)

        for socket in dead_sockets:
            self.disconnect(socket)


manager = ConnectionManager()
