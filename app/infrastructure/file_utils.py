"""Shared file-handling utilities (MIME detection, etc.)."""
import logging
import time as _time
from pathlib import Path

_log = logging.getLogger(__name__)

# Magic byte signatures for file type detection.
# Order matters: more specific signatures first.
_MAGIC_SIGS: list[tuple[bytes, str]] = [
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
    (b"RIFF", "image/webp"),  # RIFF....WEBP
    (b"%PDF", "application/pdf"),
    (b"PK\x03\x04", "application/zip"),  # also docx/xlsx
]


def user_upload_total_bytes(user_id: int, uploads_dir: Path) -> int:
    """Recursively sum bytes under uploads_dir/<user_id>/"""
    user_dir = uploads_dir / str(user_id)
    if not user_dir.exists():
        return 0
    t0 = _time.monotonic()
    total = 0
    for p in user_dir.rglob("*"):
        if p.is_file():
            total += p.stat().st_size
    elapsed_ms = (_time.monotonic() - t0) * 1000
    if elapsed_ms > 100:
        _log.warning("user_upload_total_bytes for user %s took %.0f ms", user_id, elapsed_ms)
    return total


def detect_mime(data: bytes) -> str | None:
    """Detect MIME type from file magic bytes. Returns None if unknown."""
    for sig, mime in _MAGIC_SIGS:
        if data[: len(sig)] == sig:
            if sig == b"RIFF" and b"WEBP" not in data[:16]:
                continue
            if sig == b"PK\x03\x04":
                # ZIP-based: could be docx, xlsx, or plain zip — all allowed
                return "application/zip"
            return mime
    # Text-like files (txt, csv) — no reliable magic, trust extension
    return None
