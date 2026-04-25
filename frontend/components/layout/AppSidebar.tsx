"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  Wallet,
  PieChart,
  Heart,
  ListChecks,
  Sparkles,
  ChevronsLeft,
  ChevronsRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Дашборд",  href: "/dashboard", icon: LayoutDashboard },
  { id: "plan",      label: "План",     href: "/plan",      icon: ClipboardList  },
  { id: "money",     label: "Деньги",   href: "/money",     icon: Wallet         },
  { id: "budget",    label: "Бюджет",   href: "/budget",    icon: PieChart       },
  { id: "habits",    label: "Привычки", href: "/habits",    icon: Heart          },
  { id: "lists",     label: "Списки",   href: "/lists",     icon: ListChecks     },
  { id: "digest",    label: "Итоги",    href: "/digest",    icon: Sparkles       },
];

// Some sections group several routes under one sidebar entry.
function isActive(href: string, pathname: string | null): boolean {
  if (!pathname) return false;
  if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
  if (href === "/money") {
    return (
      pathname.startsWith("/money") ||
      pathname.startsWith("/wallets") ||
      pathname.startsWith("/subscriptions") ||
      pathname.startsWith("/categories")
    );
  }
  if (href === "/budget") {
    return pathname.startsWith("/budget") || pathname.startsWith("/planned-ops");
  }
  return pathname === href || pathname.startsWith(href + "/");
}

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className="sb-transition h-full flex flex-col border-r shrink-0 select-none"
      style={{
        width: collapsed ? 64 : 240,
        background: "var(--app-sidebar-bg)",
        borderColor: "var(--app-sidebar-border)",
      }}
    >
      {/* Логотип */}
      <div
        className={cn(
          "flex items-center h-[60px] shrink-0",
          collapsed ? "justify-center px-0" : "px-4"
        )}
      >
        <Link
          href="/dashboard"
          className="flex items-center shrink-0"
          aria-label="FinLife"
        >
          <span
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)",
              boxShadow:
                "0 1px 2px rgba(99,102,241,.3), 0 4px 12px -4px rgba(99,102,241,.4)",
            }}
          >
            <span className="text-white text-[11px] font-bold tracking-tight">
              FL
            </span>
          </span>
          {!collapsed && (
            <span
              className="ml-2.5 font-semibold text-[15px]"
              style={{ color: "var(--t-primary)", letterSpacing: "-0.015em" }}
            >
              FinLife
            </span>
          )}
        </Link>
      </div>

      {/* Навигация */}
      <nav
        className={cn(
          "flex-1 overflow-y-auto scroll-slim py-2 space-y-0.5",
          collapsed ? "px-2" : "px-3"
        )}
      >
        {NAV_ITEMS.map(({ id, label, href, icon: Icon }) => {
          const active = isActive(href, pathname);

          return (
            <Link
              key={id}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                "group w-full flex items-center gap-3 rounded-lg transition-colors text-[13.5px] font-medium",
                collapsed && "justify-center",
                active ? "nav-active" : "nav-hover"
              )}
              style={{
                height: 38,
                padding: collapsed ? 0 : "0 10px",
                color: active
                  ? "var(--app-accent-ink)"
                  : "var(--t-secondary)",
              }}
            >
              <Icon
                size={18}
                strokeWidth={active ? 2.1 : 1.75}
                className="shrink-0"
              />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Кнопка сворачивания */}
      <div
        className={cn(
          "shrink-0 py-3 border-t",
          collapsed ? "px-2" : "px-3"
        )}
        style={{ borderColor: "var(--app-sidebar-border)" }}
      >
        <button
          type="button"
          onClick={onToggle}
          title={collapsed ? "Развернуть" : "Свернуть"}
          className={cn(
            "w-full flex items-center gap-3 rounded-lg nav-hover text-[12.5px] font-medium transition-colors",
            collapsed && "justify-center"
          )}
          style={{
            height: 34,
            padding: collapsed ? 0 : "0 10px",
            color: "var(--t-muted)",
          }}
        >
          {collapsed ? (
            <ChevronsRight size={16} strokeWidth={1.9} />
          ) : (
            <ChevronsLeft size={16} strokeWidth={1.9} />
          )}
          {!collapsed && <span>Свернуть</span>}
        </button>
      </div>
    </aside>
  );
}
