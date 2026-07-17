"use client";

/**
 * Проверки события: да/нет-вопросы, которые всплывут перед каждым
 * повторением («Взнос 900₽ наличными — деньги есть?»).
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { HelpCircle, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { Input } from "@/components/primitives/Input";
import { Button } from "@/components/primitives/Button";
import { Select, type SelectOption } from "@/components/ui/Select";

interface CheckItem {
  check_id: number;
  question: string;
  days_before: number;
  fallback_task_title: string;
}

const DAYS_OPTIONS: SelectOption[] = [
  { value: "0", label: "В день события" },
  { value: "1", label: "За 1 день" },
  { value: "2", label: "За 2 дня" },
  { value: "3", label: "За 3 дня" },
  { value: "7", label: "За неделю" },
];

export function EventChecks({ eventId }: { eventId: number }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [question, setQuestion] = useState("");
  const [daysBefore, setDaysBefore] = useState("1");
  const [fallbackTitle, setFallbackTitle] = useState("");

  const { data: checks } = useQuery<CheckItem[]>({
    queryKey: ["event-checks", eventId],
    queryFn: () => api.get<CheckItem[]>(`/api/v2/checks?event_id=${eventId}`),
  });

  const createMut = useMutation({
    mutationFn: () =>
      api.post("/api/v2/checks", {
        question: question.trim(),
        event_id: eventId,
        days_before: Number(daysBefore),
        fallback_task_title: fallbackTitle.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-checks", eventId] });
      qc.invalidateQueries({ queryKey: ["checks-pending"] });
      setQuestion("");
      setFallbackTitle("");
      setAdding(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (checkId: number) => api.delete(`/api/v2/checks/${checkId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-checks", eventId] });
      qc.invalidateQueries({ queryKey: ["checks-pending"] });
    },
  });

  const daysLabel = (n: number) =>
    DAYS_OPTIONS.find((o) => o.value === String(n))?.label.toLowerCase() ?? `за ${n} дн.`;

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: "var(--t-faint)" }}>
        <HelpCircle size={12} />
        Проверки перед событием
      </p>

      {(checks ?? []).length > 0 && (
        <div className="space-y-1.5 mb-2">
          {(checks ?? []).map((c) => (
            <div
              key={c.check_id}
              className="flex items-start gap-2 rounded-xl border px-3 py-2.5"
              style={{ borderColor: "var(--app-border)", background: "var(--app-card-bg)" }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium" style={{ color: "var(--t-primary)" }}>{c.question}</p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--t-faint)" }}>
                  Спросить {daysLabel(c.days_before)}
                  {c.fallback_task_title && ` · при «Нет»: задача «${c.fallback_task_title}»`}
                </p>
              </div>
              <button
                type="button"
                aria-label="Удалить проверку"
                onClick={() => deleteMut.mutate(c.check_id)}
                className="w-7 h-7 flex items-center justify-center rounded-md transition-colors hover:bg-red-500/10 shrink-0"
                style={{ color: "var(--t-faint)" }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {!adding ? (
        <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
          <Plus size={13} className="mr-1" /> Добавить проверку
        </Button>
      ) : (
        <div
          className="rounded-xl border p-3 space-y-2"
          style={{ borderColor: "var(--app-border)", background: "var(--app-card-bg)" }}
        >
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Вопрос: «Взнос 900 ₽ наличными — деньги есть?»"
            autoFocus
          />
          <Select value={daysBefore} onChange={setDaysBefore} options={DAYS_OPTIONS} />
          <Input
            value={fallbackTitle}
            onChange={(e) => setFallbackTitle(e.target.value)}
            placeholder="Задача при «Нет» (необязательно)"
          />
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              loading={createMut.isPending}
              disabled={!question.trim()}
              onClick={() => createMut.mutate()}
            >
              Сохранить
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setAdding(false)}>
              Отмена
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
