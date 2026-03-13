"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Target,
  BarChart3,
  Bell,
  Settings,
  LogOut,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/strategy", label: "Strategy", icon: Target },
  { href: "/efficiency", label: "Efficiency", icon: BarChart3 },
  { href: "/notifications", label: "Notifications", icon: Bell },
];

export function AppSidebar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <aside className="flex flex-col h-full w-[220px] bg-[#0d1117] border-r border-white/[0.06] select-none">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 mb-2">
        <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center">
          <span className="text-indigo-400 text-xs font-bold">FL</span>
        </div>
        <span className="text-white/80 font-semibold text-sm tracking-wide">FinLife</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
              isActive(href)
                ? "bg-white/[0.08] text-white"
                : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
            )}
          >
            <Icon
              size={16}
              className={clsx(
                "shrink-0",
                isActive(href) ? "text-indigo-400" : "text-current"
              )}
            />
            {label}
          </Link>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="px-3 pb-5 space-y-0.5 border-t border-white/[0.06] pt-3 mt-3">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-colors"
        >
          <Settings size={16} className="shrink-0" />
          Settings
        </Link>
        <a
          href="/logout"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-colors"
        >
          <LogOut size={16} className="shrink-0" />
          Sign out
        </a>
      </div>
    </aside>
  );
}
