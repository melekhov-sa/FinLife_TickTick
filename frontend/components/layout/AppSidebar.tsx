"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  FolderKanban,
  Target,
  BarChart3,
  Bell,
  Wallet,
  BookOpen,
  Settings,
  LogOut,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const NAV_ITEMS = [
  { href: "/dashboard",      label: "Dashboard",     icon: LayoutDashboard },
  { href: "/projects",       label: "Projects",      icon: FolderKanban },
  { href: "/strategy",       label: "Strategy",      icon: Target },
  { href: "/efficiency",     label: "Efficiency",    icon: BarChart3 },
  { href: "/money",          label: "Money",         icon: Wallet },
  { href: "/notifications",  label: "Notifications", icon: Bell },
  { href: "/knowledge",      label: "Knowledge",     icon: BookOpen },
];

export function AppSidebar() {
  const pathname = usePathname();

  const { data: badge } = useQuery<{ unread_count: number }>({
    queryKey: ["notifications-badge"],
    queryFn: () => api.get("/api/v2/notifications/badge"),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <aside className="flex flex-col h-full w-[220px] bg-[#0d1117] border-r border-white/[0.06] select-none shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 mb-2">
        <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center">
          <span className="text-indigo-400 text-xs font-bold">FL</span>
        </div>
        <span className="text-white/80 font-semibold text-sm tracking-wide">FinLife</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          const isNotifications = href === "/notifications";
          const unread = isNotifications ? (badge?.unread_count ?? 0) : 0;

          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                active
                  ? "bg-white/[0.08] text-white"
                  : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
              )}
            >
              <Icon
                size={16}
                className={clsx("shrink-0", active ? "text-indigo-400" : "text-current")}
              />
              <span className="flex-1">{label}</span>
              {isNotifications && unread > 0 && (
                <span className="text-[10px] font-medium bg-indigo-500/25 text-indigo-300 rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 pb-5 space-y-0.5 border-t border-white/[0.06] pt-3 mt-3">
        <Link
          href="/legacy/profile"
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
