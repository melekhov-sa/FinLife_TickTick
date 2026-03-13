"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { KanbanBoard } from "@/components/projects/KanbanBoard";
import { useProject } from "@/hooks/useProjects";
import { clsx } from "clsx";

const STATUS_COLORS: Record<string, string> = {
  active:   "bg-emerald-500/15 text-emerald-400",
  planned:  "bg-blue-500/15 text-blue-400",
  paused:   "bg-amber-500/15 text-amber-400",
  done:     "bg-white/10 text-white/40",
  archived: "bg-white/5 text-white/25",
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
              <div key={i} className="w-72 shrink-0 h-96 bg-white/[0.02] rounded-xl animate-pulse" />
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
          <p className="text-red-400/70 text-sm">Project not found</p>
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
            className="text-white/30 hover:text-white/60 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-base font-semibold text-white/85 truncate">{project.title}</h1>
              <span
                className={clsx(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded capitalize shrink-0",
                  STATUS_COLORS[project.status] ?? "bg-white/10 text-white/40"
                )}
              >
                {project.status}
              </span>
            </div>
            {project.description && (
              <p className="text-xs text-white/30 mt-0.5 truncate">{project.description}</p>
            )}
          </div>

          {/* Progress */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="text-xs text-white/30">
                {project.done_tasks}/{project.total_tasks} done
              </p>
              <div className="h-1 w-24 bg-white/[0.06] rounded-full mt-1 overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full"
                  style={{ width: `${project.progress}%` }}
                />
              </div>
            </div>

            {/* Open in legacy SSR */}
            <a
              href={`/legacy/projects/${project.id}`}
              target="_blank"
              rel="noreferrer"
              className="text-white/20 hover:text-white/50 transition-colors"
              title="Open in full view"
            >
              <ExternalLink size={14} />
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
