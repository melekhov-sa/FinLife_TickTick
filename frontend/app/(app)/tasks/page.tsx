"use client";

import { useState } from "react";
import { Plus, CheckCircle2, ClipboardList } from "lucide-react";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { TaskRow } from "@/components/tasks/TaskRow";
import { useTasks, useCompleteTask, useArchiveTask } from "@/hooks/useTasks";
import { CreateTaskModal } from "@/components/modals/CreateTaskModal";

const TABS = [
  { value: "ACTIVE",   label: "Активные" },
  { value: "DONE",     label: "Выполненные" },
  { value: "ARCHIVED", label: "Архив" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

export default function TasksPage() {
  const [status, setStatus] = useState<TabValue>("ACTIVE");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { data: tasks, isLoading, isError } = useTasks(status);
  const { mutate: complete } = useCompleteTask();
  const { mutate: archive } = useArchiveTask();

  return (
    <>
      {showCreateModal && <CreateTaskModal onClose={() => setShowCreateModal(false)} />}
      <AppTopbar title="Задачи" />
      <main className="flex-1 overflow-auto p-6 max-w-2xl">
        {/* Controls */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.06] rounded-xl p-1">
            {TABS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setStatus(value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  status === value
                    ? "bg-white/[0.09] text-white shadow-sm"
                    : "text-white/65 hover:text-white/65"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-xl px-4 py-2 transition-colors"
          >
            <Plus size={13} strokeWidth={2.5} />
            Новая задача
          </button>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-1.5">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-11 bg-white/[0.02] rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {/* Error */}
        {isError && (
          <p className="text-red-400/70 text-sm text-center py-12">
            Не удалось загрузить задачи
          </p>
        )}

        {/* Empty */}
        {!isLoading && tasks && tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
              {status === "DONE" ? (
                <CheckCircle2 size={22} className="text-emerald-400/40" />
              ) : (
                <ClipboardList size={22} className="text-white/50" />
              )}
            </div>
            <p className="text-sm font-medium text-white/60">
              {status === "ACTIVE" ? "Активных задач нет" : status === "DONE" ? "Выполненных задач нет" : "Архив пуст"}
            </p>
            {status === "ACTIVE" && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-4 text-xs font-medium text-indigo-400/70 hover:text-indigo-400 transition-colors"
              >
                Создать первую задачу →
              </button>
            )}
          </div>
        )}

        {/* Task list */}
        {tasks && tasks.length > 0 && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
            {tasks.map((task, i) => (
              <div key={task.task_id} className={i < tasks.length - 1 ? "border-b border-white/[0.04]" : ""}>
                <TaskRow
                  task={task}
                  onComplete={complete}
                  onArchive={archive}
                />
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
