"""Tests for Contacts module — CRUD глобального справочника контактов."""
import pytest

from app.infrastructure.db.models import ContactModel
from app.application.contacts import (
    CreateContactUseCase, UpdateContactUseCase,
    ArchiveContactUseCase, UnarchiveContactUseCase,
    ContactValidationError,
)

ACCOUNT = 1


class TestCreateContact:
    def test_create_contact(self, db_session):
        cid = CreateContactUseCase(db_session).execute(
            account_id=ACCOUNT, name="Иван",
        )
        contact = db_session.query(ContactModel).filter(
            ContactModel.id == cid,
        ).first()
        assert contact is not None
        assert contact.name == "Иван"
        assert contact.note is None
        assert contact.is_archived is False

    def test_create_contact_with_note(self, db_session):
        cid = CreateContactUseCase(db_session).execute(
            account_id=ACCOUNT, name="Петя", note="коллега",
        )
        contact = db_session.query(ContactModel).filter(
            ContactModel.id == cid,
        ).first()
        assert contact.name == "Петя"
        assert contact.note == "коллега"

    def test_empty_name_fails(self, db_session):
        with pytest.raises(ContactValidationError, match="Имя"):
            CreateContactUseCase(db_session).execute(
                account_id=ACCOUNT, name="  ",
            )

    def test_strips_whitespace(self, db_session):
        cid = CreateContactUseCase(db_session).execute(
            account_id=ACCOUNT, name="  Анна  ",
        )
        contact = db_session.query(ContactModel).filter(
            ContactModel.id == cid,
        ).first()
        assert contact.name == "Анна"


class TestUpdateContact:
    def test_update_name(self, db_session):
        cid = CreateContactUseCase(db_session).execute(
            account_id=ACCOUNT, name="Иван",
        )
        UpdateContactUseCase(db_session).execute(
            cid, ACCOUNT, name="Иван Петров",
        )
        contact = db_session.query(ContactModel).filter(
            ContactModel.id == cid,
        ).first()
        assert contact.name == "Иван Петров"

    def test_update_note(self, db_session):
        cid = CreateContactUseCase(db_session).execute(
            account_id=ACCOUNT, name="Иван",
        )
        UpdateContactUseCase(db_session).execute(
            cid, ACCOUNT, note="друг",
        )
        contact = db_session.query(ContactModel).filter(
            ContactModel.id == cid,
        ).first()
        assert contact.note == "друг"

    def test_empty_name_update_fails(self, db_session):
        cid = CreateContactUseCase(db_session).execute(
            account_id=ACCOUNT, name="Иван",
        )
        with pytest.raises(ContactValidationError, match="Имя"):
            UpdateContactUseCase(db_session).execute(
                cid, ACCOUNT, name="  ",
            )

    def test_not_found(self, db_session):
        with pytest.raises(ContactValidationError, match="не найден"):
            UpdateContactUseCase(db_session).execute(
                999, ACCOUNT, name="test",
            )


class TestArchiveContact:
    def test_archive(self, db_session):
        cid = CreateContactUseCase(db_session).execute(
            account_id=ACCOUNT, name="Иван",
        )
        ArchiveContactUseCase(db_session).execute(cid, ACCOUNT)
        contact = db_session.query(ContactModel).filter(
            ContactModel.id == cid,
        ).first()
        assert contact.is_archived is True

    def test_archive_already_archived_fails(self, db_session):
        cid = CreateContactUseCase(db_session).execute(
            account_id=ACCOUNT, name="Иван",
        )
        ArchiveContactUseCase(db_session).execute(cid, ACCOUNT)
        with pytest.raises(ContactValidationError, match="уже в архиве"):
            ArchiveContactUseCase(db_session).execute(cid, ACCOUNT)

    def test_unarchive(self, db_session):
        cid = CreateContactUseCase(db_session).execute(
            account_id=ACCOUNT, name="Иван",
        )
        ArchiveContactUseCase(db_session).execute(cid, ACCOUNT)
        UnarchiveContactUseCase(db_session).execute(cid, ACCOUNT)
        contact = db_session.query(ContactModel).filter(
            ContactModel.id == cid,
        ).first()
        assert contact.is_archived is False

    def test_unarchive_not_archived_fails(self, db_session):
        cid = CreateContactUseCase(db_session).execute(
            account_id=ACCOUNT, name="Иван",
        )
        with pytest.raises(ContactValidationError, match="не в архиве"):
            UnarchiveContactUseCase(db_session).execute(cid, ACCOUNT)
