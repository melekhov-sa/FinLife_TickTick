"""
Очистить базу данных от тестовых данных
"""
import os
os.environ["DATABASE_URL"] = "postgresql://finlife:finlife_password_change_me@localhost:5432/finlife"

from app.infrastructure.db.session import get_db
from app.infrastructure.db.models import EventLog, WalletBalance, ProjectorCheckpoint

db = next(get_db())

print("=== ОЧИСТКА БАЗЫ ДАННЫХ ===")

# Удалить все wallet-связанные события для account_id=2
deleted_events = db.query(EventLog).filter(
    EventLog.account_id == 2,
    EventLog.event_type.in_(['wallet_created', 'wallet_archived'])
).delete()
print(f"✓ Удалено событий: {deleted_events}")

# Удалить все кошельки для account_id=2
deleted_wallets = db.query(WalletBalance).filter(
    WalletBalance.account_id == 2
).delete()
print(f"✓ Удалено кошельков: {deleted_wallets}")

# Удалить checkpoints для account_id=2
deleted_checkpoints = db.query(ProjectorCheckpoint).filter(
    ProjectorCheckpoint.account_id == 2
).delete()
print(f"✓ Удалено checkpoints: {deleted_checkpoints}")

db.commit()
print("\n✓ База очищена!")

db.close()
