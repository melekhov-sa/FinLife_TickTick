"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { KanbanBoard } from "@/components/projects/KanbanBoard";
import { useProject } from "@/hooks/useProjects";
import { clsx } from "clsx";

const STATUS_COLORS: Record<string, string> = {
  active:   "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20",
  planned:  "bg-blue-500/15 text-blue-400 border border-blue-500/20",
  paused:   "bg-amber-500/15 text-amber-400 border border-amber-500/20",
  done:     "bg-white/[0.07] text-white/72 border border-white/[0.08]",
  archived: "bg-white/[0.04] text-white/55 border border-white/[0.05]",
};

const STATUS_LABELS: Record<string, string> = {
  active:   "Активный",
  planned:  "Планируемый",
  paused:   "На паузе",
  done:     "Завершён",
  archived: "Архив",
};

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const projectId = Number(id);
  const { data: project, isLoading, isError } = useProject(projectId);

  if (isLoading) {
    return (
      <>
        <AppTopbar />
        <main className="flex-1 p-6">
          <div className="flex gap-4 overflow-x-auto">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="w-72 shrink-0 h-96 bg-white/[0.02] rounded-2xl animate-pulse" />
            ))}
          </div>
        </main>
      </>
    );
  }

  if (isError || !project) {
    return (
      <>
        <AppTopbar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-red-400/70 text-sm">Проект не найден</p>
        </main>
      </>
    );
  }

  return (
    <>
      <AppTopbar />
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Project header */}
        <div className="px-6 pt-5 pb-4 border-b border-white/[0.05] flex items-center gap-4 shrink-0">
          <Link
            href="/projects"
            className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-white/68 hover:text-white/70 hover:bg-white/[0.07] transition-colors shrink-0"
          >
            <ArrowLeft size={14} />
          </Link>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h1
                className="text-base font-semibold text-white/90 truncate"
                style={{ letterSpacing: "-0.025em" }}
              >
                {project.title}
              </h1>
              <span
                className={clsx(
                  "text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0",
                  STATUS_COLORS[project.status] ?? "bg-white/[0.07] text-white/68 border border-white/[0.08]"
                )}
              >
                {STATUS_LABELS[project.status] ?? project.status}
              </span>
            </div>
            {project.description && (
              <p className="text-xs text-white/65 mt-0.5 truncate">{project.description}</p>
            )}
          </div>

          {/* Progress */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right">
              <p className="text-xs font-medium text-white/68">
                <span className="text-white/75 font-semibold tabular-nums">{project.done_tasks}</span>
                <span className="text-white/55 mx-1">/</span>
                <span className="tabular-nums">{project.total_tasks}</span>
                <span className="ml-1">выполнено</span>
              </p>
              <div className="h-1 w-28 bg-white/[0.06] rounded-full mt-1.5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full transition-all"
                  style={{ width: `${project.progress}%` }}
                />
              </div>
            </div>

            {/* Open in legacy SSR */}
            <a
              href={`/legacy/projects/${project.id}`}
              target="_blank"
              rel="noreferrer"
              className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-white/55 hover:text-white/55 hover:bg-white/[0.07] transition-colors"
              title="Открыть полное представление"
            >
              <ExternalLink size={13} />
            </a>
          </div>
        </div>

        {/* Kanban board */}
        <div className="flex-1 overflow-auto p-6">
          <KanbanBoard project={project} />
        </div>
      </main>
    </>
  );
}
