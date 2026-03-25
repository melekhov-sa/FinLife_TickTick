"use client";

import { useState, useRef, useEffect } from "react";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { SubscriptionDetailPanel } from "@/components/subscriptions/SubscriptionDetailPanel";
import { CreateSubscriptionModal } from "@/components/modals/CreateSubscriptionModal";
import { AddMemberModal } from "@/components/modals/AddMemberModal";
import type { SubscriptionItem } from "@/types/api";
import { CreditCard, MoreHorizontal } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { clsx } from "clsx";

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysLabel(days: number | null): string {
  if (days === null) return "—";
  if (days < 0) return `просрочено ${Math.abs(days)}д`;
  if (days === 0) return "сегодня";
  return `${days}д`;
}

function daysBadgeCls(days: number | null): string {
  if (days === null) return "bg-white/[0.06] border-white/10 text-white/50";
  if (days < 0)    return "bg-red-500/10 border-red-500/20 text-red-400";
  if (days <= 7)   return "bg-red-500/10 border-red-500/20 text-red-400";
  if (days <= 30)  return "bg-amber-500/10 border-amber-500/20 text-amber-400";
  return "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

/** Earliest days_left across self + all members (nulls last). */
function getMinDaysLeft(sub: SubscriptionItem): number | null {
  const all = [sub.days_left_self, ...sub.members.map((m) => m.days_left)]
    .filter((d): d is number => d !== null);
  if (all.length === 0) return null;
  return Math.min(...all);
}

function getMonthlyTotal(sub: SubscriptionItem): number {
  return sub.members.reduce((s, m) => s + (m.payment_per_month ?? 0), 0);
}

// ── Quick Actions Menu ────────────────────────────────────────────────────────

function QuickMenu({ onOpen, onAddMember }: { onOpen: () => void; onAddMember: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOut);
    return () => document.removeEventListener("mousedown", onClickOut);
  }, [open]);

  return (
    <div ref={ref} className="relative" onClick={(e) => e.preventDefault()}>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/[0.08]"
        style={{ color: "var(--t-muted)" }}
        title="Действия"
      >
        <MoreHorizontal size={15} />
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-50 bg-[#1a2233] border border-white/[0.10] rounded-xl shadow-xl py-1 min-w-[160px]">
          {[
            { label: "Открыть", action: () => { onOpen(); setOpen(false); } },
            { label: "Добавить участника", action: () => { onAddMember(); setOpen(false); } },
          ].map((item) => (
            <button
              key={item.label}
              onClick={(e) => { e.stopPropagation(); item.action(); }}
              className="w-full text-left block px-4 py-2 text-[13px] font-medium transition-colors hover:bg-white/[0.05] hover:text-white/90"
              style={{ color: "var(--t-secondary)" }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── SubCard ───────────────────────────────────────────────────────────────────

function SubCard({ sub, onOpen, onAddMember }: { sub: SubscriptionItem; onOpen: () => void; onAddMember: () => void }) {
  const minDays = getMinDaysLeft(sub);
  const monthlyTotal = getMonthlyTotal(sub);

  return (
    <div
      onClick={onOpen}
      className="relative group rounded-[12px] border border-white/[0.07] overflow-hidden transition-colors hover:bg-white/[0.05] hover:border-white/[0.12] bg-white/[0.03] cursor-pointer p-3.5"
    >
      {/* Top row: icon + name + menu */}
      <div className="flex items-start gap-2.5 mb-2">
        <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center shrink-0">
          <CreditCard size={14} className="text-indigo-400/80" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight truncate pr-6" style={{ color: "var(--t-primary)" }}>
            {sub.name}
          </p>
          {monthlyTotal > 0 && (
            <p className="text-[11px] font-semibold tabular-nums mt-0.5 money-expense">
              {monthlyTotal.toLocaleString("ru-RU")} ₽ / мес
            </p>
          )}
        </div>
      </div>

      {/* Bottom row: date + badge + members count */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {sub.paid_until_self ? (
            <span className="text-[11px] tabular-nums truncate" style={{ color: "var(--t-muted)" }}>
              до {formatDate(sub.paid_until_self)}
            </span>
          ) : (
            <span className="text-[11px]" style={{ color: "var(--t-faint)" }}>нет даты</span>
          )}
          {minDays !== null && (
            <span className={clsx("text-[9px] font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap", daysBadgeCls(minDays))}>
              {daysLabel(minDays)}
            </span>
          )}
        </div>
        {sub.total_members > 0 && (
          <span className="text-[10px] tabular-nums shrink-0" style={{ color: "var(--t-faint)" }}>
            {sub.total_members} уч.
          </span>
        )}
      </div>

      {/* Quick menu */}
      <div className="absolute top-2.5 right-2.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
        <QuickMenu onOpen={onOpen} onAddMember={onAddMember} />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type FilterKind = "all" | "active" | "overdue" | "expiring";
type SortKind   = "expiry" | "cost" | "name";

const FILTERS: { value: FilterKind; label: string }[] = [
  { value: "all",      label: "Все" },
  { value: "active",   label: "Активные" },
  { value: "overdue",  label: "Просроченные" },
  { value: "expiring", label: "Скоро истекают" },
];

const SORTS: { value: SortKind; label: string }[] = [
  { value: "expiry", label: "По дате окончания" },
  { value: "cost",   label: "По стоимости" },
  { value: "name",   label: "По названию" },
];

function applyFilter(subs: SubscriptionItem[], filter: FilterKind): SubscriptionItem[] {
  if (filter === "all") return subs;
  return subs.filter((sub) => {
    const min = getMinDaysLeft(sub);
    if (filter === "active")   return min === null || min >= 0;
    if (filter === "overdue")  return min !== null && min < 0;
    if (filter === "expiring") return min !== null && min >= 0 && min <= 30;
    return true;
  });
}

function applySort(subs: SubscriptionItem[], sort: SortKind): SubscriptionItem[] {
  return [...subs].sort((a, b) => {
    if (sort === "name")   return a.name.localeCompare(b.name, "ru");
    if (sort === "cost")   return getMonthlyTotal(b) - getMonthlyTotal(a);
    if (sort === "expiry") {
      const da = getMinDaysLeft(a);
      const db = getMinDaysLeft(b);
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    }
    return 0;
  });
}

export default function SubscriptionsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const { data, isLoading, isError } = useSubscriptions(showArchived);
  const [filter, setFilter]         = useState<FilterKind>("all");
  const [sort, setSort]             = useState<SortKind>("expiry");
  const [selectedSub, setSelectedSub] = useState<SubscriptionItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [addMemberSubId, setAddMemberSubId] = useState<number | null>(null);

  // When showArchived is true, show only archived; when false, show only active
  const visibleData = data
    ? data.filter((s) => showArchived ? s.is_archived : !s.is_archived)
    : undefined;

  const monthlyExpense = visibleData?.reduce((sum, sub) => sum + getMonthlyTotal(sub), 0) ?? 0;
  const expiringCount  = visibleData?.reduce((n, sub) => {
    const min = getMinDaysLeft(sub);
    return n + (min !== null && min >= 0 && min <= 14 ? 1 : 0);
  }, 0) ?? 0;

  const filtered = visibleData ? applySort(applyFilter(visibleData, filter), sort) : [];

  // Keep selectedSub in sync after mutations (data refreshes)
  const freshSub = selectedSub ? (data?.find((s) => s.id === selectedSub.id) ?? null) : null;

  return (
    <>
      {freshSub && (
        <SubscriptionDetailPanel sub={freshSub} onClose={() => setSelectedSub(null)} />
      )}
      {showCreate && (
        <CreateSubscriptionModal onClose={() => setShowCreate(false)} />
      )}
      {addMemberSubId !== null && (
        <AddMemberModal subId={addMemberSubId} onClose={() => setAddMemberSubId(null)} />
      )}
      <AppTopbar title="Подписки" />
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-[960px]">

          {/* ── Header actions ──────────────────────────────────────── */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--t-faint)" }}>
              Управление подписками
            </h2>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-semibold rounded-xl px-4 py-2 transition-colors shadow-sm"
            >
              <span className="text-[16px] leading-none">+</span>
              Подписка
            </button>
          </div>

          {isLoading && (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-32 bg-white/[0.03] rounded-[14px] animate-pulse" />
              ))}
            </div>
          )}

          {isError && (
            <div className="text-red-400/70 text-sm text-center mt-12">
              Не удалось загрузить подписки
            </div>
          )}

          {visibleData && (
            <div className="space-y-5">
              {/* ── KPI ───────────────────────────────────────────── */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  {
                    value: visibleData.length,
                    label: "Подписок",
                    color: "var(--t-primary)",
                    border: "border-white/[0.07]",
                    bg: "bg-white/[0.04]",
                  },
                  {
                    value: monthlyExpense > 0
                      ? monthlyExpense.toLocaleString("ru-RU") + " ₽"
                      : "—",
                    label: "Расход в месяц",
                    color: "#ff6b6b",
                    border: "border-red-500/20",
                    bg: "bg-red-500/[0.04]",
                  },
                  {
                    value: expiringCount,
                    label: "Истекают ≤14д",
                    color: expiringCount > 0 ? "#fbbf24" : "var(--t-primary)",
                    border: expiringCount > 0 ? "border-amber-500/20" : "border-white/[0.07]",
                    bg: expiringCount > 0 ? "bg-amber-500/[0.04]" : "bg-white/[0.04]",
                  },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className={clsx("rounded-[14px] border p-4 text-center min-h-[72px] flex flex-col items-center justify-center gap-1", kpi.border, kpi.bg)}
                  >
                    <p
                      className="text-[24px] font-bold tabular-nums leading-none"
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

              {/* ── Filters + Sort ────────────────────────────────── */}
              <div className="flex flex-wrap items-center gap-4">
                {/* Archive toggle */}
                <label className="flex items-center gap-2 text-[12px] cursor-pointer" style={{ color: "var(--t-muted)" }}>
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(e) => setShowArchived(e.target.checked)}
                    className="rounded"
                  />
                  Архивные
                </label>

                {/* Filter pills — only shown when not in archive mode */}
                {!showArchived && (
                  <div className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.07] rounded-xl p-1">
                    {FILTERS.map((f) => (
                      <button
                        key={f.value}
                        onClick={() => setFilter(f.value)}
                        className={clsx(
                          "px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all",
                          filter === f.value
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "hover:bg-white/[0.05]"
                        )}
                        style={{ color: filter === f.value ? undefined : "var(--t-secondary)" }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Sort select */}
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-[11px] font-semibold uppercase tracking-widest shrink-0" style={{ color: "var(--t-faint)" }}>
                    Сортировка
                  </span>
                  <div className="w-52">
                    <Select
                      value={sort}
                      onChange={(v) => setSort(v as SortKind)}
                      options={SORTS.map((s) => ({ value: s.value, label: s.label }))}
                    />
                  </div>
                </div>
              </div>

              {/* ── Subscription list ─────────────────────────────── */}
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center">
                    <CreditCard size={20} className="text-white/35" />
                  </div>
                  <p className="text-sm font-medium" style={{ color: "var(--t-muted)" }}>
                    {showArchived ? "Нет архивных подписок" : filter === "all" ? "Нет активных подписок" : "Нет подписок в этой категории"}
                  </p>
                  {!showArchived && filter === "all" && (
                    <button
                      onClick={() => setShowCreate(true)}
                      className="text-[13px] font-medium text-indigo-400/70 hover:text-indigo-400 transition-colors"
                    >
                      + Добавить подписку
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filtered.map((s) => (
                    <SubCard key={s.id} sub={s} onOpen={() => setSelectedSub(s)} onAddMember={() => setAddMemberSubId(s.id)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
