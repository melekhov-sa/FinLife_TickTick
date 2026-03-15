"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkCategoryItem } from "@/types/api";

interface Props {
  onClose: () => void;
}

const inputCls = "w-full px-3 h-9 text-sm rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/85 placeholder-white/25 focus:outline-none focus:border-indigo-500/60 transition-colors [color-scheme:dark]";
const labelCls = "block text-xs font-medium text-white/72 uppercase tracking-wider mb-1.5";

const FREQ_OPTIONS = [
  { value: "DAILY",   label: "Каждый день" },
  { value: "WEEKLY",  label: "Еженедельно" },
  { value: "MONTHLY", label: "Ежемесячно" },
];

const WEEKDAYS = [
  { value: "0", label: "Пн" },
  { value: "1", label: "Вт" },
  { value: "2", label: "Ср" },
  { value: "3", label: "Чт" },
  { value: "4", label: "Пт" },
  { value: "5", label: "Сб" },
  { value: "6", label: "Вс" },
];

const LEVELS = [
  { value: 1, label: "Просто" },
  { value: 2, label: "Средне" },
  { value: 3, label: "Сложно" },
];

export function CreateHabitModal({ onClose }: Props) {
  const qc = useQueryClient();
  const overlayRef = useRef<HTMLDivElement>(null);

  const [title, setTitle] = useState("");
  const [freq, setFreq] = useState("DAILY");
  const [weekdays, setWeekdays] = useState<string[]>([]);
  const [byMonthday, setByMonthday] = useState("");
  const [level, setLevel] = useState(1);
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: categories } = useQuery<WorkCategoryItem[]>({
    queryKey: ["work-categories"],
    queryFn: () => fetch("/api/v2/work-categories", { credentials: "include" }).then((r) => r.json()),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  function toggleWeekday(v: string) {
    setWeekdays((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Введите название"); return; }
    if (freq === "WEEKLY" && weekdays.length === 0) { setError("Выберите хотя бы один день недели"); return; }
    if (freq === "MONTHLY" && !byMonthday) { setError("Укажите день месяца"); return; }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v2/habits", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          freq,
          by_weekday: freq === "WEEKLY" ? weekdays.join(",") : null,
          by_monthday: freq === "MONTHLY" ? Number(byMonthday) : null,
          level,
          category_id: categoryId || null,
          note: note.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? "Ошибка при создании привычки");
        return;
      }
      qc.invalidateQueries({ queryKey: ["habits"] });
      onClose();
    } catch {
      setError("Не удалось подключиться к серверу");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="w-full max-w-md mx-4 bg-[#1a1d23] border border-white/[0.09] rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/[0.06]">
          <h2 className="text-base font-semibold text-white/90" style={{ letterSpacing: "-0.02em" }}>
            Создать привычку
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.07] flex items-center justify-center text-white/65 hover:text-white/65 hover:bg-white/[0.07] transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className={labelCls}>Название *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Название привычки"
              className={`${inputCls} h-10`}
              autoFocus
            />
          </div>

          {categories && categories.length > 0 && (
            <div>
              <label className={labelCls}>Категория</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : "")}
                className={inputCls}
              >
                <option value="">— без категории —</option>
                {categories.map((c) => (
                  <option key={c.category_id} value={c.category_id}>
                    {c.emoji ? `${c.emoji} ` : ""}{c.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Freq */}
          <div>
            <label className={labelCls}>Повторение</label>
            <div className="flex gap-1.5">
              {FREQ_OPTIONS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFreq(f.value)}
                  className={`flex-1 py-2 text-xs font-medium rounded-xl border transition-colors ${
                    freq === f.value
                      ? "bg-indigo-600 border-indigo-500 text-white"
                      : "bg-white/[0.03] border-white/[0.08] text-white/72 hover:text-white/65 hover:bg-white/[0.05]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {freq === "WEEKLY" && (
            <div>
              <label className={labelCls}>Дни недели</label>
              <div className="flex gap-1.5 flex-wrap">
                {WEEKDAYS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleWeekday(d.value)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-xl border transition-colors ${
                      weekdays.includes(d.value)
                        ? "bg-indigo-600 border-indigo-500 text-white"
                        : "bg-white/[0.03] border-white/[0.08] text-white/72 hover:text-white/65 hover:bg-white/[0.05]"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {freq === "MONTHLY" && (
            <div>
              <label className={labelCls}>День месяца (1–31)</label>
              <input
                type="number"
                min="1"
                max="31"
                value={byMonthday}
                onChange={(e) => setByMonthday(e.target.value)}
                className={inputCls}
              />
            </div>
          )}

          {/* Level */}
          <div>
            <label className={labelCls}>Уровень сложности</label>
            <div className="flex gap-1.5">
              {LEVELS.map((l) => (
                <button
                  key={l.value}
                  type="button"
                  onClick={() => setLevel(l.value)}
                  className={`flex-1 py-2 text-xs font-medium rounded-xl border transition-colors ${
                    level === l.value
                      ? "bg-indigo-600 border-indigo-500 text-white"
                      : "bg-white/[0.03] border-white/[0.08] text-white/72 hover:text-white/65 hover:bg-white/[0.05]"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <label className={labelCls}>Заметка</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Необязательно"
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/85 placeholder-white/25 focus:outline-none focus:border-indigo-500/60 transition-colors resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors"
            >
              {saving ? "Создаём…" : "Создать привычку"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/68 hover:text-white/65 hover:bg-white/[0.08] transition-colors"
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
