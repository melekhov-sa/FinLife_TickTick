"""
Field-level encryption for sensitive data (Telegram tokens, push keys).

Uses Fernet (AES-128-CBC + HMAC-SHA256) derived from SECRET_KEY.
Encrypted values are stored as base64 strings prefixed with "enc:" to
distinguish them from plaintext (allows gradual migration).
"""
import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        from app.config import get_settings
        key = get_settings().SECRET_KEY.encode()
        # Derive a 32-byte key from SECRET_KEY via SHA-256, then base64 for Fernet
        derived = base64.urlsafe_b64encode(hashlib.sha256(key).digest())
        _fernet = Fernet(derived)
    return _fernet


def encrypt(plaintext: str | None) -> str | None:
    """Encrypt a string. Returns 'enc:<base64>' or None."""
    if not plaintext:
        return plaintext
    token = _get_fernet().encrypt(plaintext.encode())
    return "enc:" + token.decode()


def decrypt(stored: str | None) -> str | None:
    """Decrypt an 'enc:...' string. Passes through plaintext for backwards compat."""
    if not stored:
        return stored
    if not stored.startswith("enc:"):
        # Legacy plaintext — return as-is
        return stored
    try:
        return _get_fernet().decrypt(stored[4:].encode()).decode()
    except InvalidToken:
        return None
