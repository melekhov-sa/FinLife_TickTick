"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { HabitDetailPanel } from "@/components/habits/HabitDetailPanel";
import { CreateHabitModal } from "@/components/modals/CreateHabitModal";
import { AdminBlock } from "@/components/habits/AdminBlock";
import { useHabits } from "@/hooks/useHabits";
import type { HabitItem } from "@/types/api";

export default function HabitsAllPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedHabit, setSelectedHabit] = useState<HabitItem | null>(null);

  const { data, isPending, isError } = useHabits(true);
  const allHabits = data ?? [];
  const activeHabits = allHabits.filter((h) => !h.is_archived);
  const archivedHabits = allHabits.filter((h) => h.is_archived);

  return (
    <>
      {selectedHabit && (
        <HabitDetailPanel habit={selectedHabit} onClose={() => setSelectedHabit(null)} />
      )}
      {showCreateModal && <CreateHabitModal onClose={() => setShowCreateModal(false)} />}

      <AppTopbar title="Все привычки" subtitle={`${activeHabits.length} активных · ${archivedHabits.length} в архиве`} />

      <main className="flex-1 overflow-auto p-3 md:p-6 w-full">
        {/* Back link */}
        <Link
          href="/habits"
          className="inline-flex items-center gap-1.5 mb-4 hover:text-indigo-400 transition-colors"
          style={{ fontSize: "var(--fs-secondary)", color: "var(--t-muted)" }}
        >
          <ArrowLeft size={14} /> Сегодня
        </Link>

        {isPending && (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-white/[0.03] rounded-2xl animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <p className="text-red-400/70 text-center py-12" style={{ fontSize: "var(--fs-secondary)" }}>
            Не удалось загрузить привычки
          </p>
        )}

        {!isPending && !isError && (
          <AdminBlock
            habits={activeHabits}
            archivedHabits={archivedHabits}
            onOpen={(h) => setSelectedHabit(h)}
            onCreateNew={() => setShowCreateModal(true)}
          />
        )}
      </main>
    </>
  );
}
