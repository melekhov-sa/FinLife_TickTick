"""Tests for config.py hardening (required fields, sentinel guard)."""
import importlib
import os
import pytest
from pydantic import ValidationError


def _reload_settings_module():
    import app.config as cfg
    cfg.get_settings.cache_clear()
    importlib.reload(cfg)
    return cfg


def test_settings_requires_database_url_and_secret_key(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("SECRET_KEY", raising=False)
    cfg = _reload_settings_module()
    with pytest.raises(ValidationError):
        cfg.Settings(_env_file=None)


def test_sentinel_database_url_raises_runtime_error():
    """create_app() raises RuntimeError when DATABASE_URL contains the known insecure sentinel."""
    import app.config as cfg

    # Build a settings object with the sentinel DATABASE_URL explicitly
    sentinel_settings = cfg.Settings(
        DATABASE_URL="postgresql://finlife:finlife_password_change_me@localhost:5432/finlife",
        SECRET_KEY="some-safe-secret-that-is-long-enough",
        _env_file=None,
    )

    # Patch get_settings to return the sentinel settings object, then call create_app
    original_cache = cfg.get_settings.cache_clear
    cfg.get_settings.cache_clear()
    original_fn = cfg.get_settings.__wrapped__ if hasattr(cfg.get_settings, "__wrapped__") else None

    import unittest.mock as mock
    with mock.patch("app.main.get_settings", return_value=sentinel_settings):
        import app.main as main_module
        with pytest.raises(RuntimeError, match="FATAL"):
            main_module.create_app()
