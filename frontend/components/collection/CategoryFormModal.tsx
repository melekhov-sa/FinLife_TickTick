"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { BottomSheet } from "@/components/ui/BottomSheet";
import type { CollectionCategory } from "@/types/api";

type TrackingType = "serial" | "name" | "pokemon";

const TRACKING_TYPES: { value: TrackingType; label: string }[] = [
  { value: "name",    label: "По названию" },
  { value: "serial",  label: "По серийному номеру (купюры)" },
  { value: "pokemon", label: "Покемон-карточки" },
];

const inputCls = "w-full px-3 h-10 text-sm rounded-xl border focus:outline-none focus:border-indigo-500/60 transition-colors bg-white dark:bg-white/[0.05] border-slate-300 dark:border-white/[0.08] text-slate-800 dark:text-white/85 placeholder-slate-400 dark:placeholder-white/25";
const labelCls = "block text-[11px] font-medium uppercase tracking-wider mb-1.5 text-slate-500 dark:text-white/60";

interface Props {
  category?: CollectionCategory;
  onClose: () => void;
  onSaved: () => void;
}

export function CategoryFormModal({ category, onClose, onSaved }: Props) {
  const isEdit = !!category;
  const [name, setName] = useState(category?.name ?? "");
  const [emoji, setEmoji] = useState(category?.emoji ?? "");
  const [trackingType, setTrackingType] = useState<TrackingType>(category?.tracking_type ?? "name");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) { setError("Введите название"); return; }
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        await api.patch(`/api/v2/collection/categories/${category!.id}`, { name: n, emoji: emoji || null });
      } else {
        await api.post("/api/v2/collection/categories", { name: n, emoji: emoji || null, tracking_type: trackingType });
      }
      onSaved();
    } catch {
      setError("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open title={isEdit ? "Редактировать категорию" : "Новая категория"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-2">
          <div className="w-16">
            <label className={labelCls}>Эмодзи</label>
            <input
              value={emoji}
              onChange={e => setEmoji(e.target.value)}
              placeholder="📦"
              maxLength={4}
              className={inputCls + " text-center text-lg"}
            />
          </div>
          <div className="flex-1">
            <label className={labelCls}>Название *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Монеты, Купюры..."
              className={inputCls}
              autoFocus
            />
          </div>
        </div>

        {!isEdit && (
          <div>
            <label className={labelCls}>Тип учёта</label>
            <select
              value={trackingType}
              onChange={e => setTrackingType(e.target.value as TrackingType)}
              className={inputCls}
            >
              {TRACKING_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full h-11 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
        >
          {saving ? "Сохранение..." : isEdit ? "Сохранить" : "Создать"}
        </button>
      </form>
    </BottomSheet>
  );
}
