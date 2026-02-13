import os
import psycopg

def get_db_dsn() -> str:
    # Example: postgresql://user:pass@localhost:5432/dbname
    raw = os.getenv("DATABASE_URL", "postgresql://finlife:finlife_password_change_me@centricore_db:5432/finlife")
    if raw.startswith("postgresql+psycopg://"):
        raw = raw.replace("postgresql+psycopg://", "postgresql://", 1)
    return raw

def check_db() -> None:
    dsn = get_db_dsn()
    with psycopg.connect(dsn, connect_timeout=3) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1;")
            cur.fetchone()
