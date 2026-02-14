"""
Database session management (SQLAlchemy)
"""
import psycopg
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session

from app.config import get_settings


class Base(DeclarativeBase):
    """
    SQLAlchemy declarative base for all ORM models
    """
    pass


# Singleton engine and session factory
_engine = None
_SessionLocal = None


def get_engine():
    """Get or create SQLAlchemy engine (singleton)"""
    global _engine
    if _engine is None:
        settings = get_settings()
        url = settings.get_sqlalchemy_url()
        _engine = create_engine(url, pool_pre_ping=True)
    return _engine


def get_session_factory():
    """Get or create session factory (singleton)"""
    global _SessionLocal
    if _SessionLocal is None:
        engine = get_engine()
        _SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    return _SessionLocal


def get_db() -> Session:
    """
    Dependency для FastAPI - создает session и автоматически закрывает

    Usage:
        @app.get("/users")
        def list_users(db: Session = Depends(get_db)):
            ...
    """
    SessionLocal = get_session_factory()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_db_connection() -> None:
    """
    Health check - проверка доступности PostgreSQL (raw psycopg)

    Raises:
        psycopg.OperationalError: если БД недоступна
    """
    settings = get_settings()
    with psycopg.connect(settings.DATABASE_URL, connect_timeout=3) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1;")
            cur.fetchone()
