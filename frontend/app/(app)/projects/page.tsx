"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, ExternalLink } from "lucide-react";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { useProjects } from "@/hooks/useProjects";

const STATUSES = [
  { value: undefined, label: "Active" },
  { value: "planned", label: "Planned" },
  { value: "paused", label: "Paused" },
  { value: "done", label: "Done" },
  { value: "archived", label: "Archived" },
];

export default function ProjectsPage() {
  const [status, setStatus] = useState<string | undefined>(undefined);
  const { data: projects, isLoading, isError } = useProjects(status);

  return (
    <>
      <AppTopbar title="Projects" />
      <main className="flex-1 p-6">
        {/* Controls */}
        <div className="flex items-center justify-between mb-6">
          {/* Status filter */}
          <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.06] rounded-lg p-1">
            {STATUSES.map(({ value, label }) => (
              <button
                key={label}
                onClick={() => setStatus(value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  status === value
                    ? "bg-white/[0.08] text-white"
                    : "text-white/35 hover:text-white/60"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* New project — opens SSR form */}
          <Link
            href="/legacy/projects/create"
            className="flex items-center gap-2 text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            <Plus size={14} />
            New project
          </Link>
        </div>

        {/* Error */}
        {isError && (
          <p className="text-red-400/70 text-sm text-center py-12">
            Failed to load projects
          </p>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-44 bg-white/[0.03] rounded-xl animate-pulse" />
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
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
              <ExternalLink size={20} className="text-white/20" />
            </div>
            <p className="text-sm text-white/30">No projects yet</p>
            <Link
              href="/legacy/projects/create"
              className="mt-4 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Create your first project →
            </Link>
          </div>
        )}
      </main>
    </>
  );
}
