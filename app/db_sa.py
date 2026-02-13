import os
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

def get_database_url() -> str:
    raw = os.getenv("DATABASE_URL", "postgresql://finlife:finlife_password_change_me@centricore_db:5432/finlife")
    # SQLAlchemy expects "postgresql+psycopg://", but we also accept plain "postgresql://"
    if raw.startswith("postgresql://"):
        return raw.replace("postgresql://", "postgresql+psycopg://", 1)
    return raw

class Base(DeclarativeBase):
    pass

engine = create_engine(get_database_url(), pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
