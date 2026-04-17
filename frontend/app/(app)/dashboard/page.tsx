"use client";

import { AppTopbar } from "@/components/layout/AppTopbar";
import { TodayBlock } from "@/components/dashboard/TodayBlock";
import { FinanceBlock } from "@/components/dashboard/FinanceBlock";
import { UpcomingPayments } from "@/components/dashboard/UpcomingPayments";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { ProgressBlock } from "@/components/dashboard/ProgressBlock";
import { WeekEventsCard } from "@/components/dashboard/WeekEventsCard";
import { ExpiringSubsCard } from "@/components/dashboard/ExpiringSubsCard";
import { useDashboard } from "@/hooks/useDashboard";

function Skeleton({ className }: { className?: string }) {
  return <div className={`bg-white/[0.04] animate-pulse rounded-xl ${className ?? ""}`} />;
}

export default function DashboardPage() {
  const { data, isLoading, isError } = useDashboard();

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

      <main className="flex-1 overflow-auto p-3 md:p-6">
        {isError && (
          <div className="text-red-400/70 text-sm text-center py-12">
            Не удалось загрузить дашборд
          </div>
        )}

        {isLoading && (
          <div className="space-y-3 xl:grid xl:grid-cols-[260px_1fr_290px] xl:gap-4 xl:space-y-0 max-w-[1400px]">
            <Skeleton className="h-32 xl:h-40" />
            <Skeleton className="h-48 xl:h-72" />
            <Skeleton className="hidden xl:block h-36" />
          </div>
        )}

        {data && (
          <div className="max-w-[1400px]">
            {/* xl+: three-column grid */}
            <div className="hidden xl:grid xl:grid-cols-[260px_1fr_290px] gap-4">
              {/* Left */}
              <div className="space-y-4">
                <FinanceBlock
                  finState={data.fin_state}
                  financialSummary={data.financial_summary}
                />
                <ProgressBlock
                  level={data.level}
                  efficiency={data.efficiency}
                  cells={data.habit_heatmap}
                />
              </div>

              {/* Center */}
              <div className="space-y-4 min-w-0 overflow-hidden">
                <TodayBlock
                  today={data.today}
                  plannedOps={data.upcoming_payments.filter((p) => p.days_until === 0)}
                />
                <ActivityFeed feed={data.feed} />
              </div>

              {/* Right */}
              <div className="space-y-4">
                <UpcomingPayments payments={data.upcoming_payments} />
                <WeekEventsCard events={data.week_events} />
                <ExpiringSubsCard subs={data.expiring_subs} />
              </div>
            </div>

            {/* < xl: single column, action block first */}
            <div className="xl:hidden space-y-3 md:space-y-4">
              <TodayBlock
                today={data.today}
                plannedOps={data.upcoming_payments.filter((p) => p.days_until === 0)}
              />
              <FinanceBlock
                finState={data.fin_state}
                financialSummary={data.financial_summary}
              />
              <ProgressBlock
                level={data.level}
                efficiency={data.efficiency}
                cells={data.habit_heatmap}
              />
              <UpcomingPayments payments={data.upcoming_payments} />
              <WeekEventsCard events={data.week_events} />
              <ExpiringSubsCard subs={data.expiring_subs} />
              <ActivityFeed feed={data.feed} />
            </div>
          </div>
        )}
      </main>
    </>
  );
}
