"""Flashcards API — vocabulary learning with spaced repetition."""
from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import Optional
import random

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.infrastructure.db.session import get_db
from app.infrastructure.db.models import Flashcard, FlashcardCategory, UserFlashcardProgress
from app.api.v2.deps import get_user_id

router = APIRouter(prefix="/flashcards", tags=["flashcards"])

NEW_PER_DAY = 3
PRACTICE_BATCH = 6  # cards per "extra practice" round (unlimited rounds)
DAILY_REVIEW_CAP = 12  # max due reviews in the daily lesson (keeps it short)


# ── Schemas ───────────────────────────────────────────────────────────────────

class CategoryOut(BaseModel):
    id: int
    name: str
    emoji: Optional[str]
    description: Optional[str]
    total: int
    learned: int
    skipped: int

    class Config:
        from_attributes = True


class FlashcardOut(BaseModel):
    id: int
    category_id: int
    category_name: str
    category_emoji: Optional[str]
    word: str
    short_definition: str
    simple_explanation: str
    example: str
    difficulty: int

    class Config:
        from_attributes = True


class SessionCard(BaseModel):
    id: int
    category_id: int
    category_name: str
    category_emoji: Optional[str]
    word: str
    short_definition: str
    simple_explanation: str
    example: str
    difficulty: int
    mode: str  # "learn" | "review"
    quiz_options: Optional[list[str]] = None  # 3 варианта для review


class Achievement(BaseModel):
    id: str
    name: str
    emoji: str
    description: str
    unlocked: bool


class StatsOut(BaseModel):
    total_cards: int
    learned: int
    skipped: int
    due_today: int
    new_today: int
    streak_days: int
    total_correct: int
    total_wrong: int
    accuracy: float          # 0.0–1.0
    xp: int
    level: int
    xp_in_level: int         # XP накоплено на текущем уровне
    xp_to_next: int          # XP до следующего уровня
    weak_count: int          # слова, которые даются трудно (низкая точность)
    achievements: list[Achievement]


class ReviewIn(BaseModel):
    quality: str  # "correct" | "wrong"


# ── Level & XP helpers ────────────────────────────────────────────────────────

def _level_threshold(n: int) -> int:
    """XP needed to START level n. Level 1 starts at 0."""
    return (n - 1) * n * 25


def _compute_level(xp: int) -> tuple[int, int, int]:
    """Returns (level, xp_in_level, xp_to_next)."""
    level = 1
    while True:
        next_t = _level_threshold(level + 1)
        if xp < next_t:
            cur_t = _level_threshold(level)
            return level, xp - cur_t, next_t - xp
        level += 1


_ACHIEVEMENT_DEFS = [
    ("first_word",   "Первое слово",   "🌱", "Изучил первое слово"),
    ("streak_3",     "3 дня подряд",   "🔥", "Занимался 3 дня подряд"),
    ("streak_7",     "Неделя силы",    "⚡", "7 дней занятий подряд"),
    ("streak_30",    "Железная воля",  "💎", "30 дней занятий подряд"),
    ("words_10",     "Десяточка",      "📖", "10 слов изучено"),
    ("words_50",     "Полста слов",    "🎓", "50 слов изучено"),
    ("words_100",    "Сотня",          "🏆", "100 слов изучено"),
    ("sharpshooter", "Снайпер",        "🎯", "80% правильных при 20+ ответах"),
    ("master",       "Мастер слова",   "⭐", "95% правильных при 50+ ответах"),
    ("explorer",     "Исследователь",  "🗺️", "Изучал слова из 3+ категорий"),
]


def _compute_achievements(
    learned: int, streak_days: int,
    total_correct: int, total_wrong: int,
    categories_touched: int,
) -> list[Achievement]:
    total_answers = total_correct + total_wrong
    accuracy = total_correct / total_answers if total_answers else 0.0
    checks = {
        "first_word":   learned >= 1,
        "streak_3":     streak_days >= 3,
        "streak_7":     streak_days >= 7,
        "streak_30":    streak_days >= 30,
        "words_10":     learned >= 10,
        "words_50":     learned >= 50,
        "words_100":    learned >= 100,
        "sharpshooter": total_answers >= 20 and accuracy >= 0.8,
        "master":       total_answers >= 50 and accuracy >= 0.95,
        "explorer":     categories_touched >= 3,
    }
    return [
        Achievement(id=aid, name=name, emoji=emoji, description=desc, unlocked=checks.get(aid, False))
        for aid, name, emoji, desc in _ACHIEVEMENT_DEFS
    ]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_progress(db: Session, account_id: int, flashcard_id: int) -> UserFlashcardProgress:
    p = db.query(UserFlashcardProgress).filter_by(
        account_id=account_id, flashcard_id=flashcard_id
    ).first()
    if not p:
        p = UserFlashcardProgress(
            account_id=account_id,
            flashcard_id=flashcard_id,
            status="new",
            interval_days=1,
            ease_factor=Decimal("2.5"),
            repetitions=0,
            correct_count=0,
            wrong_count=0,
        )
        db.add(p)
        db.flush()
    return p


def _build_session_card(card: Flashcard, mode: str, db: Session, account_id: int) -> SessionCard:
    cat = db.query(FlashcardCategory).filter_by(id=card.category_id).first()
    quiz_options = None
    if mode == "review":
        # Pick 2 wrong short_definitions from other cards
        wrongs = (
            db.query(Flashcard.short_definition)
            .filter(Flashcard.id != card.id)
            .order_by(func.random())
            .limit(2)
            .all()
        )
        options = [card.short_definition] + [w[0] for w in wrongs]
        random.shuffle(options)
        quiz_options = options
    return SessionCard(
        id=card.id,
        category_id=card.category_id,
        category_name=cat.name if cat else "",
        category_emoji=cat.emoji if cat else None,
        word=card.word,
        short_definition=card.short_definition,
        simple_explanation=card.simple_explanation,
        example=card.example,
        difficulty=card.difficulty,
        mode=mode,
        quiz_options=quiz_options,
    )


def _apply_review(p: UserFlashcardProgress, quality: str) -> None:
    now = datetime.utcnow()
    today = date.today()
    p.last_reviewed_at = now
    p.repetitions += 1

    if quality == "correct":
        p.correct_count += 1
        new_interval = max(1, int(p.interval_days * float(p.ease_factor)))
        new_interval = min(new_interval, 60)
        p.interval_days = new_interval
        p.ease_factor = min(Decimal("3.0"), p.ease_factor + Decimal("0.1"))
        p.next_review_at = today + timedelta(days=new_interval)
        p.status = "learning"
    else:
        p.wrong_count += 1
        p.interval_days = 1
        p.ease_factor = max(Decimal("1.3"), p.ease_factor - Decimal("0.2"))
        p.next_review_at = today + timedelta(days=1)
        # If wrong twice in a row reset to learn mode
        if p.wrong_count > 0 and p.correct_count == 0:
            p.status = "new"
        else:
            p.status = "learning"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/categories", response_model=list[CategoryOut])
def get_categories(
    db: Session = Depends(get_db),
    account_id: int = Depends(get_user_id),
):
    cats = db.query(FlashcardCategory).order_by(FlashcardCategory.sort_order).all()
    result = []
    for cat in cats:
        total = db.query(func.count(Flashcard.id)).filter_by(category_id=cat.id).scalar() or 0
        learned = (
            db.query(func.count(UserFlashcardProgress.id))
            .filter_by(account_id=account_id)
            .join(Flashcard, Flashcard.id == UserFlashcardProgress.flashcard_id)
            .filter(Flashcard.category_id == cat.id, UserFlashcardProgress.status == "learning")
            .scalar() or 0
        )
        skipped = (
            db.query(func.count(UserFlashcardProgress.id))
            .filter_by(account_id=account_id)
            .join(Flashcard, Flashcard.id == UserFlashcardProgress.flashcard_id)
            .filter(Flashcard.category_id == cat.id, UserFlashcardProgress.status == "skipped")
            .scalar() or 0
        )
        result.append(CategoryOut(
            id=cat.id,
            name=cat.name,
            emoji=cat.emoji,
            description=cat.description,
            total=total,
            learned=learned,
            skipped=skipped,
        ))
    return result


@router.get("/today", response_model=list[SessionCard])
def get_today_session(
    category_id: Optional[int] = None,
    db: Session = Depends(get_db),
    account_id: int = Depends(get_user_id),
):
    today = date.today()

    # Due for review (status=learning, next_review_at <= today) — most overdue
    # first, capped at DAILY_REVIEW_CAP so the daily lesson stays short.
    due_progresses = (
        db.query(UserFlashcardProgress)
        .filter(
            UserFlashcardProgress.account_id == account_id,
            UserFlashcardProgress.status == "learning",
            UserFlashcardProgress.next_review_at <= today,
        )
        .order_by(UserFlashcardProgress.next_review_at.asc())
        .all()
    )
    due_ids_ordered = [p.flashcard_id for p in due_progresses]
    if due_ids_ordered:
        q = db.query(Flashcard).filter(Flashcard.id.in_(due_ids_ordered))
        if category_id is not None:
            q = q.filter(Flashcard.category_id == category_id)
        by_id = {c.id: c for c in q.all()}
        due_cards = [by_id[cid] for cid in due_ids_ordered if cid in by_id][:DAILY_REVIEW_CAP]
    else:
        due_cards = []

    # New cards — not yet seen (no progress row or status=new), limit NEW_PER_DAY
    seen_ids = (
        db.query(UserFlashcardProgress.flashcard_id)
        .filter(
            UserFlashcardProgress.account_id == account_id,
            UserFlashcardProgress.status.in_(["learning", "skipped"]),
        )
        .all()
    )
    seen_set = {r[0] for r in seen_ids}

    new_q = db.query(Flashcard).filter(Flashcard.id.notin_(seen_set))
    if category_id is not None:
        new_q = new_q.filter(Flashcard.category_id == category_id)
    new_cards = new_q.order_by(func.random()).limit(NEW_PER_DAY).all()

    result = []
    for card in new_cards:
        result.append(_build_session_card(card, "learn", db, account_id))
    for card in due_cards:
        result.append(_build_session_card(card, "review", db, account_id))

    return result


@router.get("/practice", response_model=list[SessionCard])
def get_practice_session(
    category_id: Optional[int] = None,
    db: Session = Depends(get_db),
    account_id: int = Depends(get_user_id),
):
    """Unlimited extra practice: ignores the daily limit and the review schedule.

    Returns a batch of cards — first any unseen new words (in order), then fills
    the rest with already-learned words for repetition (random, regardless of
    next_review_at). Lets the user keep practising as much as they want.
    """
    # Unseen new words (status not learning/skipped)
    seen_ids = (
        db.query(UserFlashcardProgress.flashcard_id)
        .filter(
            UserFlashcardProgress.account_id == account_id,
            UserFlashcardProgress.status.in_(["learning", "skipped"]),
        )
        .all()
    )
    seen_set = {r[0] for r in seen_ids}

    new_q = db.query(Flashcard).filter(Flashcard.id.notin_(seen_set))
    if category_id is not None:
        new_q = new_q.filter(Flashcard.category_id == category_id)
    new_cards = new_q.order_by(func.random()).limit(PRACTICE_BATCH).all()

    result = [_build_session_card(card, "learn", db, account_id) for card in new_cards]

    # Fill remainder with learned words for repetition (any, ignore due date)
    remaining = PRACTICE_BATCH - len(result)
    if remaining > 0:
        learning_ids = (
            db.query(UserFlashcardProgress.flashcard_id)
            .filter(
                UserFlashcardProgress.account_id == account_id,
                UserFlashcardProgress.status == "learning",
            )
            .all()
        )
        learning_set = {r[0] for r in learning_ids}
        if learning_set:
            review_q = db.query(Flashcard).filter(Flashcard.id.in_(learning_set))
            if category_id is not None:
                review_q = review_q.filter(Flashcard.category_id == category_id)
            review_cards = review_q.order_by(func.random()).limit(remaining).all()
            result.extend(_build_session_card(card, "review", db, account_id) for card in review_cards)

    return result


@router.get("/stats", response_model=StatsOut)
def get_stats(
    db: Session = Depends(get_db),
    account_id: int = Depends(get_user_id),
):
    today = date.today()
    total_cards = db.query(func.count(Flashcard.id)).scalar() or 0

    learned = (
        db.query(func.count(UserFlashcardProgress.id))
        .filter_by(account_id=account_id, status="learning")
        .scalar() or 0
    )
    skipped = (
        db.query(func.count(UserFlashcardProgress.id))
        .filter_by(account_id=account_id, status="skipped")
        .scalar() or 0
    )
    due_today_total = (
        db.query(func.count(UserFlashcardProgress.id))
        .filter(
            UserFlashcardProgress.account_id == account_id,
            UserFlashcardProgress.status == "learning",
            UserFlashcardProgress.next_review_at <= today,
        )
        .scalar() or 0
    )
    # Cap to match the daily lesson size (extra reviews roll over to next days).
    due_today = min(due_today_total, DAILY_REVIEW_CAP)

    seen_ids = (
        db.query(UserFlashcardProgress.flashcard_id)
        .filter(
            UserFlashcardProgress.account_id == account_id,
            UserFlashcardProgress.status.in_(["learning", "skipped"]),
        )
        .all()
    )
    seen_set = {r[0] for r in seen_ids}
    new_available = db.query(func.count(Flashcard.id)).filter(Flashcard.id.notin_(seen_set)).scalar() or 0
    new_today = min(NEW_PER_DAY, new_available)

    # Simple streak: count days back where last_reviewed_at exists
    streak = 0
    check_date = today
    while True:
        had_activity = (
            db.query(UserFlashcardProgress)
            .filter(
                UserFlashcardProgress.account_id == account_id,
                func.date(UserFlashcardProgress.last_reviewed_at) == check_date,
            )
            .first()
        )
        if not had_activity:
            break
        streak += 1
        check_date -= timedelta(days=1)

    # Aggregate correct/wrong from all progress rows
    agg = (
        db.query(
            func.coalesce(func.sum(UserFlashcardProgress.correct_count), 0),
            func.coalesce(func.sum(UserFlashcardProgress.wrong_count), 0),
        )
        .filter(UserFlashcardProgress.account_id == account_id)
        .one()
    )
    total_correct = int(agg[0])
    total_wrong = int(agg[1])
    total_answers = total_correct + total_wrong
    accuracy = total_correct / total_answers if total_answers else 0.0

    # XP: 5 per learned card + 10 per correct answer
    xp = learned * 5 + total_correct * 10
    level, xp_in_level, xp_to_next = _compute_level(xp)

    # How many distinct categories the user has touched
    categories_touched = (
        db.query(func.count(func.distinct(Flashcard.category_id)))
        .join(UserFlashcardProgress, UserFlashcardProgress.flashcard_id == Flashcard.id)
        .filter(UserFlashcardProgress.account_id == account_id)
        .scalar() or 0
    )

    achievements = _compute_achievements(learned, streak, total_correct, total_wrong, categories_touched)

    # Слабые слова: были ошибки и точность ниже 70% (3*correct < 7*wrong)
    weak_count = (
        db.query(func.count(UserFlashcardProgress.id))
        .filter(
            UserFlashcardProgress.account_id == account_id,
            UserFlashcardProgress.wrong_count > 0,
            UserFlashcardProgress.correct_count * 3 < UserFlashcardProgress.wrong_count * 7,
        )
        .scalar() or 0
    )

    return StatsOut(
        total_cards=total_cards,
        learned=learned,
        skipped=skipped,
        due_today=due_today,
        new_today=new_today,
        streak_days=streak,
        total_correct=total_correct,
        total_wrong=total_wrong,
        accuracy=accuracy,
        xp=xp,
        level=level,
        xp_in_level=xp_in_level,
        xp_to_next=xp_to_next,
        weak_count=weak_count,
        achievements=achievements,
    )


@router.get("/weak", response_model=list[SessionCard])
def get_weak_session(
    db: Session = Depends(get_db),
    account_id: int = Depends(get_user_id),
):
    """Тренировка слабых слов: карточки с низкой точностью (где чаще ошибаешься).

    Всегда в режиме повторения (квиз). Сортировка — от самых проблемных.
    """
    WEAK_LIMIT = 12
    progresses = (
        db.query(UserFlashcardProgress)
        .filter(
            UserFlashcardProgress.account_id == account_id,
            UserFlashcardProgress.wrong_count > 0,
            UserFlashcardProgress.correct_count * 3 < UserFlashcardProgress.wrong_count * 7,
        )
        .all()
    )
    if not progresses:
        return []

    def _acc(p: UserFlashcardProgress) -> float:
        t = p.correct_count + p.wrong_count
        return p.correct_count / t if t else 0.0

    progresses.sort(key=lambda p: (_acc(p), -p.wrong_count))
    card_ids = [p.flashcard_id for p in progresses[:WEAK_LIMIT]]
    cards = db.query(Flashcard).filter(Flashcard.id.in_(card_ids)).all()
    by_id = {c.id: c for c in cards}
    return [
        _build_session_card(by_id[cid], "review", db, account_id)
        for cid in card_ids if cid in by_id
    ]


@router.post("/{flashcard_id}/seen")
def mark_seen(
    flashcard_id: int,
    db: Session = Depends(get_db),
    account_id: int = Depends(get_user_id),
):
    card = db.query(Flashcard).filter_by(id=flashcard_id).first()
    if not card:
        raise HTTPException(404, "Card not found")
    p = _get_progress(db, account_id, flashcard_id)
    now = datetime.utcnow()
    if not p.first_seen_at:
        p.first_seen_at = now
    p.status = "learning"
    p.next_review_at = date.today() + timedelta(days=1)
    p.last_reviewed_at = now
    db.commit()
    return {"ok": True}


@router.post("/{flashcard_id}/review")
def review_card(
    flashcard_id: int,
    body: ReviewIn,
    db: Session = Depends(get_db),
    account_id: int = Depends(get_user_id),
):
    card = db.query(Flashcard).filter_by(id=flashcard_id).first()
    if not card:
        raise HTTPException(404, "Card not found")
    p = _get_progress(db, account_id, flashcard_id)
    _apply_review(p, body.quality)
    db.commit()
    return {"ok": True, "next_review_at": str(p.next_review_at), "interval_days": p.interval_days}


@router.post("/{flashcard_id}/skip")
def skip_card(
    flashcard_id: int,
    db: Session = Depends(get_db),
    account_id: int = Depends(get_user_id),
):
    card = db.query(Flashcard).filter_by(id=flashcard_id).first()
    if not card:
        raise HTTPException(404, "Card not found")
    p = _get_progress(db, account_id, flashcard_id)
    p.status = "skipped"
    p.last_reviewed_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


# ── Progress endpoint ──────────────────────────────────────────────────────────

class CategoryProgress(BaseModel):
    id: int
    name: str
    emoji: Optional[str]
    total: int
    learned: int
    correct: int
    wrong: int
    accuracy: float


class DayActivity(BaseModel):
    date: str   # ISO YYYY-MM-DD
    count: int  # cards reviewed on that day


class ProgressOut(BaseModel):
    categories: list[CategoryProgress]
    activity: list[DayActivity]   # last 84 days (12 weeks)


@router.get("/progress", response_model=ProgressOut)
def get_progress(
    db: Session = Depends(get_db),
    account_id: int = Depends(get_user_id),
):
    # ── per-category stats ────────────────────────────────────────────────────
    cats = db.query(FlashcardCategory).order_by(FlashcardCategory.sort_order).all()
    categories = []
    for cat in cats:
        total = db.query(func.count(Flashcard.id)).filter_by(category_id=cat.id).scalar() or 0
        learned = (
            db.query(func.count(UserFlashcardProgress.id))
            .join(Flashcard, Flashcard.id == UserFlashcardProgress.flashcard_id)
            .filter(
                UserFlashcardProgress.account_id == account_id,
                UserFlashcardProgress.status == "learning",
                Flashcard.category_id == cat.id,
            )
            .scalar() or 0
        )
        agg = (
            db.query(
                func.coalesce(func.sum(UserFlashcardProgress.correct_count), 0),
                func.coalesce(func.sum(UserFlashcardProgress.wrong_count), 0),
            )
            .join(Flashcard, Flashcard.id == UserFlashcardProgress.flashcard_id)
            .filter(
                UserFlashcardProgress.account_id == account_id,
                Flashcard.category_id == cat.id,
            )
            .one()
        )
        correct, wrong = int(agg[0]), int(agg[1])
        accuracy = correct / (correct + wrong) if (correct + wrong) > 0 else 0.0
        categories.append(CategoryProgress(
            id=cat.id, name=cat.name, emoji=cat.emoji,
            total=total, learned=learned,
            correct=correct, wrong=wrong, accuracy=accuracy,
        ))

    # ── activity calendar (last 84 days = 12 weeks) ───────────────────────────
    cutoff = date.today() - timedelta(days=83)
    rows = (
        db.query(
            func.date(UserFlashcardProgress.last_reviewed_at).label("day"),
            func.count(UserFlashcardProgress.id).label("cnt"),
        )
        .filter(
            UserFlashcardProgress.account_id == account_id,
            UserFlashcardProgress.last_reviewed_at >= cutoff,
        )
        .group_by(func.date(UserFlashcardProgress.last_reviewed_at))
        .order_by(func.date(UserFlashcardProgress.last_reviewed_at))
        .all()
    )
    activity = [DayActivity(date=str(r.day), count=r.cnt) for r in rows]

    return ProgressOut(categories=categories, activity=activity)
