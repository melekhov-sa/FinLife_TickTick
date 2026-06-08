"use client";

import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { api } from "@/lib/api";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Skeleton } from "@/components/primitives/Skeleton";
import type { CollectionItem, CollectionPriceHistory } from "@/types/api";

const fmt = (n: number) => n.toLocaleString("ru-RU");

interface Props {
  item: CollectionItem;
  onClose: () => void;
}

export function PriceHistoryModal({ item, onClose }: Props) {
  const { data: history = [], isLoading } = useQuery<CollectionPriceHistory[]>({
    queryKey: ["collection-price-history", item.id],
    queryFn: () => api.get<CollectionPriceHistory[]>(`/api/v2/collection/items/${item.id}/price-history`),
  });

  const label = item.name ?? item.serial_number ?? `#${item.id}`;

  return (
    <BottomSheet open title={`История цен — ${label}`} onClose={onClose}>
      <div className="space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-center text-slate-400 dark:text-white/35 py-8">
            История цен пуста
          </p>
        ) : (
          <>
            <div className="rounded-xl border border-[var(--app-accent)] bg-[var(--app-accent)]/[0.06] px-4 py-3 flex justify-between items-center mb-3">
              <span className="text-xs text-[var(--t-muted)]">Текущая цена</span>
              <span className="font-bold tabular-nums text-[var(--app-accent)]">{fmt(item.current_value)} ₽</span>
            </div>

            {history.map((entry, idx) => {
              const prev = history[idx + 1];
              const diff = prev ? entry.value - prev.value : null;
              const pct = prev && prev.value > 0 ? ((diff! / prev.value) * 100).toFixed(1) : null;
              const up = diff !== null && diff > 0;
              const down = diff !== null && diff < 0;
              const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
              const color = up ? "text-emerald-500" : down ? "text-red-400" : "text-slate-400";

              return (
                <div key={entry.id}
                  className="flex items-center justify-between rounded-xl border border-[var(--bdr)] bg-[var(--card-bg)] px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold tabular-nums text-[var(--t-primary)]">{fmt(entry.value)} ₽</p>
                    <p className="text-xs text-[var(--t-muted)]">{entry.valued_at}</p>
                  </div>
                  {diff !== null && (
                    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${color}`}>
                      <Icon size={11} />
                      {diff > 0 ? "+" : ""}{fmt(diff)} ₽
                      {pct !== null && ` (${diff > 0 ? "+" : ""}${pct}%)`}
                    </span>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </BottomSheet>
  );
}
