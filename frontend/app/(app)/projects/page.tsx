"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, FolderOpen, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/primitives/PageHeader";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { useProjects } from "@/hooks/useProjects";
import { Button } from "@/components/primitives/Button";
import { Chip } from "@/components/primitives/Chip";
import { Skeleton } from "@/components/primitives/Skeleton";
import { EmptyState } from "@/components/primitives/EmptyState";

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
      <PageHeader title="Проекты" density="compact" />
      <main className="flex-1 overflow-auto p-6 max-w-[1400px]">
        {/* Controls */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-1">
            {STATUSES.map(({ value, label }) => (
              <Chip
                key={label}
                label={label}
                size="sm"
                selected={status === value}
                onClick={() => setStatus(value)}
              />
            ))}
          </div>

          <Link href="/projects/new" className="inline-flex">
            <Button variant="primary" size="sm" leftIcon={<Plus size={13} strokeWidth={2.5} />}>
              Новый проект
            </Button>
          </Link>
        </div>

        {isError && (
          <EmptyState
            icon={<AlertCircle size={24} />}
            title="Не удалось загрузить проекты"
            size="md"
          />
        )}

        {/* Loading */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} variant="rect" height={176} className="rounded-2xl" />
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

        {projects && projects.length === 0 && (
          <EmptyState
            icon={<FolderOpen size={24} />}
            title="Проектов пока нет"
            description="Создайте первый проект, чтобы начать работу"
            size="lg"
            action={
              <Link href="/projects/new" className="inline-flex">
                <Button variant="primary" size="sm">Создать проект →</Button>
              </Link>
            }
          />
        )}
      </main>
    </>
  );
}
