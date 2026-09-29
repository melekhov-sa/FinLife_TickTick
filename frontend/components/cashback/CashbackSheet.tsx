"use client";

import { useMemo } from "react";
import Link from "next/link";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { CashbackRows } from "@/components/cashback/CashbackRows";
import { monthKey, monthLabel, useCashbackMonth } from "@/hooks/useCashback";

/**
 * Быстрый просмотр кэшбеков за текущий месяц — открывается из блока «Финансы»
 * на дашборде. Только чтение: вносить ставки нужно на странице /cashback.
 */
export function CashbackSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const now = useMemo(() => new Date(), []);
  const month = monthKey(now);
  const { data, isLoading } = useCashbackMonth(month);

  // В быстром просмотре пустые карты — шум, поэтому скрываем их
  // (на странице /cashback они, наоборот, показаны — есть куда добавлять).
  const cards = (data?.cards ?? []).filter((c) => c.entries.length > 0);

  return (
    <BottomSheet open={open} onClose={onClose} title={`Кэшбек · ${monthLabel(now)}`} detent="half">
      {isLoading ? (
        <p className="text-[13px]" style={{ color: "var(--t-faint)" }}>
          Загрузка…
        </p>
      ) : cards.length === 0 ? (
        <div className="space-y-3">
          <p className="text-[13px]" style={{ color: "var(--t-muted)" }}>
            На этот месяц ставок ещё нет.
          </p>
          <Link
            href="/cashback"
            onClick={onClose}
            className="inline-block text-[13px] font-semibold"
            style={{ color: "var(--app-accent)" }}
          >
            Заполнить кэшбеки →
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <CashbackRows cards={cards} />
          <Link
            href="/cashback"
            onClick={onClose}
            className="inline-block text-[12px]"
            style={{ color: "var(--app-accent)" }}
          >
            Изменить →
          </Link>
        </div>
      )}
    </BottomSheet>
  );
}
