"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, FolderOpen } from "lucide-react";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { useProjects } from "@/hooks/useProjects";

const STATUSES = [
  { value: undefined, label: "Активные" },
  { value: "planned", label: "Планируемые" },
  { value: "paused",  label: "На паузе" },
  { value: "done",    label: "Завершённые" },
  { value: "archived",label: "Архив" },
];

export default function ProjectsPage() {
  const [status, setStatus] = useState<string | undefined>(undefined);
  const { data: projects, isLoading, isError } = useProjects(status);

  return (
    <>
      <AppTopbar title="Проекты" />
      <main className="flex-1 overflow-auto p-6 max-w-[1400px]">
        {/* Controls */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.06] rounded-xl p-1">
            {STATUSES.map(({ value, label }) => (
              <button
                key={label}
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

          <Link
            href="/projects/new"
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-xl px-4 py-2 transition-colors"
          >
            <Plus size={13} strokeWidth={2.5} />
            Новый проект
          </Link>
        </div>

        {/* Error */}
        {isError && (
          <p className="text-red-400/70 text-sm text-center py-12">
            Не удалось загрузить проекты
          </p>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-44 bg-white/[0.03] rounded-2xl animate-pulse" />
            ))}
          </div>
        )}

        {/* Projects grid */}
        {projects && projects.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {projects && projects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-28 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-5">
              <FolderOpen size={24} className="text-white/50" />
            </div>
            <p className="text-sm font-medium text-white/65">Проектов пока нет</p>
            <p className="text-xs text-white/55 mt-1 mb-5">Создайте первый проект, чтобы начать работу</p>
            <Link
              href="/projects/new"
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-xl px-4 py-2 transition-colors"
            >
              Создать проект →
            </Link>
          </div>
        )}
      </main>
    </>
  );
}
