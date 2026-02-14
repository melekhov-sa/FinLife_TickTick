"""
Запустить projector вручную для диагностики
"""
import os
os.environ["DATABASE_URL"] = "postgresql://finlife:finlife_password_change_me@localhost:5432/finlife"

from app.infrastructure.db.session import get_db
from app.readmodels.projectors.wallet_balances import WalletBalancesProjector

db = next(get_db())

try:
    print("Запускаем WalletBalancesProjector для account_id=2...")
    projector = WalletBalancesProjector(db)

    # Сбросить checkpoint чтобы обработать все события
    projector.reset(account_id=2)

    # Запустить projector
    count = projector.run(account_id=2)

    db.commit()

    print(f"✓ Обработано событий: {count}")

    # Проверить результат
    from app.infrastructure.db.models import WalletBalance
    wallets = db.query(WalletBalance).filter(WalletBalance.account_id == 2).all()
    print(f"✓ Создано кошельков: {len(wallets)}")
    for w in wallets:
        print(f"  - {w.title} ({w.wallet_type}): {w.balance} {w.currency}")

except Exception as e:
    print(f"✗ ОШИБКА: {e}")
    import traceback
    traceback.print_exc()

finally:
    db.close()
