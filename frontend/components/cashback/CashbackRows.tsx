"use client";

import { CreditCard } from "lucide-react";
import { getCategoryEmoji } from "@/lib/categoryEmoji";
import type { CashbackCard } from "@/types/api";

/**
 * «Карта → её ставки» с подсветкой. Используется И страницей, И шторкой,
 * чтобы правило отображения лежало в одном месте.
 *
 * Флаги is_best / is_outranked считает бэкенд (app/application/cashback.py):
 * категория на одной карте — нейтральна, на двух и более — лучшая акцентом,
 * проигравшая приглушена.
 */
function percentColor(entry: { is_best: boolean; is_outranked: boolean }) {
  if (entry.is_best) return "var(--app-accent)";
  if (entry.is_outranked) return "var(--t-faint)";
  return "var(--t-secondary)";
}

export function CashbackRows({
  cards,
  onEntryClick,
}: {
  cards: CashbackCard[];
  onEntryClick?: (entryId: number, percent: number) => void;
}) {
  return (
    <div className="space-y-4">
      {cards.map((card) => (
        <div key={card.wallet_id}>
          <div className="flex items-center gap-2 mb-2">
            <CreditCard size={15} style={{ color: "var(--t-muted)" }} />
            <span className="text-[13px] font-semibold" style={{ color: "var(--t-primary)" }}>
              {card.title}
            </span>
          </div>

          {card.entries.length === 0 ? (
            <p className="text-[12px] pl-6" style={{ color: "var(--t-faint)" }}>
              Ставок на этот месяц нет
            </p>
          ) : (
            <div className="space-y-1 pl-6">
              {card.entries.map((entry) => {
                const emoji = getCategoryEmoji(entry.category_title);
                return (
                  <button
                    key={entry.id}
                    type="button"
                    disabled={!onEntryClick}
                    onClick={() => onEntryClick?.(entry.id, Number(entry.percent))}
                    className="w-full flex items-baseline justify-between gap-2 text-left disabled:cursor-default"
                  >
                    <span className="text-[13px]" style={{ color: "var(--t-muted)" }}>
                      {emoji ? `${emoji} ` : ""}
                      {entry.category_title}
                    </span>
                    <span
                      className="text-[13px] tabular-nums"
                      style={{
                        color: percentColor(entry),
                        fontWeight: entry.is_best ? 700 : 500,
                      }}
                    >
                      {Number(entry.percent)}%
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
