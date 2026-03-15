"use client";

import { AppTopbar } from "@/components/layout/AppTopbar";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import type { SubscriptionItem, SubscriptionMember } from "@/types/api";
import { CreditCard, ArrowRight } from "lucide-react";
import { clsx } from "clsx";

function daysColor(days: number | null): string {
  if (days === null) return "text-white/60";
  if (days < 0) return "text-red-400";
  if (days <= 7) return "text-red-400";
  if (days <= 30) return "text-amber-400";
  return "text-emerald-400";
}

function daysLabel(days: number | null): string {
  if (days === null) return "—";
  if (days < 0) return `просрочено ${Math.abs(days)}д`;
  if (days === 0) return "сегодня";
  return `${days}д`;
}

function statusBadge(days: number | null) {
  if (days === null) return null;
  if (days < 0) return "bg-red-500/10 border border-red-500/20 text-red-400";
  if (days <= 7) return "bg-red-500/10 border border-red-500/20 text-red-400";
  if (days <= 30) return "bg-amber-500/10 border border-amber-500/20 text-amber-400";
  return "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400";
}

function MemberRow({ member }: { member: SubscriptionMember }) {
  const badge = statusBadge(member.days_left);
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 rounded-full bg-indigo-500/15 flex items-center justify-center text-xs font-semibold text-indigo-400 shrink-0">
          {member.contact_name[0]?.toUpperCase()}
        </div>
        <span className="text-sm text-white/72 truncate font-medium">{member.contact_name}</span>
        {member.payment_per_month && (
          <span className="text-xs text-white/60 shrink-0 tabular-nums">
            {member.payment_per_month.toLocaleString("ru-RU")} ₽/мес
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-3">
        {member.paid_until && (
          <span className="text-[11px] text-white/65">
            до {new Date(member.paid_until).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
          </span>
        )}
        {badge && (
          <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", badge)}>
            {daysLabel(member.days_left)}
          </span>
        )}
      </div>
    </div>
  );
}

function SubCard({ sub }: { sub: SubscriptionItem }) {
  const selfBadge = statusBadge(sub.days_left_self);
  return (
    <div className="bg-white/[0.04] border border-white/[0.07] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.05]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/15 flex items-center justify-center">
            <CreditCard size={15} className="text-indigo-400" />
          </div>
          <div>
            <span className="text-sm font-semibold text-white/88" style={{ letterSpacing: "-0.01em" }}>
              {sub.name}
            </span>
            <span className="text-[11px] text-white/60 ml-2">{sub.total_members} уч.</span>
          </div>
        </div>
        {sub.paid_until_self && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-white/65">
              до {new Date(sub.paid_until_self).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
            </span>
            {selfBadge && (
              <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", selfBadge)}>
                {daysLabel(sub.days_left_self)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Members */}
      {sub.members.length > 0 ? (
        <div className="px-5 py-1">
          {sub.members.map((m) => (
            <MemberRow key={m.member_id} member={m} />
          ))}
        </div>
      ) : (
        <div className="px-5 py-3 text-xs text-white/55">Нет участников</div>
      )}
    </div>
  );
}

export default function SubscriptionsPage() {
  const { data, isLoading, isError } = useSubscriptions();

  const dateSubtitle = new Date().toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const expiringCount = data?.reduce((n, s) => {
    const soon = s.members.filter(
      (m) => m.days_left !== null && m.days_left >= 0 && m.days_left <= 14
    ).length;
    return n + soon;
  }, 0) ?? 0;

  return (
    <>
      <AppTopbar title="Подписки" subtitle={dateSubtitle} />
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-[760px]">
          {isLoading && (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-32 bg-white/[0.03] rounded-2xl animate-pulse" />
              ))}
            </div>
          )}

          {isError && (
            <div className="text-white/68 text-sm text-center mt-12">
              Не удалось загрузить подписки
            </div>
          )}

          {data && (
            <div className="space-y-5">
              {/* Controls */}
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold text-white/60 uppercase tracking-widest">
                  Управление подписками
                </p>
                <a
                  href="/legacy/subscriptions"
                  className="flex items-center gap-1 text-xs text-white/65 hover:text-white/60 transition-colors"
                >
                  Все подписки <ArrowRight size={12} />
                </a>
              </div>

              {/* KPI */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: data.length,                                        label: "Подписок",       color: "text-white/88" },
                  { value: data.reduce((s, x) => s + x.total_members, 0),     label: "Участников",     color: "text-white/88" },
                  { value: expiringCount, label: "Истекают ≤14д", color: expiringCount > 0 ? "text-amber-400" : "text-white/88" },
                ].map((kpi) => (
                  <div key={kpi.label} className="bg-white/[0.04] border border-white/[0.07] rounded-2xl p-4 text-center">
                    <div className={clsx("text-3xl font-bold tabular-nums", kpi.color)}
                      style={{ letterSpacing: "-0.04em" }}>
                      {kpi.value}
                    </div>
                    <div className="text-[10px] font-semibold text-white/60 uppercase tracking-widest mt-1.5">
                      {kpi.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* List */}
              {data.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center">
                    <CreditCard size={20} className="text-white/55" />
                  </div>
                  <p className="text-sm text-white/60 font-medium">Нет активных подписок</p>
                  <a
                    href="/legacy/subscriptions"
                    className="text-xs font-medium text-indigo-400/70 hover:text-indigo-400 transition-colors"
                  >
                    + Добавить подписку →
                  </a>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.map((s) => (
                    <SubCard key={s.id} sub={s} />
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
