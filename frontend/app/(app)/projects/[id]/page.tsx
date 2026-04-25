"use client";

import { use, useRef, useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Settings, Plus, X, Check } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { KanbanBoard } from "@/components/projects/KanbanBoard";
import { ConfirmDeleteModal } from "@/components/modals/ConfirmDeleteModal";
import { useProject } from "@/hooks/useProjects";
import { api } from "@/lib/api";
import { clsx } from "clsx";
import type { ProjectTag } from "@/types/api";
import { Skeleton } from "@/components/primitives/Skeleton";

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

const TAG_COLORS = ["gray", "blue", "green", "orange", "purple"] as const;
const TAG_COLOR_DOTS: Record<string, string> = {
  gray:   "bg-white/40",
  blue:   "bg-blue-400",
  green:  "bg-emerald-400",
  orange: "bg-orange-400",
  purple: "bg-purple-400",
};

function ProjectSettingsPopover({
  projectId, hideFromPlan, tags,
}: {
  projectId: number;
  hideFromPlan: boolean;
  tags: ProjectTag[];
}) {
  const [open, setOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState<string>("gray");
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("gray");
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["project", projectId] });
    qc.invalidateQueries({ queryKey: ["projects"] });
  };

  const { mutate: updateSettings } = useMutation({
    mutationFn: (value: boolean) =>
      api.patch(`/api/v2/projects/${projectId}`, { hide_from_plan: value }),
    onSuccess: invalidate,
  });

  const { mutate: createTag } = useMutation({
    mutationFn: ({ name, color }: { name: string; color: string }) =>
      api.post(`/api/v2/projects/${projectId}/tags`, { name, color }),
    onSuccess: () => { setNewTagName(""); invalidate(); },
  });

  const { mutate: updateTag } = useMutation({
    mutationFn: ({ id, name, color }: { id: number; name: string; color: string }) =>
      api.patch(`/api/v2/projects/${projectId}/tags/${id}`, { name, color }),
    onSuccess: () => { setEditingTagId(null); invalidate(); },
  });

  const { mutateAsync: deleteTag } = useMutation({
    mutationFn: (id: number) =>
      api.delete(`/api/v2/projects/${projectId}/tags/${id}`),
    onSuccess: invalidate,
  });

  const [deleteTagTarget, setDeleteTagTarget] = useState<ProjectTag | null>(null);

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
        <div className="absolute right-0 top-9 z-50 w-72 bg-[#1a2233] border border-white/[0.10] rounded-xl shadow-xl p-4 space-y-4">
          {/* hide_from_plan toggle */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--t-faint)" }}>
              Настройки
            </p>
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <p className="text-[13px] font-medium" style={{ color: "var(--t-primary)" }}>Скрыть из плана</p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--t-faint)" }}>Задачи не видны в плане и дашборде</p>
              </div>
              <div
                onClick={() => updateSettings(!hideFromPlan)}
                className={clsx("w-9 h-5 rounded-full transition-colors cursor-pointer shrink-0", hideFromPlan ? "bg-indigo-500" : "bg-white/[0.12]")}
              >
                <div className={clsx("w-4 h-4 rounded-full bg-white shadow mt-0.5 transition-transform", hideFromPlan ? "translate-x-4" : "translate-x-0.5")} />
              </div>
            </label>
          </div>

          {/* Tags */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--t-faint)" }}>
              Теги проекта
            </p>

            <div className="space-y-1.5 mb-2">
              {tags.map((tag) => (
                editingTagId === tag.id ? (
                  <div key={tag.id} className="flex items-center gap-1.5">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 text-[12px] bg-white/[0.06] border border-indigo-500/40 rounded-lg px-2 py-1 outline-none"
                      style={{ color: "var(--t-primary)" }}
                      autoFocus
                    />
                    <div className="flex gap-0.5">
                      {TAG_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => setEditColor(c)}
                          className={clsx("w-3.5 h-3.5 rounded-full transition-all", TAG_COLOR_DOTS[c], editColor === c ? "ring-2 ring-white/50 scale-110" : "opacity-60")}
                        />
                      ))}
                    </div>
                    <button onClick={() => updateTag({ id: tag.id, name: editName, color: editColor })} className="text-indigo-400 hover:text-indigo-300">
                      <Check size={12} />
                    </button>
                    <button onClick={() => setEditingTagId(null)} className="text-white/40 hover:text-white/60">
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <div key={tag.id} className="flex items-center gap-2 group/tag">
                    <span className={clsx("w-2 h-2 rounded-full shrink-0", TAG_COLOR_DOTS[tag.color ?? "gray"])} />
                    <span className="text-[12px] flex-1" style={{ color: "var(--t-secondary)" }}>{tag.name}</span>
                    <button
                      onClick={() => { setEditingTagId(tag.id); setEditName(tag.name); setEditColor(tag.color ?? "gray"); }}
                      className="opacity-0 group-hover/tag:opacity-100 text-white/40 hover:text-white/70 transition-all text-[10px] px-1"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => setDeleteTagTarget(tag)}
                      className="opacity-0 group-hover/tag:opacity-100 text-white/30 hover:text-red-400 transition-all"
                    >
                      <X size={10} />
                    </button>
                  </div>
                )
              ))}
            </div>

            {/* Add new tag */}
            <div className="flex items-center gap-1.5 pt-2 border-t border-white/[0.06]">
              <input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && newTagName.trim()) createTag({ name: newTagName.trim(), color: newTagColor }); }}
                placeholder="Новый тег..."
                className="flex-1 text-[12px] bg-white/[0.05] border border-white/[0.08] rounded-lg px-2 py-1 outline-none focus:border-indigo-500/40 placeholder-white/25"
                style={{ color: "var(--t-primary)" }}
              />
              <div className="flex gap-0.5">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewTagColor(c)}
                    className={clsx("w-3.5 h-3.5 rounded-full transition-all", TAG_COLOR_DOTS[c], newTagColor === c ? "ring-2 ring-white/50 scale-110" : "opacity-60")}
                  />
                ))}
              </div>
              <button
                onClick={() => { if (newTagName.trim()) createTag({ name: newTagName.trim(), color: newTagColor }); }}
                disabled={!newTagName.trim()}
                className="w-6 h-6 flex items-center justify-center rounded-md bg-indigo-600/80 hover:bg-indigo-600 text-white disabled:opacity-40 transition-colors"
              >
                <Plus size={10} />
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTagTarget && (
        <ConfirmDeleteModal
          entityName="тег"
          title={deleteTagTarget.name}
          onConfirm={async () => {
            await deleteTag(deleteTagTarget.id);
          }}
          onClose={() => setDeleteTagTarget(null)}
        />
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
              <Skeleton key={i} variant="rect" className="w-72 shrink-0 h-96 rounded-2xl" />
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

            <ProjectSettingsPopover projectId={project.id} hideFromPlan={project.hide_from_plan} tags={project.tags} />

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
