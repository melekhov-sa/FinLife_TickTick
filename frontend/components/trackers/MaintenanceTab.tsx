"use client";

import { useState } from "react";
import { Plus, Wrench, CheckCircle2, Archive, Pencil, AlertTriangle } from "lucide-react";
import { clsx } from "clsx";
import { useMaintenance, useMarkMaintenanceDone, useArchiveMaintenance, type MaintenanceItem } from "@/hooks/useMaintenance";
import { Button } from "@/components/primitives/Button";
import { Skeleton } from "@/components/primitives/Skeleton";
import { MaintenanceModal } from "@/components/modals/MaintenanceModal";
import { MarkDoneModal } from "@/components/modals/MarkDoneModal";

function intervalLabel(days: number): string {
  if (days % 365 === 0) return `${days / 365} ${days / 365 === 1 ? "год" : "лет"}`;
  if (days % 30 === 0) return `${days / 30} мес.`;
  if (days % 7 === 0) return `${days / 7} нед.`;
  return `${days} дн.`;
}

function statusLabel(item: MaintenanceItem): { text: string; cls: string } {
  if (item.is_never_done) return { text: "Не выполнялось", cls: "text-slate-400" };
  if (item.days_until_next === null) return { text: "—", cls: "text-slate-400" };
  const d = item.days_until_next;
  if (d < 0) return { text: `Просрочено ${Math.abs(d)} дн.`, cls: "text-red-500" };
  if (d === 0) return { text: "Сегодня", cls: "text-orange-500" };
  if (d <= 7) return { text: `Через ${d} дн.`, cls: "text-orange-500" };
  if (d <= 30) return { text: `Через ${d} дн.`, cls: "text-amber-500" };
  return { text: `Через ${d} дн.`, cls: "text-emerald-500" };
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

function MaintenanceCard({ item, onEdit }: { item: MaintenanceItem; onEdit: (item: MaintenanceItem) => void }) {
  const { mutate: archive } = useArchiveMaintenance();
  const [showDone, setShowDone] = useState(false);
  const { text, cls } = statusLabel(item);
  const isUrgent = item.is_overdue || (!item.is_never_done && item.days_until_next !== null && item.days_until_next <= 7);

  return (
    <>
      {showDone && <MarkDoneModal itemId={item.id} itemTitle={item.title} onClose={() => setShowDone(false)} />}
      <div className={clsx(
        "bg-white dark:bg-white/[0.05] rounded-2xl border p-4 flex flex-col gap-3",
        isUrgent ? "border-orange-300/60 dark:border-orange-500/30" : "border-slate-200 dark:border-white/[0.09]",
      )}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Wrench size={16} className="shrink-0 text-indigo-400" />
            <div className="min-w-0">
              <p className="font-semibold text-[15px] truncate" style={{ color: "var(--t-primary)" }}>{item.title}</p>
              {item.description && <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>{item.description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => onEdit(item)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors" style={{ color: "var(--t-faint)" }}>
              <Pencil size={13} />
            </button>
            <button onClick={() => archive(item.id)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500 transition-colors" style={{ color: "var(--t-faint)" }}>
              <Archive size={13} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
          <span style={{ color: "var(--t-faint)" }}>Интервал</span>
          <span style={{ color: "var(--t-muted)" }}>{intervalLabel(item.interval_days)}</span>
          <span style={{ color: "var(--t-faint)" }}>Последний раз</span>
          <span style={{ color: "var(--t-muted)" }}>{formatDate(item.last_done_date)}</span>
          <span style={{ color: "var(--t-faint)" }}>Следующий раз</span>
          <span className={clsx("font-semibold", cls)}>{text}</span>
        </div>

        {item.last_done_note && (
          <p className="text-[12px] italic" style={{ color: "var(--t-faint)" }}>{item.last_done_note}</p>
        )}

        <button
          onClick={() => setShowDone(true)}
          className="mt-1 flex items-center justify-center gap-1.5 w-full py-2 rounded-xl border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/[0.08] text-emerald-600 dark:text-emerald-400 text-[13px] font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-500/[0.15] transition-colors"
        >
          <CheckCircle2 size={14} />
          Выполнено сегодня
        </button>
      </div>
    </>
  );
}

export function MaintenanceTab() {
  const { data: items, isLoading } = useMaintenance();
  const [editItem, setEditItem] = useState<MaintenanceItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const active = items ?? [];
  const overdue = active.filter((i) => i.is_overdue || i.is_never_done);
  const upcoming = active.filter((i) => !i.is_overdue && !i.is_never_done && i.days_until_next !== null && i.days_until_next <= 30);
  const ok = active.filter((i) => !i.is_overdue && !i.is_never_done && (i.days_until_next === null || i.days_until_next > 30));

  return (
    <>
      {(showCreate || editItem) && (
        <MaintenanceModal item={editItem ?? undefined} onClose={() => { setShowCreate(false); setEditItem(null); }} />
      )}

      <div className="w-full">
        <div className="mb-6 flex items-center justify-between">
          <p className="text-[13px]" style={{ color: "var(--t-muted)" }}>Следите за интервалами технического обслуживания</p>
          <Button variant="primary" size="sm" leftIcon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
            Добавить
          </Button>
        </div>

        {isLoading && (
          <div className="grid sm:grid-cols-2 gap-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} variant="rect" className="h-40 rounded-2xl" />)}
          </div>
        )}

        {!isLoading && active.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Wrench size={32} className="text-slate-300 dark:text-white/20" />
            <p className="text-[14px]" style={{ color: "var(--t-muted)" }}>Нет записей обслуживания</p>
            <p className="text-[13px]" style={{ color: "var(--t-faint)" }}>Добавьте замену масла, чистку фильтра, вызов мастера — всё что нужно делать регулярно</p>
          </div>
        )}

        {overdue.length > 0 && (
          <section className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={14} className="text-orange-500" />
              <h2 className="text-[12px] font-bold uppercase tracking-wider text-orange-500">Требуют внимания</h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {overdue.map((i) => <MaintenanceCard key={i.id} item={i} onEdit={setEditItem} />)}
            </div>
          </section>
        )}

        {upcoming.length > 0 && (
          <section className="mb-5">
            <h2 className="text-[12px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--t-muted)" }}>В ближайшие 30 дней</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {upcoming.map((i) => <MaintenanceCard key={i.id} item={i} onEdit={setEditItem} />)}
            </div>
          </section>
        )}

        {ok.length > 0 && (
          <section>
            <h2 className="text-[12px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--t-muted)" }}>Всё в порядке</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {ok.map((i) => <MaintenanceCard key={i.id} item={i} onEdit={setEditItem} />)}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
