"""
Pytest fixtures for testing
"""
import pytest
from sqlalchemy import create_engine, event, JSON
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.dialects.postgresql import JSONB
from app.infrastructure.db.session import Base


@pytest.fixture
def db_engine():
    """Create in-memory SQLite engine for tests, with JSONB→JSON mapping."""
    engine = create_engine("sqlite:///:memory:")
    # SQLite doesn't support JSONB — remap to JSON for tests
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, connection_record):
        pass

    # Monkey-patch JSONB columns to JSON for SQLite compatibility
    for table in Base.metadata.tables.values():
        for col in table.columns:
            if isinstance(col.type, JSONB):
                col.type = JSON()
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def db_session(db_engine) -> Session:
    """Create database session for tests"""
    SessionLocal = sessionmaker(bind=db_engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture
def sample_account_id():
    """Sample account ID for tests"""
    return 1
