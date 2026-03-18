"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { FinCategoryItem } from "@/types/api";
import { Select } from "@/components/ui/Select";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { parseBackendErrors, inputErrorBorder, errTextCls, type FieldErrors } from "@/lib/formErrors";

interface Props {
  onClose: () => void;
}

const inputCls =
  "w-full px-3 h-10 text-base md:text-sm rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/85 placeholder-white/25 focus:outline-none focus:border-indigo-500/60 transition-colors";
const labelCls =
  "block text-[11px] md:text-xs font-medium text-white/72 uppercase tracking-wider mb-1.5";

export function CreateSubscriptionModal({ onClose }: Props) {
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [expenseCategoryId, setExpenseCategoryId] = useState<number | "">("");
  const [incomeCategoryId, setIncomeCategoryId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  const { data: finCats } = useQuery<FinCategoryItem[]>({
    queryKey: ["fin-categories"],
    queryFn: () => api.get<FinCategoryItem[]>("/api/v2/fin-categories"),
    staleTime: 5 * 60_000,
  });

  const expenseOptions = (finCats ?? [])
    .filter((c) => c.category_type === "EXPENSE")
    .map((c) => ({ value: String(c.category_id), label: c.title }));

  const incomeOptions = (finCats ?? [])
    .filter((c) => c.category_type === "INCOME")
    .map((c) => ({ value: String(c.category_id), label: c.title }));

  function clearFieldError(field: string) {
    if (fieldErrors[field]) setFieldErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: FieldErrors = {};
    if (!name.trim()) errs.name = "Введите название подписки";
    if (!expenseCategoryId) errs.expense_category_id = "Выберите категорию расхода";
    if (!incomeCategoryId) errs.income_category_id = "Выберите категорию дохода";

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setError(null);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v2/subscriptions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          expense_category_id: expenseCategoryId,
          income_category_id: incomeCategoryId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const parsed = parseBackendErrors(res.status, data);
        if (parsed.fieldErrors) setFieldErrors(parsed.fieldErrors);
        else setError(parsed.message ?? "Ошибка при создании подписки");
        return;
      }
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    } catch {
      setError("Не удалось подключиться к серверу");
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <div className="flex gap-2.5">
      <button
        type="submit"
        disabled={saving}
        className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors"
      >
        {saving ? "Создаём…" : "Создать подписку"}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2.5 text-sm font-medium rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/60 hover:bg-white/[0.08] transition-colors hidden md:block"
      >
        Отмена
      </button>
    </div>
  );

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Новая подписка"
      footer={footer}
      onSubmit={handleSubmit}
    >
      {/* Название */}
      <div>
        <label className={labelCls}>Название *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); clearFieldError("name"); }}
          placeholder="Например: YouTube Premium"
          className={`${inputCls} ${fieldErrors.name ? inputErrorBorder : ""}`}
          autoFocus
        />
        {fieldErrors.name && <p className={errTextCls}>{fieldErrors.name}</p>}
      </div>

      {/* Категория расхода */}
      <div>
        <label className={labelCls}>Категория расхода *</label>
        <Select
          value={expenseCategoryId}
          onChange={(v) => { setExpenseCategoryId(v ? Number(v) : ""); clearFieldError("expense_category_id"); }}
          placeholder="— выберите категорию —"
          options={[
            { value: "", label: "— выберите категорию —" },
            ...expenseOptions,
          ]}
        />
        {fieldErrors.expense_category_id && <p className={errTextCls}>{fieldErrors.expense_category_id}</p>}
      </div>

      {/* Категория дохода */}
      <div>
        <label className={labelCls}>Категория дохода *</label>
        <Select
          value={incomeCategoryId}
          onChange={(v) => { setIncomeCategoryId(v ? Number(v) : ""); clearFieldError("income_category_id"); }}
          placeholder="— выберите категорию —"
          options={[
            { value: "", label: "— выберите категорию —" },
            ...incomeOptions,
          ]}
        />
        {fieldErrors.income_category_id && <p className={errTextCls}>{fieldErrors.income_category_id}</p>}
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
          {error}
        </p>
      )}
    </BottomSheet>
  );
}
