"""Tests for OpenAI key encryption in app_config."""
import pytest
from app.application.app_config import set_openai_key, get_openai_key, get_config, set_config, OPENAI_KEY


def test_stored_value_is_encrypted(db_session):
    set_openai_key(db_session, "sk-test-12345")
    raw = get_config(db_session, OPENAI_KEY)
    assert raw is not None
    assert raw.startswith("enc:")


def test_get_openai_key_decrypts(db_session):
    set_openai_key(db_session, "sk-test-12345")
    result = get_openai_key(db_session)
    assert result == "sk-test-12345"


def test_set_openai_key_none_clears(db_session):
    set_openai_key(db_session, "sk-test-12345")
    set_openai_key(db_session, None)
    raw = get_config(db_session, OPENAI_KEY)
    assert raw is None


def test_legacy_plaintext_passthrough(db_session):
    # Write a legacy plaintext value directly (no "enc:" prefix)
    set_config(db_session, OPENAI_KEY, "sk-legacy-plain")
    result = get_openai_key(db_session)
    assert result == "sk-legacy-plain"
