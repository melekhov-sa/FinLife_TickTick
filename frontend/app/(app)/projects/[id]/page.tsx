"use client";

import { use, useRef, useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Settings } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { KanbanBoard } from "@/components/projects/KanbanBoard";
import { useProject } from "@/hooks/useProjects";
import { api } from "@/lib/api";
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

function ProjectSettingsPopover({ projectId, hideFromPlan }: { projectId: number; hideFromPlan: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { mutate } = useMutation({
    mutationFn: (value: boolean) =>
      api.patch(`/api/v2/projects/${projectId}`, { hide_from_plan: value }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-white/55 hover:text-white/70 hover:bg-white/[0.07] transition-colors"
        title="Настройки проекта"
      >
        <Settings size={13} />
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-50 w-64 bg-[#1a2233] border border-white/[0.10] rounded-xl shadow-xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--t-faint)" }}>
            Настройки проекта
          </p>
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <div>
              <p className="text-[13px] font-medium" style={{ color: "var(--t-primary)" }}>
                Скрыть из плана
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--t-faint)" }}>
                Задачи проекта не будут в плане и дашборде
              </p>
            </div>
            <div
              onClick={() => mutate(!hideFromPlan)}
              className={clsx(
                "w-9 h-5 rounded-full transition-colors cursor-pointer shrink-0",
                hideFromPlan ? "bg-indigo-500" : "bg-white/[0.12]"
              )}
            >
              <div className={clsx(
                "w-4 h-4 rounded-full bg-white shadow mt-0.5 transition-transform",
                hideFromPlan ? "translate-x-4" : "translate-x-0.5"
              )} />
            </div>
          </label>
        </div>
      )}
    </div>
  );
}


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

            <ProjectSettingsPopover projectId={project.id} hideFromPlan={project.hide_from_plan} />

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
