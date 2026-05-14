"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Select } from "@/components/ui/Select";

interface GoalData {
  goal_id: number;
  title: string;
  currency: string;
  target_amount: string | null;
}

interface Props {
  /** If provided, form is in edit mode; otherwise create mode */
  goal?: GoalData;
  onClose: () => void;
  onSubmit: (values: { title: string; currency: string; target_amount: string | null }) => Promise<void>;
}

const CURRENCIES = [
  { value: "RUB", label: "₽ RUB" },
  { value: "USD", label: "$ USD" },
  { value: "EUR", label: "€ EUR" },
  { value: "GBP", label: "£ GBP" },
];

const inputCls =
  "w-full px-3 h-10 text-base rounded-xl border focus:outline-none focus:border-indigo-500/60 transition-colors bg-white dark:bg-white/[0.05] border-slate-300 dark:border-white/[0.08] text-slate-800 dark:text-white/85 placeholder-slate-400 dark:placeholder-white/25";
const labelCls =
  "block text-[11px] md:text-xs font-medium uppercase tracking-wider mb-1.5 text-slate-500 dark:text-white/72";

export function GoalFormModal({ goal, onClose, onSubmit }: Props) {
  const isEdit = !!goal;

  const [title, setTitle] = useState(goal?.title ?? "");
  const [currency, setCurrency] = useState(goal?.currency ?? "RUB");
  const [targetAmount, setTargetAmount] = useState(goal?.target_amount ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) {
      setError("Введите название цели");
      return;
    }

    const ta = targetAmount.trim();
    if (ta && (isNaN(Number(ta)) || Number(ta) < 0)) {
      setError("Целевая сумма должна быть положительным числом");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        title: t,
        currency,
        target_amount: ta || null,
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      const match = msg.match(/API error \d+: ([\s\S]*)/);
      if (match) {
        try {
          setError(JSON.parse(match[1])?.detail ?? "Ошибка");
        } catch {
          setError("Ошибка при сохранении");
        }
      } else {
        setError("Не удалось подключиться к серверу");
      }
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <div className="flex gap-2.5">
      <button
        type="submit"
        disabled={saving}
        className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-indigo-600 hover:bg-indigo-500 text-[#fff] disabled:opacity-50 transition-colors"
      >
        {saving ? "Сохраняем…" : isEdit ? "Сохранить" : "Создать"}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2.5 text-sm font-medium rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/68 hover:text-white/65 hover:bg-white/[0.08] transition-colors hidden md:block"
      >
        Отмена
      </button>
    </div>
  );

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={isEdit ? "Редактировать цель" : "Новая цель"}
      footer={footer}
      onSubmit={handleSubmit}
    >
      {/* Title */}
      <div>
        <label className={labelCls}>Название *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setError(null); }}
          placeholder="Например: Отпуск"
          className={inputCls}
          autoFocus
        />
      </div>

      {/* Currency — locked when editing */}
      <div>
        <label className={labelCls}>Валюта</label>
        {isEdit ? (
          <div
            className="w-full px-3 h-10 flex items-center rounded-xl border text-base"
            style={{
              background: "var(--app-card-bg)",
              borderColor: "var(--app-border)",
              color: "var(--t-muted)",
            }}
          >
            {CURRENCIES.find((c) => c.value === currency)?.label ?? currency}
            <span className="ml-auto text-[11px]" style={{ color: "var(--t-faint)" }}>
              нельзя изменить
            </span>
          </div>
        ) : (
          <Select
            value={currency}
            onChange={(v) => setCurrency(v)}
            options={CURRENCIES}
          />
        )}
      </div>

      {/* Target amount */}
      <div>
        <label className={labelCls}>Целевая сумма (необязательно)</label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={targetAmount}
          onChange={(e) => { setTargetAmount(e.target.value); setError(null); }}
          placeholder="0 — без лимита"
          className={inputCls}
        />
        <p className="text-[10px] mt-1" style={{ color: "var(--t-faint)" }}>
          Если не указать — цель без конкретной суммы, будет отображаться только баланс
        </p>
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
          {error}
        </p>
      )}
    </BottomSheet>
  );
}
