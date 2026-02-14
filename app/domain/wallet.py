"""
Wallet domain entity - generates events for wallet operations
"""
from datetime import datetime
from dataclasses import dataclass
from typing import Dict, Any

# Wallet types (from FinLife OS)
WALLET_TYPE_REGULAR = "REGULAR"  # Обычный - обычный кошелёк
WALLET_TYPE_CREDIT = "CREDIT"    # Кредит - долговой кошелёк (баланс <= 0)
WALLET_TYPE_SAVINGS = "SAVINGS"  # Накопления - накопительный (только пополнение)


@dataclass
class Wallet:
    """
    Wallet domain entity (Event Sourcing)

    Wallet не персистится напрямую - генерирует события для event_log.
    Read model (WalletBalance) строится projector'ом из событий.

    Типы кошельков:
    - REGULAR: обычный кошелёк, начальный баланс >= 0
    - CREDIT: долговой кошелёк, начальный баланс <= 0 (кредитки, долги)
    - SAVINGS: накопительный кошелёк, баланс >= 0, расходы запрещены
    """
    id: int
    account_id: int
    title: str
    currency: str  # USD, EUR, RUB, etc.
    wallet_type: str  # REGULAR, CREDIT, SAVINGS
    is_archived: bool
    created_at: datetime

    @staticmethod
    def create(
        account_id: int,
        wallet_id: int,
        title: str,
        currency: str,
        wallet_type: str,
        initial_balance: str = "0"
    ) -> Dict[str, Any]:
        """
        Создать событие wallet_created

        Args:
            account_id: ID аккаунта (user.id)
            wallet_id: ID кошелька
            title: Название кошелька
            currency: Валюта (USD, EUR, RUB)
            wallet_type: Тип кошелька (REGULAR, CREDIT, SAVINGS)
            initial_balance: Начальный баланс (строка для Decimal)

        Returns:
            Event payload для сохранения в event_log
        """
        return {
            "wallet_id": wallet_id,
            "account_id": account_id,
            "title": title,
            "currency": currency,
            "wallet_type": wallet_type,
            "initial_balance": initial_balance,
            "created_at": datetime.utcnow().isoformat()
        }

    @staticmethod
    def rename(wallet_id: int, title: str) -> Dict[str, Any]:
        """
        Создать событие wallet_renamed

        Args:
            wallet_id: ID кошелька
            title: Новое название

        Returns:
            Event payload для сохранения в event_log
        """
        return {
            "wallet_id": wallet_id,
            "title": title,
            "updated_at": datetime.utcnow().isoformat()
        }

    @staticmethod
    def archive(wallet_id: int) -> Dict[str, Any]:
        """
        Создать событие wallet_archived

        Args:
            wallet_id: ID кошелька для архивирования

        Returns:
            Event payload для сохранения в event_log
        """
        return {
            "wallet_id": wallet_id,
            "archived_at": datetime.utcnow().isoformat()
        }

    @staticmethod
    def unarchive(wallet_id: int) -> Dict[str, Any]:
        """Создать событие wallet_unarchived"""
        return {
            "wallet_id": wallet_id,
            "unarchived_at": datetime.utcnow().isoformat()
        }
