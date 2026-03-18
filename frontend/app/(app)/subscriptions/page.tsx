"use client";

import { useState, useRef, useEffect } from "react";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { SubscriptionDetailPanel } from "@/components/subscriptions/SubscriptionDetailPanel";
import type { SubscriptionItem, SubscriptionMember } from "@/types/api";
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

function daysTextCls(days: number | null): string {
  if (days === null) return "";
  if (days < 0)   return "text-red-400";
  if (days <= 7)  return "text-red-400";
  if (days <= 30) return "text-amber-400";
  return "text-emerald-400";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
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

// ── MemberRow ─────────────────────────────────────────────────────────────────

function MemberRow({ member }: { member: SubscriptionMember }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-white/[0.06] last:border-0 rounded-lg px-2 -mx-2 hover:bg-white/[0.03] transition-colors">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-indigo-500/15 flex items-center justify-center text-[11px] font-bold text-indigo-300/80 shrink-0">
        {getInitials(member.contact_name)}
      </div>

      {/* Name + cost */}
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium leading-snug truncate" style={{ color: "var(--t-primary)" }}>
          {member.contact_name}
        </p>
        {member.payment_per_month ? (
          <p className="text-[12px] tabular-nums" style={{ color: "var(--t-muted)" }}>
            {member.payment_per_month.toLocaleString("ru-RU")} ₽&nbsp;/&nbsp;мес
          </p>
        ) : (
          <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>нет суммы</p>
        )}
      </div>

      {/* Date + badge */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        {member.paid_until && (
          <span className="text-[12px] tabular-nums" style={{ color: "var(--t-muted)" }}>
            до {formatDate(member.paid_until)}
          </span>
        )}
        {member.days_left !== null && (
          <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded-full border", daysBadgeCls(member.days_left))}>
            {daysLabel(member.days_left)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Quick Actions Menu ────────────────────────────────────────────────────────

function QuickMenu({ subId, onOpen }: { subId: number; onOpen: () => void }) {
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
            { label: "Добавить участника", href: `/legacy/subscriptions/${subId}/members/add` },
          ].map((item) => (
            "href" in item ? (
              <a
                key={item.label}
                href={item.href}
                onClick={(e) => e.stopPropagation()}
                className="block px-4 py-2 text-[13px] font-medium transition-colors hover:bg-white/[0.05] hover:text-white/90"
                style={{ color: "var(--t-secondary)" }}
              >
                {item.label}
              </a>
            ) : (
              <button
                key={item.label}
                onClick={(e) => { e.stopPropagation(); item.action(); }}
                className="w-full text-left block px-4 py-2 text-[13px] font-medium transition-colors hover:bg-white/[0.05] hover:text-white/90"
                style={{ color: "var(--t-secondary)" }}
              >
                {item.label}
              </button>
            )
          ))}
        </div>
      )}
    </div>
  );
}

// ── SubCard ───────────────────────────────────────────────────────────────────

function SubCard({ sub, onOpen }: { sub: SubscriptionItem; onOpen: () => void }) {
  const minDays = getMinDaysLeft(sub);
  const monthlyTotal = getMonthlyTotal(sub);
  const [membersExpanded, setMembersExpanded] = useState(false);

  return (
    <div className="relative group rounded-[14px] border border-white/[0.07] overflow-hidden transition-colors hover:bg-white/[0.03] hover:border-white/[0.10] bg-white/[0.03]">
      <div onClick={onOpen} className="block cursor-pointer">
        {/* Card header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3 min-w-0">
            {/* Icon */}
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center shrink-0">
              <CreditCard size={16} className="text-indigo-400/80" />
            </div>
            {/* Name + meta */}
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-snug truncate" style={{ color: "var(--t-primary)", letterSpacing: "-0.01em" }}>
                {sub.name}
              </p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-[12px]" style={{ color: "var(--t-muted)" }}>
                  {sub.total_members} {sub.total_members === 1 ? "участник" : "участников"}
                </span>
                {monthlyTotal > 0 && (
                  <span className="text-[12px] font-semibold tabular-nums money-expense">
                    {monthlyTotal.toLocaleString("ru-RU")} ₽&nbsp;/&nbsp;мес
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: expiry + menu */}
          <div className="flex items-center gap-2 shrink-0 ml-3">
            {sub.paid_until_self && (
              <div className="flex flex-col items-end gap-1">
                <span className="text-[12px] tabular-nums" style={{ color: "var(--t-muted)" }}>
                  до {formatDate(sub.paid_until_self)}
                </span>
                {minDays !== null && (
                  <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded-full border", daysBadgeCls(minDays))}>
                    {daysLabel(minDays)}
                  </span>
                )}
              </div>
            )}
            {!sub.paid_until_self && minDays !== null && (
              <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded-full border", daysBadgeCls(minDays))}>
                {daysLabel(minDays)}
              </span>
            )}
          </div>
        </div>

        {/* Members */}
        {sub.members.length > 0 ? (
          <div className="px-3 pb-1">
            <button
              onClick={(e) => { e.stopPropagation(); setMembersExpanded((v) => !v); }}
              className="flex items-center gap-2 w-full px-2 py-2 text-[12px] font-medium hover:bg-white/[0.03] transition-colors rounded-lg"
              style={{ color: "var(--t-muted)" }}
            >
              <span className="text-[10px]">{membersExpanded ? "▾" : "▸"}</span>
              Участники ({sub.members.length})
            </button>
            {membersExpanded && (
              <div className="px-2">
                {sub.members.map((m) => (
                  <MemberRow key={m.member_id} member={m} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="px-5 py-3 space-y-2.5">
            {sub.paid_until_self && (
              <div className="flex items-center justify-between py-1.5 border-b border-white/[0.06]">
                <span className="text-[13px] font-medium" style={{ color: "var(--t-secondary)" }}>
                  Ваша подписка до{" "}
                  <span className={clsx("tabular-nums", daysTextCls(sub.days_left_self))}>
                    {formatDate(sub.paid_until_self)}
                  </span>
                </span>
                {sub.days_left_self !== null && (
                  <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded-full border", daysBadgeCls(sub.days_left_self))}>
                    {daysLabel(sub.days_left_self)}
                  </span>
                )}
              </div>
            )}
            <div className="flex items-center justify-between py-1">
              <span className="text-[13px]" style={{ color: "var(--t-faint)" }}>Нет участников</span>
              <span className="text-[13px] font-medium text-indigo-400/70 hover:text-indigo-400 transition-colors">
                + Добавить участника
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Quick menu — overlaid so it doesn't trigger card navigation */}
      <div className="absolute top-3.5 right-3.5 z-10" onClick={(e) => e.stopPropagation()}>
        <QuickMenu subId={sub.id} onOpen={onOpen} />
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
  const { data, isLoading, isError } = useSubscriptions();
  const [filter, setFilter]         = useState<FilterKind>("all");
  const [sort, setSort]             = useState<SortKind>("expiry");
  const [selectedSub, setSelectedSub] = useState<SubscriptionItem | null>(null);

  const monthlyExpense = data?.reduce((sum, sub) => sum + getMonthlyTotal(sub), 0) ?? 0;
  const expiringCount  = data?.reduce((n, sub) => {
    const min = getMinDaysLeft(sub);
    return n + (min !== null && min >= 0 && min <= 14 ? 1 : 0);
  }, 0) ?? 0;

  const filtered = data ? applySort(applyFilter(data, filter), sort) : [];

  // Keep selectedSub in sync after mutations (data refreshes)
  const freshSub = selectedSub ? (data?.find((s) => s.id === selectedSub.id) ?? null) : null;

  return (
    <>
      {freshSub && (
        <SubscriptionDetailPanel sub={freshSub} onClose={() => setSelectedSub(null)} />
      )}
      <AppTopbar title="Подписки" />
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-[760px]">

          {/* ── Header actions ──────────────────────────────────────── */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--t-faint)" }}>
              Управление подписками
            </h2>
            <a
              href="/legacy/subscriptions/new"
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-semibold rounded-xl px-4 py-2 transition-colors shadow-sm"
            >
              <span className="text-[16px] leading-none">+</span>
              Подписка
            </a>
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

          {data && (
            <div className="space-y-5">
              {/* ── KPI ───────────────────────────────────────────── */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  {
                    value: data.length,
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
                {/* Filter pills */}
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
                    {filter === "all" ? "Нет активных подписок" : "Нет подписок в этой категории"}
                  </p>
                  {filter === "all" && (
                    <a
                      href="/legacy/subscriptions/new"
                      className="text-[13px] font-medium text-indigo-400/70 hover:text-indigo-400 transition-colors"
                    >
                      + Добавить подписку
                    </a>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map((s) => (
                    <SubCard key={s.id} sub={s} onOpen={() => setSelectedSub(s)} />
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
