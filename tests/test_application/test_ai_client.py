"""Verify OpenAI client is built with the AITunnel base_url by default."""
import sys
import types
from unittest.mock import MagicMock


def test_settings_default_base_url_is_aitunnel():
    """OPENAI_BASE_URL default must be AITunnel so requests from RU work."""
    from app.config import Settings
    assert Settings().OPENAI_BASE_URL == "https://api.aitunnel.ru/v1/"


def test_get_openai_client_passes_base_url():
    """get_openai_client() must forward the configured base_url to OpenAI()."""
    # Inject a fake `openai` module so this test works even when the real
    # SDK is not installed in the dev venv.
    fake_openai = types.ModuleType("openai")
    fake_openai.OpenAI = MagicMock(return_value="FAKE_CLIENT")
    sys.modules["openai"] = fake_openai
    try:
        from app.infrastructure.ai import get_openai_client
        client = get_openai_client("sk-test")
        assert client == "FAKE_CLIENT"
        kwargs = fake_openai.OpenAI.call_args.kwargs
        assert kwargs["base_url"] == "https://api.aitunnel.ru/v1/"
        assert kwargs["api_key"] == "sk-test"
    finally:
        sys.modules.pop("openai", None)


def test_ping_returns_error_when_key_missing():
    """ping() returns a structured error when no key is configured."""
    from app.infrastructure.ai import ping
    from app.config import get_settings

    if get_settings().OPENAI_API_KEY:
        # Skip cleanly — dev has a key set, the no-key branch isn't reachable.
        return

    result = ping(api_key=None)
    assert result["ok"] is False
    assert result["error"] == "OpenAI API key is not configured"
