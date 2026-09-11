"""
Password hashing and verification utilities.

Uses Python standard library hashlib.pbkdf2_hmac with random salt.
Requires zero external binary dependencies and works across all platforms.
"""

import hashlib
import secrets


def hash_password(password: str) -> str:
    """Hash a password using salted PBKDF2-HMAC-SHA256."""
    salt = secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        35_000,
    ).hex()
    return f"{salt}${hashed}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against the stored salt$hash string."""
    try:
        if not hashed_password or "$" not in hashed_password:
            return False
        salt, expected_hash = hashed_password.split("$", 1)
        # Check current standard (35,000 iterations)
        test_hash = hashlib.pbkdf2_hmac(
            "sha256",
            plain_password.encode("utf-8"),
            salt.encode("utf-8"),
            35_000,
        ).hex()
        if secrets.compare_digest(test_hash, expected_hash):
            return True
        # Backwards-compatible check for legacy (100,000 iterations)
        legacy_hash = hashlib.pbkdf2_hmac(
            "sha256",
            plain_password.encode("utf-8"),
            salt.encode("utf-8"),
            100_000,
        ).hex()
        return secrets.compare_digest(legacy_hash, expected_hash)
    except Exception:
        return False
