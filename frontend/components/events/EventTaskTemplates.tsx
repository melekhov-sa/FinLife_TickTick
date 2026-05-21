"use client";

import { useState } from "react";
import { Plus, Trash2, Bell, BellOff } from "lucide-react";
import { clsx } from "clsx";
import {
  useEventTaskTemplates,
  useCreateEventTaskTemplate,
  useDeleteEventTaskTemplate,
} from "@/hooks/useEventTaskTemplates";
import { Popover } from "@/components/primitives/Popover";
import { Button } from "@/components/primitives/Button";

const REMINDER_OPTIONS: { label: string; value: number | null }[] = [
  { label: "Нет", value: null },
  { label: "За 1 час", value: 60 },
  { label: "За 3 часа", value: 180 },
  { label: "За 1 день", value: 1440 },
  { label: "За 2 дня", value: 2880 },
];

function reminderLabel(minutes: number | null): string {
  if (minutes === null) return "Без напоминания";
  const opt = REMINDER_OPTIONS.find((o) => o.value === minutes);
  return opt?.label ?? `За ${minutes} мин`;
}

function daysLabel(n: number): string {
  if (n === 0) return "в день события";
  if (n === 1) return "за 1 день";
  if (n < 5) return `за ${n} дня`;
  return `за ${n} дней`;
}

interface AddFormProps {
  onSave: (title: string, daysBefore: number, reminderMinutes: number | null) => void;
  onCancel: () => void;
  saving: boolean;
}

function AddForm({ onSave, onCancel, saving }: AddFormProps) {
  const [title, setTitle] = useState("");
  const [days, setDays] = useState("7");
  const [reminder, setReminder] = useState<number | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    const d = parseInt(days, 10);
    if (!t || isNaN(d) || d < 0) return;
    onSave(t, d, reminder);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 p-3 rounded-xl border border-indigo-500/25 bg-indigo-500/[0.05] space-y-2.5">
      <div>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Название задачи"
          className="w-full px-3 h-9 text-[13px] rounded-lg border border-white/[0.08] bg-white/[0.05] text-white/85 placeholder-white/25 focus:outline-none focus:border-indigo-500/60"
          onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
        />
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium" style={{ color: "var(--t-faint)" }}>за</span>
          <input
            type="number"
            min={0}
            max={365}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="w-14 px-2 h-8 text-[13px] text-center rounded-lg border border-white/[0.08] bg-white/[0.05] text-white/85 focus:outline-none focus:border-indigo-500/60"
          />
          <span className="text-[11px] font-medium" style={{ color: "var(--t-faint)" }}>дней до события</span>
        </div>
      </div>
      <div>
        <p className="text-[11px] font-medium mb-1.5" style={{ color: "var(--t-faint)" }}>Уведомление</p>
        <div className="flex flex-wrap gap-1.5">
          {REMINDER_OPTIONS.map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => setReminder(opt.value)}
              className={clsx(
                "px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors",
                reminder === opt.value
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : "bg-white/[0.04] border-white/[0.08] text-white/55 hover:bg-white/[0.07]"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 pt-0.5">
        <Button type="submit" size="sm" variant="primary" loading={saving} disabled={!title.trim()}>
          Добавить
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </form>
  );
}

interface Props {
  eventId: number;
}

export function EventTaskTemplates({ eventId }: Props) {
  const { data: templates, isLoading } = useEventTaskTemplates(eventId);
  const { mutate: create, isPending: creating } = useCreateEventTaskTemplate(eventId);
  const { mutate: remove } = useDeleteEventTaskTemplate(eventId);

  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  function handleSave(title: string, daysBefore: number, reminderMinutes: number | null) {
    create(
      { title, days_before: daysBefore, reminder_offset_minutes: reminderMinutes },
      { onSuccess: () => setShowAdd(false) }
    );
  }

  function handleDelete(id: number, archiveTasks: boolean) {
    remove({ id, archiveTasks });
    setDeleteTarget(null);
  }

  return (
    <div className="space-y-1.5">
      {isLoading && (
        <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>Загрузка...</p>
      )}

      {(templates ?? []).map((tpl) => (
        <div
          key={tpl.id}
          className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] group"
        >
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium truncate" style={{ color: "var(--t-secondary)" }}>
              {tpl.title}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px]" style={{ color: "var(--t-faint)" }}>
                {daysLabel(tpl.days_before)}
              </span>
              {tpl.reminder_offset_minutes !== null && (
                <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-400/80">
                  <Bell size={9} />
                  {reminderLabel(tpl.reminder_offset_minutes)}
                </span>
              )}
              {tpl.reminder_offset_minutes === null && (
                <span className="inline-flex items-center gap-0.5 text-[11px]" style={{ color: "var(--t-faint)" }}>
                  <BellOff size={9} />
                </span>
              )}
            </div>
          </div>

          <Popover
            open={deleteTarget === tpl.id}
            onOpenChange={(open) => setDeleteTarget(open ? tpl.id : null)}
            side="left"
            align="center"
            className="min-w-[220px] p-3"
            trigger={
              <button
                className="w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/10 hover:text-red-400"
                style={{ color: "var(--t-faint)" }}
              >
                <Trash2 size={12} />
              </button>
            }
          >
            <p className="text-[13px] font-medium mb-1" style={{ color: "var(--t-primary)" }}>
              Удалить шаблон?
            </p>
            <p className="text-[11px] mb-3" style={{ color: "var(--t-faint)" }}>
              Что сделать с уже созданными задачами?
            </p>
            <div className="flex flex-col gap-1.5">
              <Button size="sm" variant="secondary" fullWidth onClick={() => handleDelete(tpl.id, false)}>
                Оставить задачи
              </Button>
              <Button size="sm" variant="destructive" fullWidth onClick={() => handleDelete(tpl.id, true)}>
                Архивировать задачи
              </Button>
            </div>
          </Popover>
        </div>
      ))}

      {!showAdd && (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 w-full px-2.5 py-1.5 rounded-xl text-[12px] font-medium border border-dashed border-white/[0.10] hover:border-indigo-500/30 hover:bg-indigo-500/[0.04] transition-colors"
          style={{ color: "var(--t-faint)" }}
        >
          <Plus size={12} />
          Добавить задачу к событию
        </button>
      )}

      {showAdd && (
        <AddForm
          onSave={handleSave}
          onCancel={() => setShowAdd(false)}
          saving={creating}
        />
      )}
    </div>
  );
}
