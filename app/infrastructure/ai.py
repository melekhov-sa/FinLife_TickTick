"""
AI commentary client for weekly digests.

Uses OpenAI API when OPENAI_API_KEY is set.
Returns None gracefully when the key is absent or any error occurs —
the digest works fine without AI commentary.
"""
import json
import logging

logger = logging.getLogger(__name__)

_PROMPT_TEMPLATE = """\
Ты тренер по продуктивности. На основе этих метрик недели напиши 2-3 абзаца краткого, конкретного и мотивирующего комментария на русском. Без воды, без клише, с конкретикой и рекомендацией на следующую неделю.

Данные: {payload_json}"""


def generate_digest_comment(payload: dict) -> str | None:
    """
    Generate an AI commentary for the digest payload.

    Returns a Russian-language string with 2-3 paragraphs, or None if:
    - OPENAI_API_KEY is not set in the environment
    - The API call fails for any reason
    """
    from app.config import get_settings
    settings = get_settings()

    if not settings.OPENAI_API_KEY:
        return None

    try:
        from openai import OpenAI
        client = OpenAI(api_key=settings.OPENAI_API_KEY, timeout=15.0)
        prompt = _PROMPT_TEMPLATE.format(
            payload_json=json.dumps(payload, ensure_ascii=False, indent=2)
        )
        response = client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=600,
            temperature=0.7,
        )
        text = response.choices[0].message.content
        return text.strip() if text else None
    except Exception:
        logger.exception("AI digest comment generation failed — continuing without commentary")
        return None
