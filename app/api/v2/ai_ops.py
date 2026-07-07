"""
POST   /api/v2/ai-ops/parse              — разобрать текст в предложенные операции
POST   /api/v2/ai-ops/{parse_id}/resolve — зафиксировать итог (что сохранил юзер) + самообучение
GET    /api/v2/ai-ops/bank-refs          — привязки счетов/карт к кошелькам
POST   /api/v2/ai-ops/bank-refs          — добавить привязку
DELETE /api/v2/ai-ops/bank-refs/{ref_id} — удалить привязку

ИИ никогда не сохраняет операции сам: сохранение делает фронт обычным
POST /api/v2/transactions после подтверждения пользователем.
"""
import json
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.v2.deps import get_user_id
from app.infrastructure.db.models import AiParseLog, WalletBankRef, WalletBalance
from app.infrastructure.db.session import get_db
from app.application.app_config import get_openai_key
from app.application.ai_ops_parser import parse_operations, learn_from_confirmation
from app.config import get_settings

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class ParseRequest(BaseModel):
    text: str


class ProposalOut(BaseModel):
    operation_type: str
    amount: str | None
    description: str
    occurred_at: str | None
    category_id: int | None
    category_alternatives: list[int]
    wallet_id: int | None
    to_goal_id: int | None
    merchant: str | None
    confidence: str
    reason: str


class ParseResponse(BaseModel):
    parse_id: int | None
    engine: str
    proposals: list[ProposalOut]
    error: str | None = None


class ResolvedOp(BaseModel):
    """Операция в том виде, в котором юзер её сохранил (или отклонил)."""
    operation_type: str
    amount: str | None = None
    description: str = ""
    category_id: int | None = None
    wallet_id: int | None = None
    to_goal_id: int | None = None
    merchant: str | None = None
    saved: bool = True            # false — юзер исключил операцию
    transaction_id: int | None = None


class ResolveRequest(BaseModel):
    ops: list[ResolvedOp]
    discarded: bool = False       # юзер закрыл всё без сохранения


class BankRefCreate(BaseModel):
    wallet_id: int
    ref_type: str                 # ACCOUNT | CARD
    ref_digits: str               # последние цифры, как в SMS


class BankRefOut(BaseModel):
    id: int
    wallet_id: int
    wallet_title: str
    ref_type: str
    ref_digits: str


# ── Parse ─────────────────────────────────────────────────────────────────────

@router.post("/ai-ops/parse", response_model=ParseResponse)
def parse_text(
    body: ParseRequest,
    account_id: int = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Пустой текст")
    if len(text) > 4000:
        raise HTTPException(status_code=422, detail="Текст слишком длинный (макс. 4000 символов)")

    api_key = get_openai_key(db)
    result = parse_operations(db, account_id, text, api_key)

    parse_id: int | None = None
    if result["proposals"]:
        log = AiParseLog(
            account_id=account_id,
            source_text=text[:4000],
            proposals_json=json.dumps(result["proposals"], ensure_ascii=False),
            engine=result["engine"],
        )
        db.add(log)
        db.commit()
        db.refresh(log)
        parse_id = log.id

    return ParseResponse(
        parse_id=parse_id,
        engine=result["engine"],
        proposals=result["proposals"],
        error=result.get("error"),
    )


# ── Resolve (итог + самообучение) ────────────────────────────────────────────

@router.post("/ai-ops/{parse_id}/resolve")
def resolve_parse(
    parse_id: int,
    body: ResolveRequest,
    account_id: int = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    log = (
        db.query(AiParseLog)
        .filter(AiParseLog.id == parse_id, AiParseLog.account_id == account_id)
        .first()
    )
    if not log:
        raise HTTPException(status_code=404, detail="Разбор не найден")

    ops_dicts = [op.model_dump() for op in body.ops]
    log.final_json = json.dumps(ops_dicts, ensure_ascii=False)
    log.status = "DISCARDED" if body.discarded else "RESOLVED"
    log.resolved_at = datetime.now(ZoneInfo(get_settings().TIMEZONE))

    learned = 0
    if not body.discarded:
        confirmed = [op for op in ops_dicts if op.get("saved")]
        learned = learn_from_confirmation(db, account_id, confirmed)

    db.commit()
    return {"ok": True, "learned_rules": learned}


# ── Bank refs (привязки счетов/карт) ─────────────────────────────────────────

@router.get("/ai-ops/bank-refs", response_model=list[BankRefOut])
def list_bank_refs(
    account_id: int = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(WalletBankRef, WalletBalance)
        .outerjoin(WalletBalance, WalletBalance.wallet_id == WalletBankRef.wallet_id)
        .filter(WalletBankRef.account_id == account_id)
        .order_by(WalletBankRef.id)
        .all()
    )
    return [
        BankRefOut(
            id=r.id,
            wallet_id=r.wallet_id,
            wallet_title=w.title if w else "—",
            ref_type=r.ref_type,
            ref_digits=r.ref_digits,
        )
        for r, w in rows
    ]


@router.post("/ai-ops/bank-refs", response_model=BankRefOut)
def create_bank_ref(
    body: BankRefCreate,
    account_id: int = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    ref_type = body.ref_type.upper()
    if ref_type not in ("ACCOUNT", "CARD"):
        raise HTTPException(status_code=422, detail="ref_type: ACCOUNT или CARD")
    digits = "".join(ch for ch in body.ref_digits if ch.isdigit())
    if not (2 <= len(digits) <= 8):
        raise HTTPException(status_code=422, detail="Нужны 2–8 цифр номера")

    wallet = (
        db.query(WalletBalance)
        .filter(
            WalletBalance.account_id == account_id,
            WalletBalance.wallet_id == body.wallet_id,
        )
        .first()
    )
    if not wallet:
        raise HTTPException(status_code=404, detail="Кошелёк не найден")

    existing = (
        db.query(WalletBankRef)
        .filter(
            WalletBankRef.account_id == account_id,
            WalletBankRef.ref_digits == digits,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Этот номер уже привязан")

    ref = WalletBankRef(
        account_id=account_id,
        wallet_id=body.wallet_id,
        ref_type=ref_type,
        ref_digits=digits,
    )
    db.add(ref)
    db.commit()
    db.refresh(ref)
    return BankRefOut(
        id=ref.id,
        wallet_id=ref.wallet_id,
        wallet_title=wallet.title,
        ref_type=ref.ref_type,
        ref_digits=ref.ref_digits,
    )


@router.delete("/ai-ops/bank-refs/{ref_id}")
def delete_bank_ref(
    ref_id: int,
    account_id: int = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    ref = (
        db.query(WalletBankRef)
        .filter(WalletBankRef.id == ref_id, WalletBankRef.account_id == account_id)
        .first()
    )
    if not ref:
        raise HTTPException(status_code=404, detail="Привязка не найдена")
    db.delete(ref)
    db.commit()
    return {"ok": True}
