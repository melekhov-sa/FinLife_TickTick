"""Reminder time presets CRUD (plain CRUD, not event-sourced)."""
from sqlalchemy.orm import Session
from app.infrastructure.db.models import UserReminderTimePreset


class ReminderPresetValidationError(ValueError):
    pass


class ReminderPresetsService:
    def __init__(self, db: Session):
        self.db = db

    def list_presets(self, account_id: int) -> list[UserReminderTimePreset]:
        return self.db.query(UserReminderTimePreset).filter(
            UserReminderTimePreset.account_id == account_id,
        ).order_by(UserReminderTimePreset.sort_order, UserReminderTimePreset.id).all()

    def create_preset(self, account_id: int, label: str, offset_minutes: int) -> int:
        label = label.strip()
        if not label:
            raise ReminderPresetValidationError("Название не может быть пустым")
        if offset_minutes > 0:
            raise ReminderPresetValidationError("offset_minutes должен быть <= 0")

        existing = self.db.query(UserReminderTimePreset).filter(
            UserReminderTimePreset.account_id == account_id,
            UserReminderTimePreset.offset_minutes == offset_minutes,
        ).first()
        if existing:
            raise ReminderPresetValidationError(
                f"Пресет с offset_minutes={offset_minutes} уже существует"
            )

        preset = UserReminderTimePreset(
            account_id=account_id,
            label=label,
            offset_minutes=offset_minutes,
        )
        self.db.add(preset)
        self.db.commit()
        return preset.id

    def delete_preset(self, preset_id: int, account_id: int) -> None:
        deleted = self.db.query(UserReminderTimePreset).filter(
            UserReminderTimePreset.id == preset_id,
            UserReminderTimePreset.account_id == account_id,
        ).delete()
        if not deleted:
            raise ReminderPresetValidationError("Пресет не найден")
        self.db.commit()

    def seed_defaults(self, account_id: int) -> None:
        """Seed default presets for a new user."""
        defaults = [
            ("В момент срока", 0, 0),
            ("За 15 минут", -15, 1),
            ("За 30 минут", -30, 2),
            ("За 1 час", -60, 3),
            ("За 1 день", -1440, 4),
        ]
        for label, offset, sort_order in defaults:
            existing = self.db.query(UserReminderTimePreset).filter(
                UserReminderTimePreset.account_id == account_id,
                UserReminderTimePreset.offset_minutes == offset,
            ).first()
            if not existing:
                self.db.add(UserReminderTimePreset(
                    account_id=account_id,
                    label=label,
                    offset_minutes=offset,
                    sort_order=sort_order,
                ))
        self.db.commit()
