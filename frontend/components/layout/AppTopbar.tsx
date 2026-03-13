"use client";

import { Bell } from "lucide-react";
import { useMe } from "@/hooks/useMe";

interface AppTopbarProps {
  title?: string;
}

export function AppTopbar({ title }: AppTopbarProps) {
  const { data: me } = useMe();

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-white/[0.06] shrink-0">
      {title && (
        <h1 className="text-white/80 text-sm font-medium">{title}</h1>
      )}
      <div className="flex items-center gap-3 ml-auto">
        <button className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors">
          <Bell size={15} />
        </button>
        <div className="w-7 h-7 rounded-full bg-indigo-500/20 flex items-center justify-center">
          <span className="text-indigo-400 text-xs font-medium">
            {me?.email?.[0]?.toUpperCase() ?? "?"}
          </span>
        </div>
      </div>
    </header>
  );
}
