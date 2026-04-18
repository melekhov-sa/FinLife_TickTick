"""
AI commentary client for weekly digests.

All OpenAI-compatible calls go through a single factory (`get_openai_client`)
so `base_url` and retry/timeout policy are configured in one place.

Defaults to AITunnel (https://api.aitunnel.ru/v1/), an OpenAI-compatible
proxy reachable from Russia. Override via OPENAI_BASE_URL to hit OpenAI
directly.

`generate_digest_comment` returns None gracefully when the key is absent
or any error occurs — the digest works fine without AI commentary.
"""
import json
import logging
import time

logger = logging.getLogger(__name__)

_PROMPT_TEMPLATE = """\
Ты тренер по продуктивности. На основе этих метрик недели напиши 2-3 абзаца краткого, конкретного и мотивирующего комментария на русском. Без воды, без клише, с конкретикой и рекомендацией на следующую неделю.

Данные: {payload_json}"""


def get_openai_client(api_key: str, *, timeout: float = 15.0):
    """
    Return a configured OpenAI client.

    base_url is read from settings (OPENAI_BASE_URL). For AITunnel this is
    https://api.aitunnel.ru/v1/ — OpenAI-compatible, so all call sites work
    unchanged.
    """
    from openai import OpenAI
    from app.config import get_settings
    base_url = get_settings().OPENAI_BASE_URL
    logger.info("OpenAI client: base_url=%s timeout=%s", base_url, timeout)
    return OpenAI(api_key=api_key, base_url=base_url, timeout=timeout)


def _resolve_key(api_key: str | None) -> str | None:
    """Explicit arg takes precedence; fall back to env."""
    if api_key:
        return api_key
    from app.config import get_settings
    env_val = get_settings().OPENAI_API_KEY
    return env_val if env_val else None


def _chat_completion_with_retry(
    client,
    model: str,
    messages: list,
    *,
    max_tokens: int,
    temperature: float = 0.7,
    attempts: int = 2,
):
    """Call chat.completions.create with a single retry on transient failures."""
    last_exc = None
    for attempt in range(1, attempts + 1):
        try:
            logger.info("OpenAI chat completion: model=%s attempt=%s/%s", model, attempt, attempts)
            return client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
            )
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            logger.warning("OpenAI call failed (attempt %s/%s): %s", attempt, attempts, exc)
            if attempt < attempts:
                time.sleep(0.5 * attempt)
    raise last_exc  # type: ignore[misc]


def generate_digest_comment(payload: dict, api_key: str | None = None) -> str | None:
    """
    Generate an AI commentary for the digest payload.

    Returns a Russian-language string with 2-3 paragraphs, or None if no
    key is configured or the call fails after retries. Never raises.
    """
    key = _resolve_key(api_key)
    if not key:
        return None

    try:
        from app.config import get_settings
        model = get_settings().OPENAI_MODEL
        client = get_openai_client(key)
        prompt = _PROMPT_TEMPLATE.format(
            payload_json=json.dumps(payload, ensure_ascii=False, indent=2)
        )
        response = _chat_completion_with_retry(
            client,
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=600,
        )
        text = response.choices[0].message.content
        return text.strip() if text else None
    except Exception:
        logger.exception("AI digest comment generation failed — continuing without commentary")
        return None


def ping(api_key: str | None = None) -> dict:
    """
    Health-check: send a 'ping' to the configured OpenAI-compatible endpoint.

    Returns {"ok": bool, "model": str | None, "error": str | None}.
    """
    key = _resolve_key(api_key)
    if not key:
        return {"ok": False, "model": None, "error": "OpenAI API key is not configured"}
    try:
        from app.config import get_settings
        model = get_settings().OPENAI_MODEL
        client = get_openai_client(key, timeout=10.0)
        response = _chat_completion_with_retry(
            client,
            model=model,
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=5,
            attempts=2,
        )
        return {"ok": True, "model": response.model, "error": None}
    except Exception as exc:
        logger.warning("OpenAI ping failed: %s", exc)
        return {"ok": False, "model": None, "error": str(exc)}
