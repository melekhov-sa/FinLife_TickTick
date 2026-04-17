"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { TodayBlock } from "@/components/dashboard/TodayBlock";
import { FinanceBlock } from "@/components/dashboard/FinanceBlock";
import { UpcomingPayments } from "@/components/dashboard/UpcomingPayments";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { ProgressBlock } from "@/components/dashboard/ProgressBlock";
import { WeekEventsCard } from "@/components/dashboard/WeekEventsCard";
import { ExpiringSubsCard } from "@/components/dashboard/ExpiringSubsCard";
import { CreateTaskModal } from "@/components/modals/CreateTaskModal";
import { CreateOperationModal } from "@/components/modals/CreateOperationModal";
import { useDashboard } from "@/hooks/useDashboard";

function Skeleton({ className }: { className?: string }) {
  return <div className={`bg-white/[0.04] animate-pulse rounded-xl ${className ?? ""}`} />;
}

export default function DashboardPage() {
  const { data, isLoading, isError } = useDashboard();
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showOpModal, setShowOpModal] = useState(false);

  const todayLabel = new Date().toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const quickActions = (
    <div className="hidden md:flex items-center gap-2">
      <button
        onClick={() => setShowTaskModal(true)}
        className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-medium text-white/90 bg-white/10 hover:bg-white/20 transition-colors"
        aria-label="Создать задачу"
      >
        <Plus size={14} strokeWidth={2.2} />
        Задача
      </button>
      <button
        onClick={() => setShowOpModal(true)}
        className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-medium text-white/90 bg-white/10 hover:bg-white/20 transition-colors"
        aria-label="Создать операцию"
      >
        <Plus size={14} strokeWidth={2.2} />
        Операция
      </button>
    </div>
  );

  return (
    <>
      <AppTopbar
        title="Главная"
        subtitle={todayLabel}
        actions={quickActions}
      />

      <main className="flex-1 overflow-auto p-3 md:p-6">
        {isError && (
          <div className="text-red-400/70 text-sm text-center py-12">
            Не удалось загрузить дашборд
          </div>
        )}

        {isLoading && (
          <div className="space-y-3 md:grid md:grid-cols-[280px_1fr_290px] md:gap-4 md:space-y-0 max-w-[1400px]">
            <Skeleton className="h-32 md:h-40" />
            <Skeleton className="h-48 md:h-72" />
            <Skeleton className="hidden lg:block h-36" />
          </div>
        )}

        {data && (
          <div className="max-w-[1400px]">
            {/* Desktop: 3-column grid */}
            <div className="hidden md:grid md:grid-cols-[280px_1fr_290px] gap-4">
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
              <div className="hidden lg:block space-y-4">
                <UpcomingPayments payments={data.upcoming_payments} />
                <WeekEventsCard events={data.week_events} />
                <ExpiringSubsCard subs={data.expiring_subs} />
              </div>
            </div>

            {/* Mobile: reordered single column — action first */}
            <div className="md:hidden space-y-3">
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
              <ActivityFeed feed={data.feed} />
            </div>
          </div>
        )}
      </main>

      {showTaskModal && <CreateTaskModal onClose={() => setShowTaskModal(false)} />}
      {showOpModal && <CreateOperationModal onClose={() => setShowOpModal(false)} />}
    </>
  );
}
