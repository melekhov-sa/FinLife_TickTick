import os
import psycopg

def get_db_dsn() -> str:
    # Example: postgresql://user:pass@localhost:5432/dbname
    return os.getenv("DATABASE_URL", "postgresql://finlife:finlife_password_change_me@localhost:5432/finlife")

def check_db() -> None:
    dsn = get_db_dsn()
    with psycopg.connect(dsn, connect_timeout=3) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1;")
            cur.fetchone()
