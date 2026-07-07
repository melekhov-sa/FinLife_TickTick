"""
AI operations parser — единый сервис распознавания финансовых событий.

Вход: свободный текст (фраза, быстрая запись, банковская SMS).
Выход: список предложенных операций (никогда не сохраняет сам).

Пайплайн:
1. SMS-регэкспы (типовые банковские форматы) — быстро и без LLM.
2. LLM (OpenAI-compatible через app.infrastructure.ai) — свободный текст,
   строгий JSON, выбор ТОЛЬКО из справочников юзера.
3. Пост-валидация: выдуманные id отбрасываются, merchant_rules повышают
   уверенность, кошелёк матчится по номеру счёта/карты и по остатку.
"""
import json
import logging
import re
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.config import get_settings
from app.infrastructure.db.models import (
    WalletBalance, CategoryInfo, GoalInfo, SubscriptionModel,
    MerchantRule, WalletBankRef, TransactionFeed,
)

logger = logging.getLogger(__name__)

CONFIDENCE_HIGH = "high"      # распознано уверенно
CONFIDENCE_MEDIUM = "medium"  # рекомендуется проверить
CONFIDENCE_LOW = "low"        # недостаточно информации


# ── Reference data ────────────────────────────────────────────────────────────

def load_user_refs(db: Session, account_id: int) -> dict:
    """Собрать справочники юзера для промпта и валидации."""
    cats = (
        db.query(CategoryInfo)
        .filter(CategoryInfo.account_id == account_id, CategoryInfo.is_archived == False)  # noqa: E712
        .all()
    )
    wallets = (
        db.query(WalletBalance)
        .filter(WalletBalance.account_id == account_id, WalletBalance.is_archived == False)  # noqa: E712
        .all()
    )
    goals = (
        db.query(GoalInfo)
        .filter(GoalInfo.account_id == account_id, GoalInfo.is_archived == False)  # noqa: E712
        .all()
    )
    subs = (
        db.query(SubscriptionModel)
        .filter(SubscriptionModel.account_id == account_id, SubscriptionModel.is_archived == False)  # noqa: E712
        .all()
    )
    rules = (
        db.query(MerchantRule)
        .filter(MerchantRule.account_id == account_id)
        .order_by(MerchantRule.hits.desc())
        .limit(200)
        .all()
    )
    bank_refs = (
        db.query(WalletBankRef)
        .filter(WalletBankRef.account_id == account_id)
        .all()
    )
    return {
        "categories": [
            {"id": c.category_id, "title": c.title, "kind": c.category_type}
            for c in cats
        ],
        "wallets": [
            {
                "id": w.wallet_id, "title": w.title, "type": w.wallet_type,
                "currency": w.currency, "balance": str(w.balance),
            }
            for w in wallets
        ],
        "goals": [{"id": g.goal_id, "title": g.title} for g in goals],
        "subscriptions": [{"id": s.id, "title": s.name} for s in subs],
        "merchant_rules": [
            {
                "merchant": r.merchant_key, "category_id": r.category_id,
                "wallet_id": r.wallet_id, "hits": r.hits,
            }
            for r in rules
        ],
        "bank_refs": [
            {"wallet_id": b.wallet_id, "ref_type": b.ref_type, "digits": b.ref_digits}
            for b in bank_refs
        ],
    }


# ── SMS rules engine (before LLM) ─────────────────────────────────────────────

# «СЧЁТ2670 13:56 Покупка 75р GORZDRAV_3986_P_QR Баланс: 6707.53р»
_SMS_RE = re.compile(
    r"(?:СЧ[ЁЕ]Т|\*)\s*(?P<acct>\d{2,6}).{0,20}?"
    r"(?P<op>Покупка|Оплата|Списание|Перевод|Пополнение|Зачисление|Выдача)\s+"
    r"(?P<amount>[\d\s]+(?:[.,]\d{1,2})?)\s*(?:р|руб|₽|RUB)\b"
    r"(?:\s+(?P<merchant>[A-Za-zА-Яа-я0-9_.\-* ]{2,40}?))?"
    r"(?:\s+Баланс:?\s*(?P<balance>[\d\s]+(?:[.,]\d{1,2})?)\s*(?:р|руб|₽|RUB))?",
    re.IGNORECASE | re.DOTALL,
)

_INCOME_OPS = {"пополнение", "зачисление"}


def _to_decimal(raw: str) -> Decimal | None:
    try:
        return Decimal(raw.replace(" ", "").replace(" ", "").replace(",", "."))
    except (InvalidOperation, AttributeError):
        return None


def try_parse_bank_sms(text: str) -> dict | None:
    """Попробовать распознать банковскую SMS правилами. None — не SMS-формат."""
    m = _SMS_RE.search(text)
    if not m:
        return None
    amount = _to_decimal(m.group("amount"))
    if amount is None or amount <= 0:
        return None
    op_word = (m.group("op") or "").lower()
    merchant = (m.group("merchant") or "").strip().strip("_").strip()
    balance = _to_decimal(m.group("balance") or "")
    return {
        "operation_type": "INCOME" if op_word in _INCOME_OPS else "EXPENSE",
        "amount": str(amount),
        "merchant": merchant or None,
        "acct_digits": m.group("acct"),
        "balance_after": str(balance) if balance is not None else None,
        "description": merchant or op_word.capitalize(),
    }


# ── LLM engine ────────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
Ты — парсер финансовых операций. Пользователь пишет свободный текст на русском \
(одна или несколько операций, быстрые записи вида «кофе 320», банковские SMS).

Верни СТРОГО JSON-объект вида:
{"operations": [{
  "operation_type": "INCOME"|"EXPENSE"|"TRANSFER",
  "amount": "число строкой",
  "description": "краткое описание по-русски",
  "occurred_at": "YYYY-MM-DD" | null,
  "category_id": int | null,
  "category_alternatives": [int, ...],
  "wallet_id": int | null,
  "to_goal_id": int | null,
  "merchant": "ключ продавца из текста, lowercase" | null,
  "confidence": "high"|"medium"|"low",
  "reason": "1 короткое предложение, почему выбраны категория/кошелёк"
}]}

Правила:
- category_id, wallet_id, to_goal_id выбирай ТОЛЬКО из справочников ниже. \
Никогда не выдумывай id. Не уверен — ставь null и перечисли до 3 \
category_alternatives.
- «перевёл/отложил на накопления/цель X» → TRANSFER, to_goal_id цели X.
- merchant_rules — подтверждённые ранее решения пользователя: если merchant \
совпадает, бери его category_id и ставь confidence high.
- Даты: «вчера», «позавчера», «в пятницу» считай от сегодняшней даты \
(указана ниже). Нет упоминания даты — null.
- Суммы: «1.8к», «1 800», «1800р» → "1800".
- Доход только при явных словах (зарплата, премия, вернули, кэшбек, пополнение).
- confidence: high — сумма и категория однозначны; medium — категория \
предположительна; low — не хватает данных (нет суммы и т.п.).
"""


def _llm_parse(text: str, refs: dict, api_key: str, today_iso: str) -> list[dict]:
    from app.infrastructure.ai import get_openai_client

    user_msg = (
        f"Сегодня: {today_iso}\n\n"
        f"Справочники пользователя:\n{json.dumps(refs, ensure_ascii=False)}\n\n"
        f"Текст:\n{text}"
    )
    client = get_openai_client(api_key, timeout=30.0)
    response = client.chat.completions.create(
        model=get_settings().OPENAI_MODEL,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        max_tokens=1500,
        temperature=0.1,
        response_format={"type": "json_object"},
    )
    raw = response.choices[0].message.content or "{}"
    data = json.loads(raw)
    ops = data.get("operations", [])
    return ops if isinstance(ops, list) else []


# ── Validation & enrichment ───────────────────────────────────────────────────

def _validate_and_enrich(ops: list[dict], refs: dict) -> list[dict]:
    cat_ids = {c["id"] for c in refs["categories"]}
    wallet_ids = {w["id"] for w in refs["wallets"]}
    goal_ids = {g["id"] for g in refs["goals"]}
    rules_by_merchant = {r["merchant"]: r for r in refs["merchant_rules"]}

    out: list[dict] = []
    for op in ops:
        if not isinstance(op, dict):
            continue
        amount = _to_decimal(str(op.get("amount", "")))
        op_type = op.get("operation_type")
        if op_type not in ("INCOME", "EXPENSE", "TRANSFER"):
            op_type = "EXPENSE"
        clean = {
            "operation_type": op_type,
            "amount": str(amount) if amount and amount > 0 else None,
            "description": str(op.get("description") or "")[:512],
            "occurred_at": op.get("occurred_at") or None,
            "category_id": op.get("category_id"),
            "category_alternatives": op.get("category_alternatives") or [],
            "wallet_id": op.get("wallet_id"),
            "to_goal_id": op.get("to_goal_id"),
            "merchant": (op.get("merchant") or None),
            "confidence": op.get("confidence", CONFIDENCE_MEDIUM),
            "reason": str(op.get("reason") or "")[:300],
        }
        # Выдуманные id → null (никогда не доверяем LLM без проверки)
        if clean["category_id"] not in cat_ids:
            clean["category_id"] = None
        clean["category_alternatives"] = [
            c for c in clean["category_alternatives"] if c in cat_ids
        ][:3]
        if clean["wallet_id"] not in wallet_ids:
            clean["wallet_id"] = None
        if clean["to_goal_id"] not in goal_ids:
            clean["to_goal_id"] = None

        # merchant_rules: подтверждённое решение важнее догадки LLM
        mkey = (clean["merchant"] or "").lower().strip()
        rule = rules_by_merchant.get(mkey)
        if rule:
            if rule.get("category_id") in cat_ids:
                clean["category_id"] = rule["category_id"]
                clean["confidence"] = CONFIDENCE_HIGH
                clean["reason"] = (
                    f"Ранее операции «{mkey}» подтверждались с этой категорией "
                    f"({rule['hits']} раз)."
                )
            if rule.get("wallet_id") in wallet_ids and clean["wallet_id"] is None:
                clean["wallet_id"] = rule["wallet_id"]

        # Нет суммы — только low
        if clean["amount"] is None:
            clean["confidence"] = CONFIDENCE_LOW
        elif clean["category_id"] is None and clean["operation_type"] != "TRANSFER":
            clean["confidence"] = (
                CONFIDENCE_LOW if clean["confidence"] == CONFIDENCE_LOW else CONFIDENCE_MEDIUM
            )
        out.append(clean)
    return out


def _match_wallet_by_refs(
    sms: dict, refs: dict
) -> tuple[int | None, str | None]:
    """Кошелёк по номеру счёта/карты из SMS, затем сверка по остатку."""
    digits = sms.get("acct_digits")
    if digits:
        for b in refs["bank_refs"]:
            if b["digits"] == digits:
                return b["wallet_id"], f"Номер {b['ref_type']} …{digits} привязан к кошельку."
    balance_after = _to_decimal(sms.get("balance_after") or "")
    if balance_after is not None:
        for w in refs["wallets"]:
            wb = _to_decimal(w["balance"])
            if wb is not None and abs(wb - balance_after) < Decimal("0.01"):
                return w["id"], "Остаток из SMS совпал с балансом кошелька."
    return None, None


def _flag_duplicates(
    db: Session, account_id: int, proposals: list[dict], today
) -> None:
    """Пометить предложения, похожие на уже существующие операции
    (та же сумма, тот же тип, дата в пределах ±3 дней)."""
    for op in proposals:
        amount = _to_decimal(op.get("amount") or "")
        if amount is None:
            continue
        try:
            op_date = (
                datetime.fromisoformat(op["occurred_at"]).date()
                if op.get("occurred_at") else today
            )
        except (ValueError, TypeError):
            op_date = today
        existing = (
            db.query(TransactionFeed)
            .filter(
                TransactionFeed.account_id == account_id,
                TransactionFeed.operation_type == op["operation_type"],
                TransactionFeed.amount == amount,
                TransactionFeed.occurred_at >= datetime.combine(
                    op_date - timedelta(days=3), datetime.min.time()
                ),
                TransactionFeed.occurred_at <= datetime.combine(
                    op_date + timedelta(days=3), datetime.max.time()
                ),
            )
            .order_by(TransactionFeed.occurred_at.desc())
            .first()
        )
        if existing:
            desc = (existing.description or "").strip() or "без описания"
            op["duplicate_hint"] = (
                f"Похожая операция уже есть: {existing.occurred_at.date().isoformat()}, "
                f"{amount} — «{desc[:60]}»"
            )
        else:
            op["duplicate_hint"] = None


# ── Public API ────────────────────────────────────────────────────────────────

def parse_operations(
    db: Session, account_id: int, text: str, api_key: str | None
) -> dict:
    """Разобрать текст в предложенные операции. Возвращает dict для ответа API."""
    refs = load_user_refs(db, account_id)
    tz = ZoneInfo(get_settings().TIMEZONE)
    today = datetime.now(tz).date()

    engine = "llm"
    proposals: list[dict] = []

    # 1) Правила: банковская SMS
    sms = try_parse_bank_sms(text)
    if sms is not None:
        engine = "rules"
        wallet_id, wallet_reason = _match_wallet_by_refs(sms, refs)
        merchant = (sms.get("merchant") or "").lower().strip() or None
        proposal = {
            "operation_type": sms["operation_type"],
            "amount": sms["amount"],
            "description": sms["description"],
            "occurred_at": today.isoformat(),
            "category_id": None,
            "category_alternatives": [],
            "wallet_id": wallet_id,
            "to_goal_id": None,
            "merchant": merchant,
            "confidence": CONFIDENCE_MEDIUM,
            "reason": wallet_reason or "Распознано из банковской SMS.",
        }
        proposals = _validate_and_enrich([proposal], refs)
        # merchant_rules могли поднять уверенность и категорию; иначе — LLM
        # может докатегоризовать (если ключ настроен)
        if proposals and proposals[0]["category_id"] is None and api_key:
            try:
                llm_ops = _llm_parse(text, refs, api_key, today.isoformat())
                enriched = _validate_and_enrich(llm_ops, refs)
                if enriched and enriched[0].get("category_id") is not None:
                    proposals[0]["category_id"] = enriched[0]["category_id"]
                    proposals[0]["category_alternatives"] = enriched[0]["category_alternatives"]
                    proposals[0]["reason"] = enriched[0]["reason"] or proposals[0]["reason"]
                    engine = "mixed"
            except Exception:
                logger.exception("LLM enrichment for SMS failed — keeping rules result")
    else:
        # 2) LLM: свободный текст
        if not api_key:
            return {
                "engine": "none",
                "proposals": [],
                "error": "ИИ-ключ не настроен (Настройки → Админ → OpenAI key).",
            }
        llm_ops = _llm_parse(text, refs, api_key, today.isoformat())
        proposals = _validate_and_enrich(llm_ops, refs)

    _flag_duplicates(db, account_id, proposals, today)
    return {"engine": engine, "proposals": proposals, "error": None}


def learn_from_confirmation(
    db: Session, account_id: int, confirmed_ops: list[dict]
) -> int:
    """Самообучение: upsert merchant_rules по подтверждённым операциям."""
    learned = 0
    now = datetime.now(ZoneInfo(get_settings().TIMEZONE))
    for op in confirmed_ops:
        mkey = (op.get("merchant") or "").lower().strip()
        cat_id = op.get("category_id")
        if not mkey or not cat_id:
            continue
        rule = (
            db.query(MerchantRule)
            .filter(
                MerchantRule.account_id == account_id,
                MerchantRule.merchant_key == mkey,
            )
            .first()
        )
        if rule:
            if rule.category_id == cat_id:
                rule.hits += 1
            else:
                # юзер выбрал другую категорию — правило переучивается
                rule.category_id = cat_id
                rule.hits = 1
            if op.get("wallet_id"):
                rule.wallet_id = op["wallet_id"]
            rule.last_used_at = now
        else:
            db.add(MerchantRule(
                account_id=account_id,
                merchant_key=mkey[:128],
                category_id=cat_id,
                wallet_id=op.get("wallet_id"),
                hits=1,
                last_used_at=now,
            ))
        learned += 1
    return learned
