"use client";

import { AppTopbar } from "@/components/layout/AppTopbar";
import { TodayBlock } from "@/components/dashboard/TodayBlock";
import { FinanceBlock } from "@/components/dashboard/FinanceBlock";
import { UpcomingPayments } from "@/components/dashboard/UpcomingPayments";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { HabitHeatmap } from "@/components/dashboard/HabitHeatmap";
import { LevelCard } from "@/components/dashboard/LevelCard";
import { EfficiencyCard } from "@/components/dashboard/EfficiencyCard";
import { WeekEventsCard } from "@/components/dashboard/WeekEventsCard";
import { ExpiringSubsCard } from "@/components/dashboard/ExpiringSubsCard";
import { useDashboard } from "@/hooks/useDashboard";

function Skeleton({ className }: { className?: string }) {
  return <div className={`bg-white/[0.04] animate-pulse rounded-xl ${className ?? ""}`} />;
}

export default function DashboardPage() {
  const { data, isLoading, isError } = useDashboard();

  // Format today's date as Russian string
  const todayLabel = new Date().toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <AppTopbar
        title="Главная"
        subtitle={todayLabel}
      />

      <main className="flex-1 overflow-auto p-6">
        {isError && (
          <div className="text-red-400/70 text-sm text-center py-12">
            Не удалось загрузить дашборд
          </div>
        )}

        {isLoading && (
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_260px] gap-4 max-w-[1400px]">
            <div className="space-y-4">
              <Skeleton className="h-40" />
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
              <Skeleton className="h-48" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-72" />
              <Skeleton className="h-48" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-36" />
              <Skeleton className="h-48" />
              <Skeleton className="h-40" />
            </div>
          </div>
        )}

        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_260px] gap-4 max-w-[1400px]">

            {/* ── Левая колонка: финансы + уровень + эффективность ─────────── */}
            <div className="space-y-4">
              <FinanceBlock
                finState={data.fin_state}
                financialSummary={data.financial_summary}
              />
              {data.level && <LevelCard level={data.level} />}
              {data.efficiency && <EfficiencyCard efficiency={data.efficiency} />}
              <HabitHeatmap cells={data.habit_heatmap} />
            </div>

            {/* ── Центр: фокус дня + дневник ───────────────────────────────── */}
            <div className="space-y-4">
              <TodayBlock today={data.today} />
              <ActivityFeed feed={data.feed} />
            </div>

            {/* ── Правая колонка: платежи + события + окончания ────────────── */}
            <div className="space-y-4">
              <UpcomingPayments payments={data.upcoming_payments} />
              <WeekEventsCard events={data.week_events} />
              <ExpiringSubsCard subs={data.expiring_subs} />
            </div>

          </div>
        )}
      </main>
    </>
  );
}
