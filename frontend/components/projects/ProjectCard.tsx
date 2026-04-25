"use client";

import Link from "next/link";
import { clsx } from "clsx";
import type { ProjectSummary } from "@/types/api";
import { ProgressBar } from "@/components/primitives/ProgressBar";

const STATUS_COLORS: Record<string, string> = {
  active:   "bg-emerald-500/15 text-emerald-400",
  planned:  "bg-blue-500/15 text-blue-400",
  paused:   "bg-amber-500/15 text-amber-400",
  done:     "bg-white/10 text-white/68",
  archived: "bg-white/5 text-white/55",
};

const STATUS_LABELS: Record<string, string> = {
  active:   "Активный",
  planned:  "Планируемый",
  paused:   "На паузе",
  done:     "Завершён",
  archived: "Архив",
};

interface Props {
  project: ProjectSummary;
}

export function ProjectCard({ project }: Props) {
  const pct = project.progress;

  return (
    <Link
      href={`/projects/${project.id}`}
      className="block bg-white/[0.04] hover:bg-white/[0.06] border border-white/[0.07] hover:border-white/[0.12] rounded-2xl p-5 transition-all hover:-translate-y-px group"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-white/85 group-hover:text-white/95 transition-colors line-clamp-2"
          style={{ letterSpacing: "-0.01em" }}>
          {project.title}
        </h3>
        <span
          className={clsx(
            "text-[10px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0",
            STATUS_COLORS[project.status] ?? "bg-white/10 border-white/10 text-white/68"
          )}
        >
          {STATUS_LABELS[project.status] ?? project.status}
        </span>
      </div>

      {/* Description */}
      {project.description && (
        <p className="text-xs text-white/65 line-clamp-2 mb-4">{project.description}</p>
      )}

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[10px] font-medium text-white/60">
          <span>{project.done_tasks} / {project.total_tasks} задач</span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <ProgressBar
          value={pct}
          max={100}
          variant={pct === 100 ? "success" : "primary"}
          size="sm"
        />
      </div>

      {/* Due date */}
      {project.due_date && (
        <p className="text-[10px] text-white/55 mt-3 tabular-nums">Срок: {project.due_date}</p>
      )}
    </Link>
  );
}
