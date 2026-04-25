"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { api } from "@/lib/api";
import { clsx } from "clsx";
import { CalendarClock, LayoutList, Play, Pencil, Check, X, Archive, RotateCcw } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { CreateOperationModal, type CreateOperationInitialValues } from "@/components/modals/CreateOperationModal";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { Badge } from "@/components/primitives/Badge";
import { Skeleton } from "@/components/primitives/Skeleton";
import { Tooltip } from "@/components/primitives/Tooltip";
import { SectionHeader } from "@/components/primitives/SectionHeader";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlannedOpItem {
  template_id: number;
  title: string;
  kind: string;
  amount: string;
  wallet_title: string | null;
  freq: string | null;
  active_from: string;
  active_until: string | null;
  is_archived: boolean;
}

interface UpcomingOccurrence {
  id: number;
  template_id: number;
  title: string;
  kind: string;
  amount: string;
  scheduled_date: string;
  status: string;
  is_overdue: boolean;
  wallet_id: number | null;
  destination_wallet_id: number | null;
  category_id: number | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const KIND_COLORS = {
  INCOME:   { bg: "bg-emerald-500/15", text: "text-emerald-400", label: "Доход" },
  EXPENSE:  { bg: "bg-red-500/15",     text: "text-red-400",     label: "Расход" },
  TRANSFER: { bg: "bg-blue-500/15",    text: "text-blue-400",    label: "Перемещение" },
} as const;

const FREQ_LABELS: Record<string, string> = {
  DAILY:         "Ежедневно",
  WEEKLY:        "Еженедельно",
  MONTHLY:       "Ежемесячно",
  YEARLY:        "Ежегодно",
  INTERVAL_DAYS: "Через N дней",
  MULTI_DATE:    "По датам",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAmount(amount: string): string {
  const n = parseFloat(amount);
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatScheduledDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
}

function isToday(iso: string): boolean {
  return iso === new Date().toISOString().slice(0, 10);
}

function kindStyle(kind: string) {
  return KIND_COLORS[kind as keyof typeof KIND_COLORS] ?? {
    bg: "bg-white/[0.06]",
    text: "text-white/50",
    label: kind,
  };
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function usePlannedOps(archived: boolean) {
  return useQuery<PlannedOpItem[]>({
    queryKey: ["planned-ops", archived],
    queryFn: () => api.get<PlannedOpItem[]>(`/api/v2/planned-ops?archived=${archived}`),
    staleTime: 60_000,
  });
}

function useUpcoming() {
  return useQuery<UpcomingOccurrence[]>({
    queryKey: ["planned-ops-upcoming"],
    queryFn: () => api.get<UpcomingOccurrence[]>("/api/v2/planned-ops/upcoming"),
    staleTime: 60_000,
  });
}

// ── KindBadge ─────────────────────────────────────────────────────────────────

function KindBadge({ kind }: { kind: string }) {
  const s = kindStyle(kind);
  return (
    <span className={clsx("inline-flex text-[11px] font-semibold px-1.5 py-0.5 rounded-md leading-none", s.bg, s.text)}>
      {s.label}
    </span>
  );
}

// ── TemplateRow ───────────────────────────────────────────────────────────────

function TemplateRow({ item, archived: isArchived }: { item: PlannedOpItem; archived: boolean }) {
  const s = kindStyle(item.kind);
  const amountSign = item.kind === "INCOME" ? "+" : item.kind === "EXPENSE" ? "\u2212" : "\u2194";
  const qc = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editAmount, setEditAmount] = useState(item.amount);
  const [editUntil, setEditUntil] = useState(item.active_until ?? "");

  const { mutate: update, isPending } = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/api/v2/planned-ops/${item.template_id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["planned-ops"] }); setEditing(false); },
  });
  const { mutate: archiveOp } = useMutation({
    mutationFn: () => api.post(`/api/v2/planned-ops/${item.template_id}/archive`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["planned-ops"] }),
  });
  const { mutate: restoreOp } = useMutation({
    mutationFn: () => api.post(`/api/v2/planned-ops/${item.template_id}/restore`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["planned-ops"] }),
  });

  function startEdit() {
    setEditTitle(item.title);
    setEditAmount(item.amount);
    setEditUntil(item.active_until ?? "");
    setEditing(true);
  }

  function save() {
    if (!editTitle.trim()) return;
    update({ title: editTitle.trim(), amount: editAmount, active_until: editUntil || null });
  }

  if (editing) {
    return (
      <div className="px-2 py-3 border-b border-white/[0.06] last:border-0 space-y-2">
        <div className="flex gap-2">
          <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Название" size="sm" className="flex-1" autoFocus />
          <Button onClick={save} disabled={isPending || !editTitle.trim()} variant="primary" size="sm" iconOnly className="shrink-0"><Check size={12} strokeWidth={2.5} /></Button>
          <Button onClick={() => setEditing(false)} variant="ghost" size="sm" iconOnly className="shrink-0"><X size={12} /></Button>
        </div>
        <div className="flex gap-2">
          <Input type="number" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} placeholder="Сумма" size="sm" className="w-32" />
          <Input type="date" value={editUntil} onChange={(e) => setEditUntil(e.target.value)} size="sm" className="flex-1" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-3 border-b border-white/[0.06] last:border-0 px-2 -mx-2 rounded-lg hover:bg-white/[0.03] transition-colors group/row">
      <div className={clsx("w-1 self-stretch rounded-full shrink-0", s.bg, s.text.replace("text-", "bg-").replace("/400", "/60"))} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[14px] font-medium leading-snug truncate" style={{ color: "var(--t-primary)" }}>{item.title}</span>
          <KindBadge kind={item.kind} />
          {item.freq && <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-white/[0.06] leading-none" style={{ color: "var(--t-muted)" }}>{FREQ_LABELS[item.freq] ?? item.freq}</span>}
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {item.wallet_title && <span className="text-[12px]" style={{ color: "var(--t-muted)" }}>{item.wallet_title}</span>}
          <span className="text-[12px]" style={{ color: "var(--t-faint)" }}>с {formatDate(item.active_from)}{item.active_until && ` по ${formatDate(item.active_until)}`}</span>
        </div>
      </div>
      <span className={clsx("text-[15px] font-semibold tabular-nums shrink-0", s.text)}>{amountSign}{formatAmount(item.amount)} ₽</span>
      <div className="flex items-center gap-1 shrink-0">
        {!isArchived && (
          <Tooltip content="Редактировать">
            <button onClick={startEdit} className="w-6 h-6 flex items-center justify-center rounded-md md:opacity-0 md:group-hover/row:opacity-100 hover:bg-white/[0.08] transition-all" style={{ color: "var(--t-faint)" }}><Pencil size={11} /></button>
          </Tooltip>
        )}
        <Tooltip content={isArchived ? "Восстановить" : "В архив"}>
          <button onClick={() => isArchived ? restoreOp() : archiveOp()} className="w-6 h-6 flex items-center justify-center rounded-md md:opacity-0 md:group-hover/row:opacity-100 hover:bg-white/[0.08] transition-all" style={{ color: "var(--t-faint)" }}>
            {isArchived ? <RotateCcw size={11} /> : <Archive size={11} />}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

// ── OccurrenceRow ─────────────────────────────────────────────────────────────

function OccurrenceRow({
  occ,
  onExecute,
}: {
  occ: UpcomingOccurrence;
  onExecute: (occ: UpcomingOccurrence) => void;
}) {
  const today = isToday(occ.scheduled_date);
  const s = kindStyle(occ.kind);
  const amountSign = occ.kind === "INCOME" ? "+" : occ.kind === "EXPENSE" ? "\u2212" : "\u2194";

  const dateCls = occ.is_overdue
    ? "text-red-400 bg-red-500/[0.10] border-red-500/20"
    : today
    ? "text-emerald-400 bg-emerald-500/[0.10] border-emerald-500/20"
    : "bg-white/[0.06] border-white/10";

  return (
    <div className="flex items-center gap-3 py-3 border-b border-white/[0.06] last:border-0 px-2 -mx-2 rounded-lg hover:bg-white/[0.03] transition-colors group/occ">
      {/* Date badge */}
      <div className={clsx("shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-xl border text-center gap-0.5", dateCls)}>
        <span className="text-[18px] font-bold leading-none tabular-nums">
          {new Date(occ.scheduled_date + "T00:00:00").getDate()}
        </span>
        <span className="text-[10px] font-semibold uppercase leading-none">
          {new Date(occ.scheduled_date + "T00:00:00").toLocaleDateString("ru-RU", { month: "short" }).replace(".", "")}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[14px] font-medium truncate" style={{ color: "var(--t-primary)" }}>
            {occ.title}
          </span>
          <KindBadge kind={occ.kind} />
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {occ.is_overdue && (
            <Badge variant="danger" size="sm">просрочено</Badge>
          )}
          {today && !occ.is_overdue && (
            <Badge variant="success" size="sm">сегодня</Badge>
          )}
          {!occ.is_overdue && !today && (
            <span className="text-[12px]" style={{ color: "var(--t-faint)" }}>
              {formatScheduledDate(occ.scheduled_date)}
            </span>
          )}
        </div>
      </div>

      {/* Amount + Execute */}
      <div className="shrink-0 flex items-center gap-2">
        <span className={clsx("text-[15px] font-semibold tabular-nums", s.text)}>
          {amountSign}{formatAmount(occ.amount)} ₽
        </span>
        <button
          onClick={() => onExecute(occ)}
          className="opacity-0 group-hover/occ:opacity-100 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 text-[11px] font-semibold transition-all"
          title="Выполнить операцию"
        >
          <Play size={10} className="fill-current" />
          Выполнить
        </button>
      </div>
    </div>
  );
}

// ── TemplatesTab ──────────────────────────────────────────────────────────────

function TemplatesTab({ onCreateOp }: { onCreateOp: () => void }) {
  const [archived, setArchived] = useState(false);
  const { data, isLoading, isError } = usePlannedOps(archived);

  return (
    <div className="space-y-5">
      {/* Sub-tabs */}
      <div className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.07] rounded-xl p-1 self-start w-fit">
        {[
          { value: false, label: "Активные" },
          { value: true,  label: "Архив" },
        ].map((opt) => (
          <button
            key={String(opt.value)}
            onClick={() => setArchived(opt.value)}
            className={clsx(
              "px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition-all",
              archived === opt.value
                ? "bg-indigo-600 text-white shadow-sm"
                : "hover:bg-white/[0.05]"
            )}
            style={{ color: archived === opt.value ? undefined : "var(--t-secondary)" }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} variant="rect" height={64} className="rounded-xl" />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-red-400/70 text-sm text-center py-10">
          Не удалось загрузить шаблоны
        </p>
      )}

      {data && data.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center">
            <LayoutList size={20} className="text-white/35" />
          </div>
          <p className="text-sm font-medium" style={{ color: "var(--t-muted)" }}>
            {archived ? "Архив пуст" : "Нет плановых операций"}
          </p>
          {!archived && (
            <Button variant="link" size="sm" onClick={onCreateOp} className="text-indigo-400/70 hover:text-indigo-400 px-0">
              + Добавить операцию
            </Button>
          )}
        </div>
      )}

      {data && data.length > 0 && (
        <div className="rounded-[14px] bg-slate-50 dark:bg-white/[0.03] border-[1.5px] border-slate-300 dark:border-white/[0.09] px-5 py-1">
          {data.map((item) => (
            <TemplateRow key={item.template_id} item={item} archived={archived} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── UpcomingTab ───────────────────────────────────────────────────────────────

function UpcomingTab() {
  const { data, isLoading, isError } = useUpcoming();
  const [executeOcc, setExecuteOcc] = useState<UpcomingOccurrence | null>(null);

  const overdueCount = data?.filter((o) => o.is_overdue).length ?? 0;
  const todayCount = data?.filter((o) => isToday(o.scheduled_date)).length ?? 0;

  const initialValues: CreateOperationInitialValues | undefined = executeOcc
    ? {
        opType: executeOcc.kind as "INCOME" | "EXPENSE" | "TRANSFER",
        amount: executeOcc.amount,
        walletId: executeOcc.wallet_id ?? undefined,
        fromWalletId: executeOcc.wallet_id ?? undefined,
        toWalletId: executeOcc.destination_wallet_id ?? undefined,
        categoryId: executeOcc.category_id ?? undefined,
      }
    : undefined;

  return (
    <div className="space-y-5">
      {executeOcc && (
        <CreateOperationModal
          initialValues={initialValues}
          occurrenceId={executeOcc.id}
          onClose={() => setExecuteOcc(null)}
        />
      )}

      {/* KPI */}
      {data && (
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              value: data.length,
              label: "Ближайших",
              color: "var(--t-primary)",
              border: "border-white/[0.07]",
              bg: "bg-white/[0.04]",
            },
            {
              value: todayCount,
              label: "Сегодня",
              color: todayCount > 0 ? "#34d399" : "var(--t-primary)",
              border: todayCount > 0 ? "border-emerald-500/20" : "border-white/[0.07]",
              bg: todayCount > 0 ? "bg-emerald-500/[0.04]" : "bg-white/[0.04]",
            },
            {
              value: overdueCount,
              label: "Просрочено",
              color: overdueCount > 0 ? "#f87171" : "var(--t-primary)",
              border: overdueCount > 0 ? "border-red-500/25" : "border-white/[0.07]",
              bg: overdueCount > 0 ? "bg-red-500/[0.04]" : "bg-white/[0.04]",
            },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className={clsx(
                "rounded-[14px] border p-4 text-center min-h-[72px] flex flex-col items-center justify-center gap-1",
                kpi.border,
                kpi.bg,
              )}
            >
              <p
                className="text-[26px] font-bold tabular-nums leading-none"
                style={{ color: kpi.color, letterSpacing: "-0.03em" }}
              >
                {kpi.value}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--t-faint)" }}>
                {kpi.label}
              </p>
            </div>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} variant="rect" height={80} className="rounded-xl" />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-red-400/70 text-sm text-center py-10">
          Не удалось загрузить предстоящие операции
        </p>
      )}

      {data && data.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center">
            <CalendarClock size={20} className="text-white/35" />
          </div>
          <p className="text-sm font-medium" style={{ color: "var(--t-muted)" }}>
            Нет предстоящих операций на 90 дней
          </p>
        </div>
      )}

      {data && data.length > 0 && (
        <div className="rounded-[14px] bg-slate-50 dark:bg-white/[0.03] border-[1.5px] border-slate-300 dark:border-white/[0.09] px-5 py-1">
          {data.map((occ) => (
            <OccurrenceRow key={occ.id} occ={occ} onExecute={setExecuteOcc} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type MainTab = "templates" | "upcoming";

const MAIN_TABS: { value: MainTab; label: string }[] = [
  { value: "templates", label: "Шаблоны" },
  { value: "upcoming",  label: "Ожидают действия" },
];

export default function PlannedOpsPage() {
  const [tab, setTab] = useState<MainTab>("upcoming");
  const [showCreateOp, setShowCreateOp] = useState(false);

  return (
    <>
      {showCreateOp && <CreateOperationModal onClose={() => setShowCreateOp(false)} />}
      <AppTopbar title="Плановые операции" />
      <main className="flex-1 overflow-auto p-3 md:p-6">
        <div className="w-full">

          {/* Header */}
          <div className="mb-6">
            <SectionHeader
              title="Регулярные финансовые операции"
              size="sm"
              actions={
                <Button onClick={() => setShowCreateOp(true)} variant="primary" size="md">
                  <span className="text-[16px] leading-none">+</span>
                  Операция
                </Button>
              }
            />
          </div>

          {/* Main tabs */}
          <div className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.07] rounded-xl p-1 w-fit mb-6">
            {MAIN_TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={clsx(
                  "px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all",
                  tab === t.value
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "hover:bg-white/[0.05]"
                )}
                style={{ color: tab === t.value ? undefined : "var(--t-secondary)" }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "upcoming" && <UpcomingTab />}
          {tab === "templates" && <TemplatesTab onCreateOp={() => setShowCreateOp(true)} />}

        </div>
      </main>
    </>
  );
}
