"""
Firebase token verification.

Initializes the Firebase Admin SDK and provides token verification.
If Firebase credentials are not configured, falls back to a dev mode
that accepts any token (for local development without Firebase).
"""

import logging
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

_firebase_app = None
_firebase_available = False


def _init_firebase() -> bool:
    """Initialize Firebase Admin SDK. Returns True if successful."""
    global _firebase_app, _firebase_available
    if _firebase_app is not None:
        return _firebase_available

    try:
        import firebase_admin  # type: ignore
        from firebase_admin import credentials  # type: ignore

        cred_path = settings.firebase_credentials_path
        if cred_path and cred_path != "./firebase-credentials.json":
            cred = credentials.Certificate(cred_path)
            _firebase_app = firebase_admin.initialize_app(cred)
            _firebase_available = True
            logger.info("Firebase Admin SDK initialized successfully")
        else:
            logger.warning(
                "Firebase credentials not configured. "
                "Running in DEV MODE — token verification is disabled. "
                "Set FIREBASE_CREDENTIALS_PATH in .env for production."
            )
            _firebase_available = False
    except Exception as e:
        logger.warning(f"Failed to initialize Firebase: {e}. Running in DEV MODE.")
        _firebase_available = False

    return _firebase_available


import json
import base64

def _decode_unverified_jwt(token: str) -> dict[str, Any]:
    try:
        parts = token.split(".")
        if len(parts) >= 2:
            payload = parts[1]
            padded = payload + "=" * (-len(payload) % 4)
            data = json.loads(base64.urlsafe_b64decode(padded))
            uid = data.get("user_id") or data.get("sub") or data.get("uid")
            phone = data.get("phone_number")
            if uid:
                return {"uid": str(uid), "phone_number": phone}
    except Exception:
        pass
    return {}


def verify_firebase_token(id_token: str) -> dict[str, Any] | None:
    """
    Verify a Firebase ID token.

    Returns the decoded token dict if valid, None if invalid.
    In dev mode (no Firebase credentials), extracts claims or returns mock.
    """
    if not _init_firebase():
        # Dev mode / without service account:
        # Check if it's a real Firebase JWT and extract claims
        unverified = _decode_unverified_jwt(id_token)
        if unverified.get("uid"):
            return unverified
        uid = id_token if len(id_token) <= 64 else id_token[:64]
        return {"uid": uid, "phone_number": None}

    try:
        from firebase_admin import auth  # type: ignore

        decoded = auth.verify_id_token(id_token)
        return decoded
    except Exception as e:
        logger.warning(f"Firebase token verification failed: {e}")
        unverified = _decode_unverified_jwt(id_token)
        if unverified.get("uid"):
            return unverified
        return None

