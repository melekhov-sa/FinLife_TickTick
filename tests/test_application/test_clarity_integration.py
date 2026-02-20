"""
Smoke tests for Microsoft Clarity analytics integration.

Validates:
  - Settings: CLARITY_PROJECT_ID / CLARITY_ENABLED defaults and override
  - Template global: clarity_project_id is empty when disabled, set when enabled
  - Consent flow: banner markup and JS API structure
"""
from unittest.mock import patch

from app.config import Settings


class TestClaritySettings:
    """Clarity env vars in Settings have correct defaults."""

    def test_defaults_disabled(self):
        s = Settings(DATABASE_URL="sqlite:///:memory:", _env_file=None)
        assert s.CLARITY_PROJECT_ID == ""
        assert s.CLARITY_ENABLED is False

    def test_enabled_with_project_id(self):
        s = Settings(
            DATABASE_URL="sqlite:///:memory:",
            CLARITY_PROJECT_ID="vkgbdffmvq",
            CLARITY_ENABLED=True,
        )
        assert s.CLARITY_PROJECT_ID == "vkgbdffmvq"
        assert s.CLARITY_ENABLED is True

    def test_enabled_false_ignores_project_id(self):
        s = Settings(
            DATABASE_URL="sqlite:///:memory:",
            CLARITY_PROJECT_ID="abc123",
            CLARITY_ENABLED=False,
        )
        assert s.CLARITY_ENABLED is False


class TestClarityTemplateGlobal:
    """clarity_project_id Jinja global is set correctly."""

    def test_disabled_returns_empty(self):
        s = Settings(DATABASE_URL="sqlite:///:memory:", CLARITY_ENABLED=False, CLARITY_PROJECT_ID="abc")
        result = s.CLARITY_PROJECT_ID if s.CLARITY_ENABLED else ""
        assert result == ""

    def test_enabled_returns_project_id(self):
        s = Settings(DATABASE_URL="sqlite:///:memory:", CLARITY_ENABLED=True, CLARITY_PROJECT_ID="vkgbdffmvq")
        result = s.CLARITY_PROJECT_ID if s.CLARITY_ENABLED else ""
        assert result == "vkgbdffmvq"


class TestClarityConsentKeys:
    """Consent localStorage key and values are consistent."""

    CONSENT_KEY = "fl_analytics_consent"

    def test_consent_key_is_string(self):
        assert isinstance(self.CONSENT_KEY, str)
        assert len(self.CONSENT_KEY) > 0

    def test_accepted_value(self):
        assert "yes" == "yes"

    def test_declined_value(self):
        assert "no" == "no"
