"""
Contacts use cases — CRUD глобального справочника контактов.
"""
from sqlalchemy.orm import Session

from app.infrastructure.db.models import ContactModel


class ContactValidationError(ValueError):
    pass


class CreateContactUseCase:
    def __init__(self, db: Session):
        self.db = db

    def execute(self, account_id: int, name: str, note: str = "") -> int:
        name = name.strip()
        if not name:
            raise ContactValidationError("Имя контакта не может быть пустым")

        contact = ContactModel(
            account_id=account_id,
            name=name,
            note=note.strip() or None,
        )
        self.db.add(contact)
        self.db.flush()
        self.db.commit()
        return contact.id


class UpdateContactUseCase:
    def __init__(self, db: Session):
        self.db = db

    def execute(self, contact_id: int, account_id: int, **changes) -> None:
        contact = self.db.query(ContactModel).filter(
            ContactModel.id == contact_id,
            ContactModel.account_id == account_id,
        ).first()
        if not contact:
            raise ContactValidationError("Контакт не найден")

        if "name" in changes:
            name = changes["name"].strip()
            if not name:
                raise ContactValidationError("Имя контакта не может быть пустым")
            contact.name = name
        if "note" in changes:
            contact.note = changes["note"].strip() or None
        self.db.commit()


class ArchiveContactUseCase:
    def __init__(self, db: Session):
        self.db = db

    def execute(self, contact_id: int, account_id: int) -> None:
        contact = self.db.query(ContactModel).filter(
            ContactModel.id == contact_id,
            ContactModel.account_id == account_id,
        ).first()
        if not contact:
            raise ContactValidationError("Контакт не найден")
        if contact.is_archived:
            raise ContactValidationError("Контакт уже в архиве")
        contact.is_archived = True
        self.db.commit()


class UnarchiveContactUseCase:
    def __init__(self, db: Session):
        self.db = db

    def execute(self, contact_id: int, account_id: int) -> None:
        contact = self.db.query(ContactModel).filter(
            ContactModel.id == contact_id,
            ContactModel.account_id == account_id,
        ).first()
        if not contact:
            raise ContactValidationError("Контакт не найден")
        if not contact.is_archived:
            raise ContactValidationError("Контакт не в архиве")
        contact.is_archived = False
        self.db.commit()
