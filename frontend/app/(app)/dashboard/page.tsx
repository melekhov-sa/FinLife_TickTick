"use client";

import { AppTopbar } from "@/components/layout/AppTopbar";
import { TodayBlock } from "@/components/dashboard/TodayBlock";
import { FinanceBlock } from "@/components/dashboard/FinanceBlock";
import { UpcomingPayments } from "@/components/dashboard/UpcomingPayments";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { HabitHeatmap } from "@/components/dashboard/HabitHeatmap";
import { useDashboard } from "@/hooks/useDashboard";

function Skeleton({ className }: { className?: string }) {
  return <div className={`bg-white/[0.04] animate-pulse rounded-xl ${className ?? ""}`} />;
}

export default function DashboardPage() {
  const { data, isLoading, isError } = useDashboard();

  return (
    <>
      <AppTopbar title="Dashboard" />

      <main className="flex-1 p-6">
        {isError && (
          <div className="text-red-400/70 text-sm text-center py-12">
            Failed to load dashboard
          </div>
        )}

        {isLoading && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              <Skeleton className="h-64" />
              <Skeleton className="h-40" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-52" />
              <Skeleton className="h-32" />
              <Skeleton className="h-20" />
            </div>
          </div>
        )}

        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 max-w-6xl">
            {/* Left column — tasks & activity */}
            <div className="lg:col-span-2 space-y-4">
              <TodayBlock today={data.today} />
              <ActivityFeed feed={data.feed} />
            </div>

            {/* Right column — finance & habits */}
            <div className="space-y-4">
              <FinanceBlock
                finState={data.fin_state}
                financialSummary={data.financial_summary}
              />
              <UpcomingPayments payments={data.upcoming_payments} />
              <HabitHeatmap cells={data.habit_heatmap} />
            </div>
          </div>
        )}
      </main>
    </>
  );
}
