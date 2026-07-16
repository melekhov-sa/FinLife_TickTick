"use client";

import { useSetPageTitle } from "@/contexts/PageTitle";
import { TodayBlock } from "@/components/dashboard/TodayBlock";
import { FinanceBlock } from "@/components/dashboard/FinanceBlock";
import { UpcomingPayments } from "@/components/dashboard/UpcomingPayments";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { WeekEventsCard } from "@/components/dashboard/WeekEventsCard";
import { ExpiringSubsCard } from "@/components/dashboard/ExpiringSubsCard";
import { ShoppingWidget } from "@/components/dashboard/ShoppingWidget";
import { useDashboard } from "@/hooks/useDashboard";
import { DigestCard } from "@/components/dashboard/DigestCard";
import { DaypartGlow } from "@/components/dashboard/DaypartGlow";
import { FlashcardsWidget } from "@/components/dashboard/FlashcardsWidget";
import { Skeleton } from "@/components/primitives/Skeleton";
import { PullToRefresh } from "@/components/primitives/PullToRefresh";
import { useQueryClient } from "@tanstack/react-query";

export default function DashboardPage() {
  const { data, isLoading, isError } = useDashboard();
  const qc = useQueryClient();

  const todayLabel = new Date().toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  useSetPageTitle({ title: "Главная", eyebrow: todayLabel });

  return (
    <>
      <main className="flex-1 p-3 md:p-6 relative">
        <DaypartGlow />
        <PullToRefresh
          onRefresh={() =>
            Promise.all([
              qc.invalidateQueries({ queryKey: ["dashboard"] }),
              qc.invalidateQueries({ queryKey: ["wallets"] }),
            ])
          }
        >
        {isError && (
          <div className="text-red-400/70 text-sm text-center py-12">
            Не удалось загрузить дашборд
          </div>
        )}

        {isLoading && (
          <div className="space-y-3 xl:grid xl:grid-cols-[260px_1fr_290px] xl:gap-4 xl:space-y-0 max-w-[1400px]">
            <Skeleton variant="rect" className="h-32 xl:h-40 rounded-xl" />
            <Skeleton variant="rect" className="h-48 xl:h-72 rounded-xl" />
            <Skeleton variant="rect" className="hidden xl:block h-36 rounded-xl" />
          </div>
        )}

        {data && (
          <div className="max-w-[1400px] animate-rise">
            {/* xl+: three-column grid */}
            <div className="hidden xl:grid xl:grid-cols-[260px_1fr_290px] gap-4">
              {/* Left */}
              <div className="space-y-4">
                <FinanceBlock
                  finState={data.fin_state}
                  financialSummary={data.financial_summary}
                />
                {data.shopping_list_id && data.shopping_items.length > 0 && (
                  <ShoppingWidget listId={data.shopping_list_id} items={data.shopping_items} />
                )}
                <WeekEventsCard events={data.week_events} />
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
                <FlashcardsWidget />
                <DigestCard />
                <UpcomingPayments payments={data.upcoming_payments} />
                <ExpiringSubsCard subs={data.expiring_subs} docs={data.expiring_docs} />
              </div>
            </div>

            {/* < xl: single column */}
            <div className="xl:hidden space-y-3 md:space-y-4">
              <TodayBlock
                today={data.today}
                plannedOps={data.upcoming_payments.filter((p) => p.days_until === 0)}
              />
              <FinanceBlock
                finState={data.fin_state}
                financialSummary={data.financial_summary}
              />
              {data.shopping_list_id && data.shopping_items.length > 0 && (
                <ShoppingWidget listId={data.shopping_list_id} items={data.shopping_items} />
              )}
              <WeekEventsCard events={data.week_events} />
              <UpcomingPayments payments={data.upcoming_payments} />
              <ExpiringSubsCard subs={data.expiring_subs} docs={data.expiring_docs} />
              <FlashcardsWidget />
              <DigestCard />
              <ActivityFeed feed={data.feed} />
            </div>
          </div>
        )}
        </PullToRefresh>
      </main>
    </>
  );
}
