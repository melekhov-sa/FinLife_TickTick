"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { useTheme } from "next-themes";

interface Tab {
  href: string;
  label: string;
}

export function PageTabs({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  function isActive(href: string) {
    if (href === pathname) return true;
    // Match sub-paths for tabs that are prefixes
    if (href !== "/" && pathname.startsWith(href + "/")) return true;
    return false;
  }

  return (
    <div
      className="flex items-center gap-0.5 px-6 border-b shrink-0"
      style={{ borderColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)" }}
    >
      {tabs.map((tab) => {
        const active = isActive(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={clsx(
              "relative px-3 py-2.5 text-[13px] font-medium transition-colors whitespace-nowrap",
              active
                ? isDark ? "text-white" : "text-indigo-700"
                : isDark ? "text-white/45 hover:text-white/70" : "text-black/40 hover:text-black/65"
            )}
          >
            {tab.label}
            {active && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-indigo-500" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
