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


def verify_firebase_token(id_token: str) -> dict[str, Any] | None:
    """
    Verify a Firebase ID token.

    Returns the decoded token dict if valid, None if invalid.
    In dev mode (no Firebase credentials), returns a mock decoded token.
    """
    if not _init_firebase():
        # DEV MODE: return a mock token with the token string as UID
        logger.debug("DEV MODE: Skipping Firebase token verification")
        return {"uid": id_token, "phone_number": None}

    try:
        from firebase_admin import auth  # type: ignore

        decoded = auth.verify_id_token(id_token)
        return decoded
    except Exception as e:
        logger.warning(f"Firebase token verification failed: {e}")
        return None
