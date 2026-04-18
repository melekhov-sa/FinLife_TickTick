"""Shared file-handling utilities (MIME detection, etc.)."""

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
