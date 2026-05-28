"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useCreateBodyMetric } from "@/hooks/useBodyMetrics";

type MetricType = "weight" | "pressure" | "pulse";

const METRIC_LABELS: Record<MetricType, string> = {
  weight: "Вес",
  pressure: "Давление",
  pulse: "Пульс",
};

interface Props {
  defaultType: MetricType;
  onClose: () => void;
}

export function AddMetricModal({ defaultType, onClose }: Props) {
  const [type, setType] = useState<MetricType>(defaultType);
  const [dateVal, setDateVal] = useState(() => new Date().toISOString().slice(0, 10));
  const [value, setValue] = useState("");
  const [value2, setValue2] = useState("");
  const [note, setNote] = useState("");

  const { mutate, isPending } = useCreateBodyMetric();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = parseFloat(value);
    if (!v || isNaN(v)) return;

    mutate(
      {
        metric_type: type,
        value: v,
        value2: type === "pressure" && value2 ? parseFloat(value2) : null,
        recorded_at: dateVal,
        note: note.trim() || null,
      },
      { onSuccess: onClose },
    );
  }

  const inputCls = "w-full rounded-xl border px-3 py-2 text-[14px] outline-none focus:border-indigo-400";
  const inputStyle = { borderColor: "rgba(99,102,241,0.25)", background: "var(--t-input-bg, transparent)", color: "var(--t-primary)" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl shadow-2xl p-5" style={{ background: "var(--t-card-bg, #ffffff)" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[17px] font-bold" style={{ color: "var(--t-primary)" }}>Добавить замер</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.08]">
            <X size={16} style={{ color: "var(--t-faint)" }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-3 gap-1.5">
            {(["weight", "pressure", "pulse"] as MetricType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`py-2 rounded-xl text-[13px] font-medium border transition-colors ${
                  type === t
                    ? "bg-indigo-500 border-indigo-500 text-white"
                    : "border-slate-200 dark:border-white/[0.12]"
                }`}
                style={type !== t ? { color: "var(--t-muted)" } : undefined}
              >
                {METRIC_LABELS[t]}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--t-muted)" }}>Дата</label>
            <input type="date" value={dateVal} onChange={(e) => setDateVal(e.target.value)} className={inputCls} style={inputStyle} required />
          </div>

          {type === "pressure" ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--t-muted)" }}>Систолическое *</label>
                <input
                  type="number" min={50} max={250}
                  value={value} onChange={(e) => setValue(e.target.value)}
                  placeholder="120" className={inputCls} style={inputStyle} required
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--t-muted)" }}>Диастолическое</label>
                <input
                  type="number" min={30} max={150}
                  value={value2} onChange={(e) => setValue2(e.target.value)}
                  placeholder="80" className={inputCls} style={inputStyle}
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--t-muted)" }}>
                {type === "weight" ? "Вес (кг) *" : "Пульс (уд/мин) *"}
              </label>
              <input
                type="number"
                min={type === "weight" ? 20 : 30}
                max={type === "weight" ? 500 : 300}
                step={type === "weight" ? 0.1 : 1}
                value={value} onChange={(e) => setValue(e.target.value)}
                placeholder={type === "weight" ? "75.5" : "72"}
                className={inputCls} style={inputStyle} required
              />
            </div>
          )}

          <div>
            <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--t-muted)" }}>Заметка</label>
            <input
              value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Необязательно"
              className={inputCls} style={inputStyle}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button" onClick={onClose}
              className="flex-1 py-2 rounded-xl border text-[14px] font-medium transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.06]"
              style={{ borderColor: "rgba(99,102,241,0.2)", color: "var(--t-muted)" }}
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isPending || !value.trim()}
              className="flex-1 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-[14px] font-medium transition-colors disabled:opacity-50"
            >
              {isPending ? "Сохранение…" : "Добавить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
