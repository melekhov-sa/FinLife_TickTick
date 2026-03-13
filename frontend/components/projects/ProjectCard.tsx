"use client";

import Link from "next/link";
import { clsx } from "clsx";
import type { ProjectSummary } from "@/types/api";

const STATUS_COLORS: Record<string, string> = {
  active:   "bg-emerald-500/15 text-emerald-400",
  planned:  "bg-blue-500/15 text-blue-400",
  paused:   "bg-amber-500/15 text-amber-400",
  done:     "bg-white/10 text-white/40",
  archived: "bg-white/5 text-white/25",
};

interface Props {
  project: ProjectSummary;
}

export function ProjectCard({ project }: Props) {
  const pct = project.progress;

  return (
    <Link
      href={`/projects/${project.id}`}
      className="block bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.06] rounded-xl p-5 transition-colors group"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-sm font-medium text-white/80 group-hover:text-white transition-colors line-clamp-2">
          {project.title}
        </h3>
        <span
          className={clsx(
            "text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 capitalize",
            STATUS_COLORS[project.status] ?? "bg-white/10 text-white/40"
          )}
        >
          {project.status}
        </span>
      </div>

      {/* Description */}
      {project.description && (
        <p className="text-xs text-white/30 line-clamp-2 mb-4">{project.description}</p>
      )}

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[10px] text-white/25">
          <span>{project.done_tasks} / {project.total_tasks} tasks</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className={clsx(
              "h-full rounded-full transition-all",
              pct === 100 ? "bg-emerald-500" : "bg-indigo-500"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Due date */}
      {project.due_date && (
        <p className="text-[10px] text-white/20 mt-3">Due {project.due_date}</p>
      )}
    </Link>
  );
}
