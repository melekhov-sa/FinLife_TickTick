import type { WalletItem } from "@/types/api";

/**
 * Порядок кошельков в пикерах операций: чем чаще кошельком пользуются,
 * тем он выше. Частота — число операций за 90 дней (считает бэкенд,
 * app/application/wallet_usage.py).
 *
 * Счётчик может прийти undefined из персистентного кэша react-query,
 * сохранённого прошлой версией фронта, поэтому `?? 0` обязателен —
 * иначе NaN в компараторе и порядок случайный.
 *
 * Равные счётчики (в частности все нули у нового аккаунта) разводятся
 * по алфавиту, чтобы список не прыгал между рендерами.
 */
export function sortWalletsByUsage<T extends WalletItem>(wallets: readonly T[]): T[] {
  return [...wallets].sort((a, b) => {
    const diff = (b.operations_count_90d ?? 0) - (a.operations_count_90d ?? 0);
    if (diff !== 0) return diff;
    return a.title.localeCompare(b.title, "ru");
  });
}
