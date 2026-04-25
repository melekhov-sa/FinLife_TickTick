"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { api } from "@/lib/api";
import { clsx } from "clsx";
import { FolderPlus } from "lucide-react";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";

const STATUS_OPTIONS = [
  { value: "planned",   label: "Планируемый", color: "text-blue-400" },
  { value: "active",    label: "Активный",    color: "text-emerald-400" },
  { value: "on_hold",   label: "На паузе",    color: "text-amber-400" },
  { value: "completed", label: "Завершён",    color: "text-white/68" },
];

export default function NewProjectPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("planned");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Название проекта не может быть пустым"); return; }
    setSaving(true);
    setError(null);
    try {
      const { id } = await api.post<{ id: number }>("/api/v2/projects", {
        title: title.trim(),
        description: description.trim() || null,
        status,
        start_date: startDate || null,
        due_date: dueDate || null,
      });
      router.push(`/projects/${id}`);
    } catch {
      setError("Не удалось подключиться к серверу");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full px-3.5 py-2.5 text-sm rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/85 placeholder-white/20 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.07] transition-all";

  return (
    <>
      <AppTopbar title="Новый проект" />
      <main className="flex-1 overflow-auto p-6 flex items-start justify-center">
        <div className="w-full max-w-[500px]">
          {/* Card */}
          <div className="bg-white/[0.04] border border-white/[0.07] rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-5 border-b border-white/[0.06]">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center shrink-0">
                <FolderPlus size={16} className="text-indigo-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white/85" style={{ letterSpacing: "-0.01em" }}>
                  Создать проект
                </h2>
                <p className="text-xs text-white/60 mt-0.5">Заполните основную информацию</p>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Title */}
              <Input
                label="Название *"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Название проекта"
                size="lg"
                autoFocus
              />

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-slate-700 dark:text-slate-300 select-none">Описание</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Краткое описание проекта (необязательно)"
                  rows={3}
                  className={`${inputCls} resize-none`}
                />
              </div>

              {/* Status pills */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-slate-700 dark:text-slate-300 select-none">Статус</label>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setStatus(o.value)}
                      className={clsx(
                        "text-xs font-medium px-3 py-1.5 rounded-xl border transition-all",
                        status === o.value
                          ? "bg-white/[0.10] border-white/[0.18] text-white/90"
                          : "bg-white/[0.03] border-white/[0.06] text-white/65 hover:text-white/60 hover:border-white/[0.10]"
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Дата начала"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  size="lg"
                />
                <Input
                  label="Дедлайн"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  size="lg"
                />
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3.5 py-2.5">
                  {error}
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <Button
                  type="submit"
                  disabled={saving}
                  loading={saving}
                  variant="primary"
                  size="lg"
                  fullWidth
                >
                  {saving ? "Создаём…" : "Создать проект"}
                </Button>
                <Button
                  type="button"
                  onClick={() => router.back()}
                  variant="outline"
                  size="lg"
                >
                  Отмена
                </Button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </>
  );
}
