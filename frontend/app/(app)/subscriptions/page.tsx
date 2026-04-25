"use client";

import { useState, useRef, useEffect } from "react";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { PageTabs } from "@/components/layout/PageTabs";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { SubscriptionDetailPanel } from "@/components/subscriptions/SubscriptionDetailPanel";
import { CreateSubscriptionModal } from "@/components/modals/CreateSubscriptionModal";
import { AddMemberModal } from "@/components/modals/AddMemberModal";
import type { SubscriptionItem } from "@/types/api";
import { CreditCard, MoreHorizontal } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { clsx } from "clsx";
import { Button } from "@/components/primitives/Button";
import { Badge } from "@/components/primitives/Badge";
import { Checkbox } from "@/components/primitives/Checkbox";
import { Skeleton } from "@/components/primitives/Skeleton";
import { EmptyState } from "@/components/primitives/EmptyState";
import { SectionHeader } from "@/components/primitives/SectionHeader";
import { Stat } from "@/components/primitives/Stat";

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysLabel(days: number | null): string {
  if (days === null) return "—";
  if (days < 0) return `просрочено ${Math.abs(days)}д`;
  if (days === 0) return "сегодня";
  return `${days}д`;
}

function daysBadgeVariant(days: number | null): "neutral" | "danger" | "warning" | "success" {
  if (days === null) return "neutral";
  if (days < 0)    return "danger";
  if (days <= 7)   return "danger";
  if (days <= 30)  return "warning";
  return "success";
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
      className="relative group rounded-[12px] bg-slate-50 dark:bg-white/[0.03] border-[1.5px] border-slate-300 dark:border-white/[0.09] overflow-hidden transition-colors hover:bg-slate-100 dark:hover:bg-white/[0.05] hover:border-slate-400 dark:hover:border-white/[0.12] cursor-pointer p-3.5"
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
            <Badge variant={daysBadgeVariant(minDays)} size="sm" className="whitespace-nowrap">
              {daysLabel(minDays)}
            </Badge>
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
      <AppTopbar title="Деньги" />
      <PageTabs tabs={[
        { href: "/money", label: "Операции" },
        { href: "/wallets", label: "Кошельки" },
        { href: "/subscriptions", label: "Подписки" },
        { href: "/categories", label: "Категории" },
      ]} />
      <main className="flex-1 overflow-auto p-3 md:p-6">
        <div className="w-full">

          {/* ── Header actions ──────────────────────────────────────── */}
          <div className="mb-6">
            <SectionHeader
              title="Управление подписками"
              size="sm"
              actions={
                <Button onClick={() => setShowCreate(true)} variant="primary" size="md">
                  <span className="text-[16px] leading-none">+</span>
                  Подписка
                </Button>
              }
            />
          </div>

          {isLoading && (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} variant="rect" height={128} className="rounded-[14px]" />
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
                    valueClass: "",
                    border: "border-slate-200 dark:border-white/[0.07]",
                    bg: "bg-white dark:bg-white/[0.04]",
                  },
                  {
                    value: monthlyExpense > 0
                      ? monthlyExpense.toLocaleString("ru-RU") + " ₽"
                      : "—",
                    label: "Расход в месяц",
                    valueClass: "text-red-600 dark:text-red-400",
                    border: "border-red-500/20",
                    bg: "bg-red-50 dark:bg-red-500/[0.04]",
                  },
                  {
                    value: expiringCount,
                    label: "Истекают ≤14д",
                    valueClass: expiringCount > 0 ? "text-amber-600 dark:text-amber-400" : "",
                    border: expiringCount > 0 ? "border-amber-500/20" : "border-slate-200 dark:border-white/[0.07]",
                    bg: expiringCount > 0 ? "bg-amber-50 dark:bg-amber-500/[0.04]" : "bg-white dark:bg-white/[0.04]",
                  },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className={clsx("rounded-[14px] border p-4 min-h-[72px] flex items-center justify-center", kpi.border, kpi.bg)}
                  >
                    <Stat
                      label={kpi.label}
                      value={kpi.value}
                      align="center"
                      size="lg"
                      valueClassName={kpi.valueClass}
                    />
                  </div>
                ))}
              </div>

              {/* ── Filters + Sort ────────────────────────────────── */}
              <div className="flex flex-wrap items-center gap-4">
                {/* Archive toggle */}
                <Checkbox
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  label="Архивные"
                  size="sm"
                />

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
                <EmptyState
                  icon={<CreditCard size={24} />}
                  title={showArchived ? "Нет архивных подписок" : filter === "all" ? "Нет активных подписок" : "Нет подписок в этой категории"}
                  action={!showArchived && filter === "all" ? (
                    <Button variant="link" size="sm" onClick={() => setShowCreate(true)} className="text-indigo-400/70 hover:text-indigo-400 px-0">
                      + Добавить подписку
                    </Button>
                  ) : undefined}
                />
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
