"use client";

/**
 * Всплывающий да/нет-вопрос («Турнир завтра, взнос 900₽ наличными — деньги
 * есть?»). Появляется сам при открытии/возврате в приложение, если есть
 * неотвеченные проверки. «Нет» → выбор даты → создаётся задача.
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, HelpCircle } from "lucide-react";
import { api } from "@/lib/api";
import { DateInput } from "@/components/primitives/DateInput";
import { hapticSuccess, hapticTick } from "@/lib/native";

interface PendingCheck {
  check_id: number;
  question: string;
  occurrence_date: string;
  event_title: string | null;
  days_left: number;
  has_fallback: boolean;
  fallback_task_title: string;
}

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isoTomorrow(): string {
  const d = new Date(Date.now() + 86400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" });
}

export function CheckPrompt() {
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [noMode, setNoMode] = useState(false);
  const [customDate, setCustomDate] = useState("");

  const { data: items } = useQuery<PendingCheck[]>({
    queryKey: ["checks-pending"],
    queryFn: () => api.get<PendingCheck[]>("/api/v2/checks/pending"),
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const answerMut = useMutation({
    mutationFn: (p: { check_id: number; occurrence_date: string; answer: "YES" | "NO"; task_date?: string }) =>
      api.post<{ ok: boolean; task_id: number | null }>(`/api/v2/checks/${p.check_id}/answer`, {
        occurrence_date: p.occurrence_date,
        answer: p.answer,
        task_date: p.task_date ?? null,
      }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["checks-pending"] });
      if (vars.answer === "NO") {
        qc.invalidateQueries({ queryKey: ["plan"] });
        qc.invalidateQueries({ queryKey: ["tasks"] });
        qc.invalidateQueries({ queryKey: ["dashboard"] });
      }
    },
  });

  const current = (items ?? []).find(
    (i) => !dismissed.has(`${i.check_id}:${i.occurrence_date}`),
  );
  if (!current || typeof document === "undefined") return null;

  const key = `${current.check_id}:${current.occurrence_date}`;

  function later() {
    void hapticTick();
    setDismissed((prev) => new Set(prev).add(key));
    setNoMode(false);
    setCustomDate("");
  }

  function answerYes() {
    void hapticSuccess();
    answerMut.mutate({ check_id: current!.check_id, occurrence_date: current!.occurrence_date, answer: "YES" });
    setNoMode(false);
  }

  function answerNo(taskDate?: string) {
    // без fallback-задачи «Нет» просто фиксируется
    void hapticSuccess();
    answerMut.mutate({
      check_id: current!.check_id,
      occurrence_date: current!.occurrence_date,
      answer: "NO",
      task_date: taskDate,
    });
    setNoMode(false);
    setCustomDate("");
  }

  const eventInFuture = current.occurrence_date > isoToday();

  const modal = (
    <div className="fixed inset-0 z-[10005] flex items-center justify-center px-5 bg-black/55 backdrop-blur-sm animate-overlay-fade">
      <div
        className="w-full max-w-sm rounded-3xl p-5 shadow-2xl animate-pop"
        style={{ background: "var(--app-sheet-bg, var(--app-card-bg))", border: "1px solid var(--app-border)" }}
      >
        {/* Контекст */}
        <div className="flex items-center gap-2 mb-3">
          <span
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "var(--app-accent-weak)", color: "var(--app-accent)" }}
          >
            <HelpCircle size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--t-faint)" }}>
              Проверь себя
            </p>
            {current.event_title && (
              <p className="text-[12px] truncate" style={{ color: "var(--t-muted)" }}>
                📅 {current.event_title} ·{" "}
                {current.days_left === 0 ? "сегодня" : current.days_left === 1 ? "завтра" : fmtDate(current.occurrence_date)}
              </p>
            )}
          </div>
        </div>

        {/* Вопрос */}
        <p className="text-[17px] font-semibold leading-snug mb-4" style={{ color: "var(--t-primary)" }}>
          {current.question}
        </p>

        {!noMode ? (
          <>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={answerYes}
                className="flex-1 h-12 rounded-2xl font-bold text-[15px] text-white transition-all active:scale-[0.97]"
                style={{ background: "var(--c-success-ink)" }}
              >
                ✅ Да
              </button>
              <button
                type="button"
                onClick={() => {
                  void hapticTick();
                  if (current.has_fallback) setNoMode(true);
                  else answerNo();
                }}
                className="flex-1 h-12 rounded-2xl font-bold text-[15px] text-white transition-all active:scale-[0.97]"
                style={{ background: "var(--c-danger-ink)" }}
              >
                ❌ Нет
              </button>
            </div>
            <button
              type="button"
              onClick={later}
              className="w-full mt-2.5 h-9 text-[13px] font-medium"
              style={{ color: "var(--t-faint)" }}
            >
              Позже
            </button>
          </>
        ) : (
          <>
            <p className="text-[12px] mb-2" style={{ color: "var(--t-muted)" }}>
              Создам задачу «{current.fallback_task_title}» — на когда?
            </p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <button
                type="button"
                onClick={() => answerNo(isoToday())}
                className="h-10 rounded-xl text-[13px] font-semibold"
                style={{ background: "var(--app-accent-weak)", color: "var(--app-accent)" }}
              >
                Сегодня
              </button>
              <button
                type="button"
                onClick={() => answerNo(isoTomorrow())}
                className="h-10 rounded-xl text-[13px] font-semibold"
                style={{ background: "var(--app-accent-weak)", color: "var(--app-accent)" }}
              >
                Завтра
              </button>
              {eventInFuture && (
                <button
                  type="button"
                  onClick={() => answerNo(current.occurrence_date)}
                  className="h-10 rounded-xl text-[13px] font-semibold col-span-2"
                  style={{ background: "var(--app-accent-weak)", color: "var(--app-accent)" }}
                >
                  <CalendarDays size={13} className="inline mr-1" />
                  В день события ({fmtDate(current.occurrence_date)})
                </button>
              )}
            </div>
            <div className="flex gap-2 items-center">
              <div className="flex-1">
                <DateInput value={customDate} onChange={setCustomDate} />
              </div>
              <button
                type="button"
                disabled={!customDate}
                onClick={() => answerNo(customDate)}
                className="h-10 px-4 rounded-xl text-[13px] font-bold text-white disabled:opacity-40"
                style={{ background: "var(--app-accent)" }}
              >
                ОК
              </button>
            </div>
            <button
              type="button"
              onClick={() => setNoMode(false)}
              className="w-full mt-2.5 h-9 text-[13px] font-medium"
              style={{ color: "var(--t-faint)" }}
            >
              Назад
            </button>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
