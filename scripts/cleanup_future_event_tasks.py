"""
One-time cleanup: archive tasks that were pre-created for future event occurrences
and remove the dedup records so the new scheduler can recreate them on the correct day.

Usage:
    # Dry run (default) — shows what would be affected, changes nothing:
    python scripts/cleanup_future_event_tasks.py

    # Actually apply:
    python scripts/cleanup_future_event_tasks.py --apply
"""
import sys
from datetime import date

sys.path.insert(0, ".")

from app.infrastructure.db.session import get_session_factory
from app.infrastructure.db.models import EventOccurrenceTask, TaskModel

DRY_RUN = "--apply" not in sys.argv


def main():
    today = date.today()
    db = get_session_factory()()
    try:
        # Find all future dedup records
        future_links = (
            db.query(EventOccurrenceTask)
            .filter(EventOccurrenceTask.occurrence_date > today)
            .all()
        )

        if not future_links:
            print("Нет задач для очистки.")
            return

        task_ids = [link.task_id for link in future_links]

        # Only touch ACTIVE tasks (skip DONE / already ARCHIVED)
        tasks_to_archive = (
            db.query(TaskModel)
            .filter(TaskModel.task_id.in_(task_ids), TaskModel.status == "ACTIVE")
            .all()
        )

        skipped = len(task_ids) - len(tasks_to_archive)

        print(f"{'[DRY RUN] ' if DRY_RUN else ''}Дата: {today}")
        print(f"  event_occurrence_tasks к удалению : {len(future_links)}")
        print(f"  задач будет заархивировано        : {len(tasks_to_archive)}")
        print(f"  пропущено (уже DONE/ARCHIVED)     : {skipped}")
        print()

        # Preview first 20 rows
        preview = (
            db.query(EventOccurrenceTask, TaskModel)
            .join(TaskModel, TaskModel.task_id == EventOccurrenceTask.task_id)
            .filter(
                EventOccurrenceTask.occurrence_date > today,
                TaskModel.status == "ACTIVE",
            )
            .order_by(EventOccurrenceTask.occurrence_date)
            .limit(20)
            .all()
        )
        print(f"{'Первые 20 записей (preview):' if DRY_RUN else 'Обрабатываем:'}")
        for link, task in preview:
            print(f"  occurrence={link.occurrence_date}  task_id={task.task_id}  '{task.title}'  due={task.due_date}")

        if DRY_RUN:
            print()
            print("Запусти с --apply чтобы применить изменения.")
            return

        # Archive tasks
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        for task in tasks_to_archive:
            task.status = "ARCHIVED"
            task.archived_at = now

        # Delete dedup records
        for link in future_links:
            db.delete(link)

        db.commit()
        print(f"\nГотово: {len(tasks_to_archive)} задач заархивировано, {len(future_links)} dedup-записей удалено.")

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
