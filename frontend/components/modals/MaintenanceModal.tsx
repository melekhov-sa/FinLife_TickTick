"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useCreateMaintenance, useUpdateMaintenance, type MaintenanceItem } from "@/hooks/useMaintenance";
import { useKeyboardInset } from "@/lib/useKeyboardInset";

const INTERVAL_PRESETS = [
  { label: "1 нед.",   days: 7 },
  { label: "2 нед.",   days: 14 },
  { label: "1 мес.",   days: 30 },
  { label: "3 мес.",   days: 90 },
  { label: "6 мес.",   days: 180 },
  { label: "1 год",    days: 365 },
];

interface Props {
  item?: MaintenanceItem;
  onClose: () => void;
}

export function MaintenanceModal({ item, onClose }: Props) {
  const { inset: kbInset } = useKeyboardInset();
  const isEdit = !!item;

  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [intervalDays, setIntervalDays] = useState<string>(
    item ? String(item.interval_days) : "30"
  );
  const [lastDoneDate, setLastDoneDate] = useState(item?.last_done_date ?? "");
  const [notifyDays, setNotifyDays] = useState<string>(
    item?.notify_days_before != null ? String(item.notify_days_before) : ""
  );

  const { mutate: create, isPending: isCreating } = useCreateMaintenance();
  const { mutate: update, isPending: isUpdating } = useUpdateMaintenance();
  const isPending = isCreating || isUpdating;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const days = parseInt(intervalDays, 10);
    if (!title.trim() || !days || days < 1) return;

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      interval_days: days,
      last_done_date: lastDoneDate || null,
      notify_days_before: notifyDays ? parseInt(notifyDays, 10) : null,
    };

    if (isEdit) {
      update({ id: item.id, ...payload }, { onSuccess: onClose });
    } else {
      create(payload, { onSuccess: onClose });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ paddingBottom: kbInset }}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl p-5 max-h-[calc(100dvh-48px)] overflow-y-auto overscroll-contain"
        style={{ background: "var(--app-card-bg)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[17px] font-bold" style={{ color: "var(--t-primary)" }}>
            {isEdit ? "Редактировать" : "Добавить обслуживание"}
          </h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.08]">
            <X size={16} style={{ color: "var(--t-faint)" }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--t-muted)" }}>
              Название *
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Замена масла"
              className="w-full rounded-xl border px-3 py-2 text-[14px] outline-none focus:border-indigo-400"
              style={{ borderColor: "rgba(99,102,241,0.25)", background: "var(--t-input-bg, transparent)", color: "var(--t-primary)" }}
              required
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--t-muted)" }}>
              Описание
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Уточнение или заметка"
              className="w-full rounded-xl border px-3 py-2 text-[14px] outline-none focus:border-indigo-400"
              style={{ borderColor: "rgba(99,102,241,0.25)", background: "var(--t-input-bg, transparent)", color: "var(--t-primary)" }}
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--t-muted)" }}>
              Интервал *
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {INTERVAL_PRESETS.map((p) => (
                <button
                  key={p.days}
                  type="button"
                  onClick={() => setIntervalDays(String(p.days))}
                  className={`px-2.5 py-1 rounded-lg text-[12px] font-medium border transition-colors ${
                    intervalDays === String(p.days)
                      ? "bg-indigo-500 border-indigo-500 text-white"
                      : "border-slate-200 dark:border-white/[0.12]"
                  }`}
                  style={intervalDays !== String(p.days) ? { color: "var(--t-muted)" } : undefined}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={intervalDays}
                onChange={(e) => setIntervalDays(e.target.value)}
                placeholder="Дней"
                className="w-24 rounded-xl border px-3 py-2 text-[14px] outline-none focus:border-indigo-400"
                style={{ borderColor: "rgba(99,102,241,0.25)", background: "var(--t-input-bg, transparent)", color: "var(--t-primary)" }}
                required
              />
              <span className="text-[13px]" style={{ color: "var(--t-faint)" }}>дней</span>
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--t-muted)" }}>
              Последний раз выполнено
            </label>
            <input
              type="date"
              value={lastDoneDate}
              onChange={(e) => setLastDoneDate(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-[14px] outline-none focus:border-indigo-400"
              style={{ borderColor: "rgba(99,102,241,0.25)", background: "var(--t-input-bg, transparent)", color: "var(--t-primary)" }}
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--t-muted)" }}>
              Напомнить за (дней)
            </label>
            <div className="flex gap-2">
              {["7", "14", "30"].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setNotifyDays(notifyDays === d ? "" : d)}
                  className={`flex-1 py-1.5 rounded-lg text-[13px] font-medium border transition-colors ${
                    notifyDays === d
                      ? "bg-indigo-500 border-indigo-500 text-white"
                      : "border-slate-200 dark:border-white/[0.12]"
                  }`}
                  style={notifyDays !== d ? { color: "var(--t-muted)" } : undefined}
                >
                  {d}
                </button>
              ))}
              <input
                type="number"
                min={1}
                value={notifyDays}
                onChange={(e) => setNotifyDays(e.target.value)}
                placeholder="—"
                className="w-16 rounded-xl border px-2 py-1.5 text-[13px] outline-none focus:border-indigo-400 text-center"
                style={{ borderColor: "rgba(99,102,241,0.25)", background: "var(--t-input-bg, transparent)", color: "var(--t-primary)" }}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-xl border text-[14px] font-medium transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.06]"
              style={{ borderColor: "rgba(99,102,241,0.2)", color: "var(--t-muted)" }}
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isPending || !title.trim() || !intervalDays}
              className="flex-1 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-[14px] font-medium transition-colors disabled:opacity-50"
            >
              {isPending ? "Сохранение…" : isEdit ? "Сохранить" : "Добавить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
