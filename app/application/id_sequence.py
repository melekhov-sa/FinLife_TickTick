"""
Выдача следующего id для сущностей, которые нумеруются вручную.

Идентификаторы здесь не автоинкрементные: номер кладётся в событие, а
проектор создаёт по нему строку. Раньше следующий номер считался только по
журналу событий — и если в таблице оказывалась строка без парного события
(сид, ручная правка, обрезанный журнал, перестроенная read-model), генератор
начинал выдавать занятый номер. Вставка падала на уникальном ключе, и так на
каждой попытке: журнал сам себя не догонял.

Поэтому максимум берётся из обоих источников.
"""
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.infrastructure.db.models import EventLog


def next_entity_id(db: Session, *, event_type: str, payload_key: str, column) -> int:
    """Следующий свободный id: максимум журнала и таблицы плюс один.

    event_type  — тип события создания ('recurrence_rule_created');
    payload_key — где в payload лежит номер ('rule_id');
    column      — колонка первичного ключа (RecurrenceRuleModel.rule_id).
    """
    from_log = db.query(
        func.max(func.cast(EventLog.payload_json[payload_key], column.type))
    ).filter(EventLog.event_type == event_type).scalar() or 0

    # Строки без парного события журнал не видит — а первичный ключ видит.
    from_table = db.query(func.max(column)).scalar() or 0

    return max(int(from_log), int(from_table)) + 1
