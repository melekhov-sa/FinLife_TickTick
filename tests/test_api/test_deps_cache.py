"""Tests for JWT token TTL cache in deps.py."""
import hashlib
import time
from unittest.mock import patch, MagicMock

import pytest

import app.api.v2.deps as deps_module


def test_cache_hit_calls_uncached_only_once():
    deps_module._TOKEN_CACHE.clear()
    token = "fake-header.fake-payload.fake-sig"
    with patch.object(deps_module, "_get_email_from_token_uncached", return_value="user@example.com") as mock_fn:
        result1 = deps_module._get_email_from_token(token)
        result2 = deps_module._get_email_from_token(token)
    assert result1 == "user@example.com"
    assert result2 == "user@example.com"
    mock_fn.assert_called_once()


def test_cache_expiry_re_hits_uncached():
    deps_module._TOKEN_CACHE.clear()
    token = "fake-header.fake-payload.fake-sig"
    key = hashlib.sha256(token.encode()).hexdigest()
    # Manually set an already-expired cache entry
    deps_module._TOKEN_CACHE[key] = ("old@example.com", time.time() - 1)

    with patch.object(deps_module, "_get_email_from_token_uncached", return_value="new@example.com") as mock_fn:
        result = deps_module._get_email_from_token(token)

    assert result == "new@example.com"
    mock_fn.assert_called_once()
