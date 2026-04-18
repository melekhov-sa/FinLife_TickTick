"""
AI commentary client for weekly digests.

Uses OpenAI API when an api_key is provided (DB override or .env fallback).
Returns None gracefully when the key is absent or any error occurs —
the digest works fine without AI commentary.
"""
import json
import logging

logger = logging.getLogger(__name__)

_PROMPT_TEMPLATE = """\
Ты тренер по продуктивности. На основе этих метрик недели напиши 2-3 абзаца краткого, конкретного и мотивирующего комментария на русском. Без воды, без клише, с конкретикой и рекомендацией на следующую неделю.

Данные: {payload_json}"""


def generate_digest_comment(payload: dict, api_key: str | None = None) -> str | None:
    """
    Generate an AI commentary for the digest payload.

    Args:
        payload: The digest metrics dictionary.
        api_key: OpenAI API key. If None, falls back to OPENAI_API_KEY env var.

    Returns a Russian-language string with 2-3 paragraphs, or None if:
    - No API key is available
    - The API call fails for any reason
    """
    # Resolve key: explicit arg first, then .env fallback
    key = api_key
    if not key:
        from app.config import get_settings
        key = get_settings().OPENAI_API_KEY or None

    if not key:
        return None

    try:
        from openai import OpenAI
        from app.config import get_settings
        model = get_settings().OPENAI_MODEL
        client = OpenAI(api_key=key, timeout=15.0)
        prompt = _PROMPT_TEMPLATE.format(
            payload_json=json.dumps(payload, ensure_ascii=False, indent=2)
        )
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=600,
            temperature=0.7,
        )
        text = response.choices[0].message.content
        return text.strip() if text else None
    except Exception:
        logger.exception("AI digest comment generation failed — continuing without commentary")
        return None
