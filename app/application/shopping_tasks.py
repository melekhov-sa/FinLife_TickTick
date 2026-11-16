"""
Покупки из списка: задача «Купить …» в день, к которому хочется купить.

Позиция в списке покупок может нести цену и дату (want_by). В эту дату
заводится обычная задача, чтобы покупка попала в «План» и в напоминания,
а не осталась лежать в списке, куда надо не забыть заглянуть.

Связь двусторонняя и держится на SharedListItem.task_id:
  • выполнил задачу  → позиция отмечается купленной;
  • отметил галочкой → задача закрывается.
Одно действие вместо двух, и список не расходится с планом.
"""
import logging
from datetime import date

from sqlalchemy.orm import Session

from app.infrastructure.db.models import SharedList, SharedListItem, TaskModel

logger = logging.getLogger(__name__)

TASK_TITLE_PREFIX = "Купить"

# Списки, для которых это имеет смысл. Роадмап и трип-контейнеры сюда
# не попадают: там позиции живут по другим правилам.
SHOPPING_LIST_TYPES = ("wishlist", "giftlist", "shopping")


def _task_title(item: SharedListItem) -> str:
    return f"{TASK_TITLE_PREFIX} {item.title}".strip()


def create_due_purchase_tasks(db: Session, today: date | None = None) -> int:
    """Завести задачи для позиций, у которых наступила дата покупки.

    Условие намеренно `want_by <= today`, а не `== today`: если планировщик
    в нужный день не отработал (перезапуск контейнера, простой), задача
    всё равно появится на следующем запуске, а не потеряется навсегда.

    Идемпотентна: позиция с уже проставленным task_id пропускается.
    Возвращает число созданных задач.
    """
    if today is None:
        today = date.today()

    rows = (
        db.query(SharedListItem, SharedList)
        .join(SharedList, SharedList.id == SharedListItem.list_id)
        .filter(
            SharedListItem.want_by.isnot(None),
            SharedListItem.want_by <= today,
            SharedListItem.task_id.is_(None),
            SharedListItem.status == "open",
            SharedList.list_type.in_(SHOPPING_LIST_TYPES),
        )
        .all()
    )

    created = 0
    for item, lst in rows:
        try:
            created += _create_task_for(db, item, lst)
        except Exception:
            db.rollback()
            logger.exception("purchase task creation failed for item_id=%s", item.id)

    if created:
        db.commit()
    return created


def _create_task_for(db: Session, item: SharedListItem, lst: SharedList) -> int:
    from app.application.tasks_usecases import CreateTaskUseCase

    task_id = CreateTaskUseCase(db).execute(
        account_id=lst.account_id,
        title=_task_title(item),
        note=item.note,
        due_kind="DATE",
        due_date=item.want_by.isoformat(),
        # Цена уходит подсказкой: при проведении траты сумма уже известна.
        requires_expense=item.price is not None,
        suggested_amount=str(item.price) if item.price is not None else None,
        actor_user_id=lst.account_id,
    )
    item.task_id = task_id
    db.flush()
    return 1


def complete_item_for_task(db: Session, account_id: int, task_id: int) -> bool:
    """Задачу закрыли — отметить позицию купленной. True, если что-то изменилось."""
    from datetime import datetime, timezone

    item = (
        db.query(SharedListItem)
        .join(SharedList, SharedList.id == SharedListItem.list_id)
        .filter(
            SharedListItem.task_id == task_id,
            SharedList.account_id == account_id,
        )
        .first()
    )
    if item is None or item.status == "done":
        return False

    item.status = "done"
    item.completed_at = datetime.now(timezone.utc)
    db.commit()
    return True


def complete_task_for_item(db: Session, account_id: int, item: SharedListItem) -> bool:
    """Позицию отметили купленной — закрыть связанную задачу."""
    if item.task_id is None:
        return False

    task = db.query(TaskModel).filter(
        TaskModel.task_id == item.task_id,
        TaskModel.account_id == account_id,
    ).first()
    if task is None or task.status != "ACTIVE":
        return False

    from app.application.tasks_usecases import CompleteTaskUseCase, TaskValidationError

    try:
        CompleteTaskUseCase(db).execute(
            task_id=item.task_id, account_id=account_id, actor_user_id=account_id
        )
    except TaskValidationError:
        return False
    return True
