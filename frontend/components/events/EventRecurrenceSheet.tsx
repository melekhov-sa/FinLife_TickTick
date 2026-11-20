"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { DateInput } from "@/components/primitives/DateInput";
import { Select } from "@/components/ui/Select";
import { api } from "@/lib/api";

/**
 * Правка повторения события.
 *
 * Раньше за этим карточка уводила на /legacy/events/{id}/edit — в новом
 * API ручки не было вовсе: PATCH умел название, описание и категорию, но
 * не правило. Теперь есть, и прыгать в старый интерфейс незачем.
 *
 * Про существующие вхождения: при смене правила удаляются только будущие,
 * порождённые им и не отменённые. Прошлое остаётся историей, перенесённое
 * вручную переживает смену, отменённое не воскресает. Об этом сказано
 * прямо в форме — иначе непонятно, что произойдёт с уже назначенными
 * датами, и менять расписание страшно.
 */

interface Recurrence {
  freq: string | null;
  start_date_rule: string | null;
  until_date: string | null;
  rec_weekdays: string | null;
  rec_interval: number | null;
}

const REPEAT_OPTIONS = [
  { value: "", label: "Не повторяется" },
  { value: "daily", label: "Ежедневно" },
  { value: "weekly", label: "Еженедельно" },
  { value: "monthly", label: "Ежемесячно" },
  { value: "yearly", label: "Ежегодно" },
  { value: "interval", label: "Интервал (дней)" },
];

const WEEKDAYS = [
  { value: "MO", label: "Пн" }, { value: "TU", label: "Вт" },
  { value: "WE", label: "Ср" }, { value: "TH", label: "Чт" },
  { value: "FR", label: "Пт" }, { value: "SA", label: "Сб" },
  { value: "SU", label: "Вс" },
];

const labelCls = "block text-[12px] mb-1";

export function EventRecurrenceSheet({
  eventId,
  open,
  onClose,
}: {
  eventId: number;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [freq, setFreq] = useState("");
  const [weekdays, setWeekdays] = useState<string[]>([]);
  const [interval, setIntervalDays] = useState("1");
  const [untilDate, setUntilDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<Recurrence>({
    queryKey: ["event-recurrence", eventId],
    queryFn: () => api.get<Recurrence>(`/api/v2/events/${eventId}/recurrence`),
    enabled: open,
  });

  // Форма открывается заполненной текущим расписанием
  useEffect(() => {
    if (!data) return;
    setFreq(data.freq ?? "");
    setWeekdays(data.rec_weekdays ? data.rec_weekdays.split(",").filter(Boolean) : []);
    setIntervalDays(data.rec_interval ? String(data.rec_interval) : "1");
    setUntilDate(data.until_date ?? "");
  }, [data]);

  const { mutate: save, isPending } = useMutation({
    mutationFn: () =>
      api.put(`/api/v2/events/${eventId}/recurrence`, {
        freq: freq || null,
        rec_weekdays: freq === "weekly" ? weekdays.join(",") : null,
        rec_interval: freq === "interval" ? Number(interval) || 1 : null,
        until_date: untilDate || null,
      }),
    onSuccess: () => {
      // Вхождения пересобрались — обновляем всё, где они показываются
      qc.invalidateQueries({ queryKey: ["event-recurrence", eventId] });
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["plan"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: () => setError("Не удалось сохранить"),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (freq === "weekly" && weekdays.length === 0) {
      setError("Выберите хотя бы один день недели");
      return;
    }
    save();
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Повторение"
      detent="half"
      onSubmit={submit}
      footer={
        <button
          type="submit"
          disabled={isPending || isLoading}
          className="w-full rounded-lg py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--app-accent)" }}
        >
          {isPending ? "Сохраняю…" : "Сохранить"}
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <span className={labelCls} style={{ color: "var(--t-muted)" }}>
            Как часто
          </span>
          <Select
            value={freq}
            onChange={(v) => setFreq(v as string)}
            placeholder="Не повторяется"
            options={REPEAT_OPTIONS}
          />
        </div>

        {freq === "weekly" && (
          <div>
            <span className={labelCls} style={{ color: "var(--t-muted)" }}>
              Дни недели
            </span>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => {
                const active = weekdays.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() =>
                      setWeekdays((prev) =>
                        active ? prev.filter((x) => x !== d.value) : [...prev, d.value],
                      )
                    }
                    className={clsx(
                      "px-2.5 py-1.5 rounded-lg text-[12px] font-medium border transition-colors",
                      active
                        ? "bg-[var(--app-accent)] border-[var(--app-accent)] text-[#fff]"
                        : "border-[var(--app-border)]",
                    )}
                    style={active ? undefined : { color: "var(--t-secondary)" }}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {freq === "interval" && (
          <label className="block">
            <span className={labelCls} style={{ color: "var(--t-muted)" }}>
              Каждые N дней
            </span>
            <input
              type="number"
              min={1}
              value={interval}
              onChange={(e) => setIntervalDays(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-[14px]"
              style={{
                background: "var(--app-card-bg)",
                border: "1px solid var(--app-border)",
                color: "var(--t-primary)",
              }}
            />
          </label>
        )}

        {freq && (
          <div>
            <span className={labelCls} style={{ color: "var(--t-muted)" }}>
              Повторять до
            </span>
            <DateInput value={untilDate} onChange={setUntilDate} placeholder="Бессрочно" />
          </div>
        )}

        <p className="text-[11px] leading-relaxed" style={{ color: "var(--t-faint)" }}>
          {freq
            ? "Будущие даты пересоберутся по новому расписанию. Прошедшие, перенесённые вручную и отменённые останутся как есть."
            : "Повторение выключится: будущие даты по расписанию уберутся, прошедшие и перенесённые вручную останутся."}
        </p>

        {error && <p className="text-[12px] text-red-500 font-medium">{error}</p>}
      </div>
    </BottomSheet>
  );
}
