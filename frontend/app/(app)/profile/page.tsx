"use client";

import { useQuery } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { clsx } from "clsx";
import { ArrowRight, Star, Zap, TrendingUp, Settings, Bell, Wallet, Lock } from "lucide-react";

interface XpProfile {
  xp_total: number;
  level: number;
  xp_in_level: number;
  xp_needed: number;
  progress_pct: number;
}

interface ProfileData {
  email: string;
  registration_date: string;
  days_in_system: number;
  xp: XpProfile;
  level_title: string;
  daily_xp_total: number;
  current_month_label: string;
  monthly_xp: { label: string; xp: number }[];
  recent_xp_events: { description?: string; xp?: number; occurred_at?: string }[];
  theme: string | null;
  enable_task_expense_link: boolean;
  enable_task_templates: boolean;
  enable_task_reschedule_reasons: boolean;
}

const LEVEL_GRADIENTS = [
  "from-slate-400 to-slate-500",
  "from-blue-500 to-blue-600",
  "from-indigo-500 to-indigo-600",
  "from-violet-500 to-purple-600",
  "from-pink-500 to-rose-600",
  "from-amber-500 to-orange-600",
  "from-emerald-500 to-teal-600",
  "from-teal-500 to-cyan-600",
  "from-cyan-500 to-sky-600",
  "from-orange-500 to-red-600",
  "from-red-500 to-rose-600",
  "from-rose-500 to-pink-600",
];

const QUICK_LINKS = [
  { label: "Настройки уведомлений", href: "/legacy/settings/notifications", icon: Bell },
  { label: "Настройки эффективности", href: "/legacy/efficiency/settings", icon: TrendingUp },
  { label: "Кошельки", href: "/wallets", icon: Wallet },
  { label: "Смена пароля", href: "/legacy/profile", icon: Lock },
];

export default function ProfilePage() {
  const { data, isLoading, isError } = useQuery<ProfileData>({
    queryKey: ["profile"],
    queryFn: () => fetch("/api/v2/profile", { credentials: "include" }).then((r) => r.json()),
    staleTime: 60_000,
  });

  const maxMonthlyXp = data ? Math.max(...(data.monthly_xp ?? []).map((m) => m.xp), 1) : 1;

  return (
    <>
      <AppTopbar title="Профиль" />
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-[680px]">
          {isLoading && (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-28 bg-white/[0.03] rounded-2xl animate-pulse" />
              ))}
            </div>
          )}

          {isError && (
            <p className="text-red-400/70 text-sm text-center py-12">Не удалось загрузить профиль</p>
          )}

          {data && (
            <div className="space-y-4">
              {/* Identity card */}
              <div className="bg-white/[0.04] border border-white/[0.07] rounded-2xl overflow-hidden">
                {/* Banner */}
                <div className={clsx(
                  "h-16 bg-gradient-to-r opacity-30",
                  LEVEL_GRADIENTS[Math.min(data.xp.level, LEVEL_GRADIENTS.length - 1)]
                )} />
                <div className="px-5 pb-5">
                  {/* Avatar overlapping banner */}
                  <div className="flex items-end justify-between -mt-7 mb-4">
                    <div className={clsx(
                      "w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white shrink-0 shadow-lg bg-gradient-to-br ring-4 ring-[var(--app-bg)]",
                      LEVEL_GRADIENTS[Math.min(data.xp.level, LEVEL_GRADIENTS.length - 1)]
                    )}>
                      {data.xp.level}
                    </div>
                    <a
                      href="/legacy/profile"
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/72 hover:text-white/70 transition-colors"
                    >
                      <Settings size={12} /> Настройки
                    </a>
                  </div>

                  <p className="text-base font-semibold text-white/88" style={{ letterSpacing: "-0.015em" }}>
                    {data.email}
                  </p>
                  <p className="text-xs text-white/72 mt-0.5">
                    {data.level_title} · {data.days_in_system} дней в системе
                  </p>

                  {/* XP bar */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-white/65 font-medium">Уровень {data.xp.level} → {data.xp.level + 1}</span>
                      <span className="text-white/72 font-semibold tabular-nums">
                        {data.xp.xp_in_level} / {data.xp.xp_needed} XP
                      </span>
                    </div>
                    <div className="h-2 bg-white/[0.07] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all"
                        style={{ width: `${data.xp.progress_pct}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-white/60 mt-1.5 tabular-nums">
                      Всего XP: {data.xp.xp_total.toLocaleString("ru-RU")}
                    </p>
                  </div>
                </div>
              </div>

              {/* KPI row */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon: Star,       value: data.xp.level,          label: "Уровень",           color: "text-indigo-400" },
                  { icon: Zap,        value: data.xp.xp_total,       label: "Всего XP",           color: "text-amber-400" },
                  { icon: TrendingUp, value: data.daily_xp_total,    label: "XP в этом месяце",   color: "text-emerald-400" },
                ].map((kpi) => (
                  <div key={kpi.label} className="bg-white/[0.04] border border-white/[0.07] rounded-2xl p-4 text-center">
                    <kpi.icon size={14} className={clsx("mx-auto mb-2", kpi.color)} />
                    <div className={clsx("text-2xl font-bold tabular-nums", kpi.color)}
                      style={{ letterSpacing: "-0.04em" }}>
                      {kpi.value.toLocaleString("ru-RU")}
                    </div>
                    <div className="text-[10px] font-semibold text-white/60 uppercase tracking-widest mt-1">
                      {kpi.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Monthly XP chart */}
              {data.monthly_xp && data.monthly_xp.length > 0 && (
                <div className="bg-white/[0.04] border border-white/[0.07] rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[10px] font-semibold text-white/60 uppercase tracking-widest">XP по месяцам</p>
                    <p className="text-xs text-white/72 tabular-nums font-medium">
                      {data.current_month_label}: <span className="text-indigo-400 font-semibold">{data.daily_xp_total} XP</span>
                    </p>
                  </div>
                  <div className="flex items-end gap-1.5 h-24">
                    {data.monthly_xp.map((m, i) => {
                      const h = Math.max(4, Math.round((m.xp / maxMonthlyXp) * 96));
                      const isCurrent = i === data.monthly_xp.length - 1;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <div
                            className={clsx(
                              "w-full rounded-md transition-all",
                              isCurrent
                                ? "bg-gradient-to-t from-indigo-600 to-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.4)]"
                                : "bg-white/[0.08]"
                            )}
                            style={{ height: `${h}px` }}
                            title={`${m.label}: ${m.xp} XP`}
                          />
                          <span className="text-[9px] text-white/50 truncate w-full text-center">
                            {m.label.slice(0, 3)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Recent XP events */}
              {data.recent_xp_events && data.recent_xp_events.length > 0 && (
                <div className="bg-white/[0.04] border border-white/[0.07] rounded-2xl p-5">
                  <p className="text-[10px] font-semibold text-white/60 uppercase tracking-widest mb-4">
                    Последние XP-события
                  </p>
                  <div>
                    {data.recent_xp_events.map((ev, i) => (
                      <div key={i} className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
                        <span className="text-sm text-white/65 truncate font-medium">{ev.description ?? "XP"}</span>
                        <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full tabular-nums shrink-0 ml-3">
                          +{ev.xp ?? 0} XP
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick links */}
              <div>
                <p className="text-[10px] font-semibold text-white/60 uppercase tracking-widest mb-3">Быстрые ссылки</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {QUICK_LINKS.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      className="flex items-center gap-3 bg-white/[0.04] border border-white/[0.07] rounded-xl p-3.5 hover:bg-white/[0.07] hover:border-white/[0.12] transition-all group"
                    >
                      <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center shrink-0">
                        <link.icon size={13} className="text-indigo-400" />
                      </div>
                      <span className="text-sm text-white/55 group-hover:text-white/80 transition-colors font-medium flex-1">
                        {link.label}
                      </span>
                      <ArrowRight size={12} className="text-white/50 group-hover:text-white/72 transition-colors" />
                    </a>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
