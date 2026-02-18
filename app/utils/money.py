"""
Unified money formatting for the whole project.

Usage:
    from app.utils.money import format_money

    format_money(15000, "RUB")     -> "15 000 руб."
    format_money(1200.50, "USD")   -> "1 200 USD"
    format_money(0, "EUR")         -> "0 EUR"
"""
from decimal import Decimal

# Суффикс для RUB — «руб.», для остальных — ISO-код валюты
_CURRENCY_SUFFIX = {
    "RUB": "руб.",
}


def currency_label(code: str) -> str:
    """Человекочитаемый суффикс валюты."""
    return _CURRENCY_SUFFIX.get(code, code)


def format_money(amount, currency: str = "RUB", decimals: int = 0) -> str:
    """
    Отформатировать сумму с пробелами-разделителями тысяч и суффиксом валюты.

    Args:
        amount: число (int / float / Decimal / str)
        currency: ISO-код валюты (RUB, USD, EUR …)
        decimals: знаков после запятой (0 — целое, 2 — копейки)

    Returns:
        "15 000 руб." / "1 200 USD"
    """
    if isinstance(amount, str):
        amount = Decimal(amount)
    fmt = f"{{:,.{decimals}f}}"
    formatted = fmt.format(amount).replace(",", " ")
    return f"{formatted} {currency_label(currency)}"


def format_money2(amount, currency: str = "RUB") -> str:
    """Формат с 2 знаками после запятой (для балансов кошельков)."""
    return format_money(amount, currency, decimals=2)
