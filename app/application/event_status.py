"""
Когда событие считается просроченным.

Правило одно на всё приложение: и «План», и блок «Сегодня» на главной
должны решать это одинаково, иначе список и счётчик расходятся.
"""
from datetime import date

from app.infrastructure.db.models import CalendarEventModel, EventOccurrenceModel

# Событие закрывается только руками и висит, пока не отметишь.
MANUAL_COMPLETION = "manual"


def is_event_overdue(
    occ: EventOccurrenceModel, ev: CalendarEventModel, today: date
) -> bool:
    """Просрочено только то, что закрывается вручную и ещё не закрыто.

    Режимы end_of_day и at_event_end считают событие состоявшимся по факту
    наступления даты — напоминать о них не о чем. Режим manual существует
    ровно затем, чтобы событие не пропадало, пока его не отметили.
    """
    if ev.completion_mode != MANUAL_COMPLETION:
        return False
    if occ.is_completed or occ.is_cancelled:
        return False
    last_day = occ.end_date or occ.start_date
    return last_day < today
