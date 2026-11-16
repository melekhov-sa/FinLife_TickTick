"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { DateInput } from "@/components/primitives/DateInput";
import { api } from "@/lib/api";
import type { ExpiringSub } from "@/types/api";

/**
 * Продление подписки в два тапа прямо с дашборда.
 *
 * Пресеты считаются от СТАРОЙ даты окончания, а не от сегодня: подписка,
 * оплаченная до 15 октября и продлённая на год в ноябре, действует до
 * 15 октября следующего года. Иначе дата ползла бы вперёд с каждым
 * опозданием и за несколько лет уехала бы на месяцы.
 */

function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  // 31 января + 1 месяц → 28/29 февраля, а не 3 марта
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

function formatHuman(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const PRESETS: { label: string; months: number }[] = [
  { label: "+1 месяц", months: 1 },
  { label: "+3 месяца", months: 3 },
  { label: "+6 месяцев", months: 6 },
  { label: "+1 год", months: 12 },
];

interface Props {
  sub: ExpiringSub | null;
  onClose: () => void;
}

export function RenewSubSheet({ sub, onClose }: Props) {
  const qc = useQueryClient();
  const [value, setValue] = useState("");

  // Каждая новая подписка открывает шит со своей исходной датой
  useEffect(() => {
    if (sub) setValue(sub.paid_until);
  }, [sub]);

  const { mutate: renew, isPending } = useMutation({
    mutationFn: ({ paidUntil }: { paidUntil: string }) =>
      api.post(`/api/v2/subscriptions/${sub!.subscription_id}/renew`, {
        member_id: sub!.member_id,
        paid_until: paidUntil,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      onClose();
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value || isPending) return;
    renew({ paidUntil: value });
  }

  const changed = Boolean(sub) && value !== sub!.paid_until;

  return (
    <BottomSheet
      open={sub !== null}
      onClose={onClose}
      title="Продлить подписку"
      detent="half"
      onSubmit={submit}
      footer={
        <button
          type="submit"
          disabled={!changed || isPending}
          className="w-full rounded-lg py-2.5 text-[14px] font-semibold text-white disabled:opacity-40"
          style={{ background: "var(--app-accent)" }}
        >
          {isPending ? "Сохраняю…" : changed ? `Продлил до ${formatHuman(value)}` : "Выбери новую дату"}
        </button>
      }
    >
      {sub && (
        <div className="space-y-4">
          <div>
            <p className="text-[15px] font-semibold" style={{ color: "var(--t-primary)" }}>
              {sub.subscription_title}
            </p>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--t-muted)" }}>
              {sub.contact_name} · было оплачено до {formatHuman(sub.paid_until)}
            </p>
          </div>

          <div>
            <p className="text-[12px] mb-1.5" style={{ color: "var(--t-muted)" }}>
              До какой даты продлил
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => {
                const next = addMonths(sub.paid_until, p.months);
                const active = value === next;
                return (
                  <button
                    key={p.months}
                    type="button"
                    onClick={() => setValue(next)}
                    className="px-3 py-2 text-[12px] font-medium rounded-xl border transition-colors"
                    style={
                      active
                        ? {
                            background: "var(--app-accent)",
                            borderColor: "var(--app-accent)",
                            color: "#fff",
                          }
                        : {
                            background: "var(--app-card-bg)",
                            borderColor: "var(--app-border)",
                            color: "var(--t-secondary)",
                          }
                    }
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[12px] mb-1.5" style={{ color: "var(--t-muted)" }}>
              Или точная дата
            </p>
            <DateInput value={value} onChange={setValue} />
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
