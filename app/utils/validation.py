"""
Validation utilities
"""
import re
from decimal import Decimal, InvalidOperation


def normalize_decimal_input(value: str) -> str:
    """
    Нормализовать ввод суммы: заменить запятую на точку

    Args:
        value: Строка с суммой (может содержать точку или запятую)

    Returns:
        Нормализованная строка с точкой

    Example:
        >>> normalize_decimal_input("100,50")
        "100.50"
        >>> normalize_decimal_input("100.50")
        "100.50"
    """
    return value.replace(",", ".")


def validate_decimal_amount(value: str, max_decimal_places: int = 2) -> tuple[bool, str | None]:
    """
    Валидация денежной суммы

    Args:
        value: Строка с суммой
        max_decimal_places: Максимум знаков после запятой (по умолчанию 2)

    Returns:
        (is_valid, error_message)

    Example:
        >>> validate_decimal_amount("100.50")
        (True, None)
        >>> validate_decimal_amount("100.505")
        (False, "Максимум 2 знака после запятой")
    """
    # Нормализовать (заменить запятую на точку)
    normalized = normalize_decimal_input(value)

    # Проверить что это валидное число
    try:
        decimal_value = Decimal(normalized)
    except (InvalidOperation, ValueError):
        return False, "Некорректная сумма"

    # Проверить количество знаков после запятой
    # Используем регулярку для проверки
    pattern = rf"^-?\d+(\.\d{{1,{max_decimal_places}}})?$"
    if not re.match(pattern, normalized):
        return False, f"Максимум {max_decimal_places} знака после запятой"

    return True, None


def validate_and_normalize_amount(value: str, max_decimal_places: int = 2) -> str:
    """
    Валидировать и нормализовать сумму (raise exception при ошибке)

    Args:
        value: Строка с суммой
        max_decimal_places: Максимум знаков после запятой

    Returns:
        Нормализованная строка

    Raises:
        ValueError: если валидация не прошла

    Example:
        >>> validate_and_normalize_amount("100,50")
        "100.50"
        >>> validate_and_normalize_amount("100.505")
        ValueError: Максимум 2 знака после запятой
    """
    is_valid, error = validate_decimal_amount(value, max_decimal_places)
    if not is_valid:
        raise ValueError(error)

    return normalize_decimal_input(value)
