"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkCategoryItem } from "@/types/api";
import { Select } from "@/components/ui/Select";
import { BottomSheet } from "@/components/ui/BottomSheet";

interface Props {
  onClose: () => void;
}

const inputCls = "w-full px-3 h-9 text-base md:text-sm rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/85 placeholder-white/25 focus:outline-none focus:border-indigo-500/60 transition-colors [color-scheme:dark]";
const labelCls = "block text-[11px] md:text-xs font-medium text-white/72 uppercase tracking-wider mb-1.5";

export function CreateEventModal({ onClose }: Props) {
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: categories } = useQuery<WorkCategoryItem[]>({
    queryKey: ["work-categories"],
    queryFn: () => fetch("/api/v2/work-categories", { credentials: "include" }).then((r) => r.json()),
    staleTime: 5 * 60_000,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Введите название"); return; }
    if (!startDate) { setError("Укажите дату начала"); return; }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v2/events", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          start_date: startDate,
          start_time: startTime || null,
          end_date: endDate || null,
          description: description.trim() || null,
          category_id: categoryId || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? "Ошибка при создании события");
        return;
      }
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["plan"] });
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
        {saving ? "Создаём…" : "Создать событие"}
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
      title="Создать событие"
      footer={footer}
      onSubmit={handleSubmit}
    >
      {/* Title */}
      <div>
        <label className={labelCls}>Название *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Название события"
          className={`${inputCls} h-10`}
          autoFocus
        />
      </div>

      {/* Category */}
      {categories && categories.length > 0 && (
        <div>
          <label className={labelCls}>Категория</label>
          <Select
            value={categoryId}
            onChange={(v) => setCategoryId(v ? Number(v) : "")}
            placeholder="— без категории —"
            options={[
              { value: "", label: "— без категории —" },
              ...categories.map((c) => ({ value: String(c.category_id), label: c.title, emoji: c.emoji ?? undefined })),
            ]}
          />
        </div>
      )}

      {/* Date & time */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Дата *</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Время</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      {/* End date */}
      <div>
        <label className={labelCls}>Дата окончания</label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className={inputCls}
        />
      </div>

      {/* Description */}
      <div>
        <label className={labelCls}>Описание</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Необязательно"
          rows={2}
          className="w-full px-3 py-2 text-base md:text-sm rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/85 placeholder-white/25 focus:outline-none focus:border-indigo-500/60 transition-colors resize-none"
        />
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
          {error}
        </p>
      )}
    </BottomSheet>
  );
}
