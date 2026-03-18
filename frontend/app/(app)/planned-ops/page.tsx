"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { api } from "@/lib/api";
import { clsx } from "clsx";
import { CalendarClock, LayoutList } from "lucide-react";

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

function TemplateRow({ item }: { item: PlannedOpItem }) {
  const s = kindStyle(item.kind);
  const amountSign = item.kind === "INCOME" ? "+" : item.kind === "EXPENSE" ? "\u2212" : "\u2194";

  return (
    <div className="flex items-center gap-3 py-3 border-b border-white/[0.06] last:border-0 px-2 -mx-2 rounded-lg hover:bg-white/[0.03] transition-colors">
      {/* Kind indicator */}
      <div className={clsx("w-1 self-stretch rounded-full shrink-0", s.bg, s.text.replace("text-", "bg-").replace("/400", "/60"))} />

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[14px] font-medium leading-snug truncate" style={{ color: "var(--t-primary)" }}>
            {item.title}
          </span>
          <KindBadge kind={item.kind} />
          {item.freq && (
            <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-white/[0.06] leading-none" style={{ color: "var(--t-muted)" }}>
              {FREQ_LABELS[item.freq] ?? item.freq}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {item.wallet_title && (
            <span className="text-[12px]" style={{ color: "var(--t-muted)" }}>
              {item.wallet_title}
            </span>
          )}
          <span className="text-[12px]" style={{ color: "var(--t-faint)" }}>
            с {formatDate(item.active_from)}
            {item.active_until && ` по ${formatDate(item.active_until)}`}
          </span>
        </div>
      </div>

      {/* Amount */}
      <div className="shrink-0 text-right">
        <span className={clsx("text-[15px] font-semibold tabular-nums", s.text)}>
          {amountSign}{formatAmount(item.amount)} ₽
        </span>
      </div>
    </div>
  );
}

// ── OccurrenceRow ─────────────────────────────────────────────────────────────

function OccurrenceRow({ occ }: { occ: UpcomingOccurrence }) {
  const today = isToday(occ.scheduled_date);
  const s = kindStyle(occ.kind);
  const amountSign = occ.kind === "INCOME" ? "+" : occ.kind === "EXPENSE" ? "\u2212" : "\u2194";

  const dateCls = occ.is_overdue
    ? "text-red-400 bg-red-500/[0.10] border-red-500/20"
    : today
    ? "text-emerald-400 bg-emerald-500/[0.10] border-emerald-500/20"
    : "bg-white/[0.06] border-white/10";

  return (
    <div className="flex items-center gap-3 py-3 border-b border-white/[0.06] last:border-0 px-2 -mx-2 rounded-lg hover:bg-white/[0.03] transition-colors">
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
            <span className="text-[11px] font-semibold text-red-400 bg-red-500/[0.10] border border-red-500/20 px-1.5 py-0.5 rounded-md">
              просрочено
            </span>
          )}
          {today && !occ.is_overdue && (
            <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/[0.10] border border-emerald-500/20 px-1.5 py-0.5 rounded-md">
              сегодня
            </span>
          )}
          {!occ.is_overdue && !today && (
            <span className="text-[12px]" style={{ color: "var(--t-faint)" }}>
              {formatScheduledDate(occ.scheduled_date)}
            </span>
          )}
        </div>
      </div>

      {/* Amount */}
      <div className="shrink-0 text-right">
        <span className={clsx("text-[15px] font-semibold tabular-nums", s.text)}>
          {amountSign}{formatAmount(occ.amount)} ₽
        </span>
      </div>
    </div>
  );
}

// ── TemplatesTab ──────────────────────────────────────────────────────────────

function TemplatesTab() {
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
            <div key={i} className="h-16 bg-white/[0.03] rounded-xl animate-pulse" />
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
            <a
              href="/legacy/planned-ops/new"
              className="text-[13px] font-medium text-indigo-400/70 hover:text-indigo-400 transition-colors"
            >
              + Добавить операцию
            </a>
          )}
        </div>
      )}

      {data && data.length > 0 && (
        <div className="rounded-[14px] border border-white/[0.07] bg-white/[0.03] px-5 py-1">
          {data.map((item) => (
            <TemplateRow key={item.template_id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── UpcomingTab ───────────────────────────────────────────────────────────────

function UpcomingTab() {
  const { data, isLoading, isError } = useUpcoming();

  const overdueCount = data?.filter((o) => o.is_overdue).length ?? 0;
  const todayCount = data?.filter((o) => isToday(o.scheduled_date)).length ?? 0;

  return (
    <div className="space-y-5">
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
            <div key={i} className="h-20 bg-white/[0.03] rounded-xl animate-pulse" />
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
        <div className="rounded-[14px] border border-white/[0.07] bg-white/[0.03] px-5 py-1">
          {data.map((occ) => (
            <OccurrenceRow key={occ.id} occ={occ} />
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

  return (
    <>
      <AppTopbar title="Плановые операции" />
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-[760px]">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--t-faint)" }}>
              Регулярные финансовые операции
            </h2>
            <a
              href="/legacy/planned-ops/new"
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-semibold rounded-xl px-4 py-2 transition-colors shadow-sm"
            >
              <span className="text-[16px] leading-none">+</span>
              Операция
            </a>
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
          {tab === "templates" && <TemplatesTab />}

        </div>
      </main>
    </>
  );
}
