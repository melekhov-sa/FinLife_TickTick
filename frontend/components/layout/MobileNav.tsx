"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ClipboardList, Plus, Wallet, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./AppSidebar";
import { useKeyboardVisible } from "@/lib/useKeyboardVisible";

interface MobileNavProps {
  /** Открыть создание задачи (короткий тап по FAB / default) */
  onCreateTask?: () => void;
  /** Открыть создание операции (второй вариант из меню выбора) */
  onCreateOperation?: () => void;
}

export function MobileNav({
  onCreateTask,
  onCreateOperation,
}: MobileNavProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const keyboardOpen = useKeyboardVisible();
  const [dbg, setDbg] = useState({ ih: 0, vh: 0, vot: 0, navTop: 0, navBot: 0, sab: 0 });
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const upd = () => {
      const vv = window.visualViewport;
      const r = navRef.current?.getBoundingClientRect();
      const sab = getComputedStyle(document.documentElement)
        .getPropertyValue("--sab-probe") || "0";
      setDbg({
        ih: Math.round(window.innerHeight),
        vh: Math.round(vv?.height ?? 0),
        vot: Math.round(vv?.offsetTop ?? 0),
        navTop: Math.round(r?.top ?? 0),
        navBot: Math.round(r?.bottom ?? 0),
        sab: parseInt(sab) || 0,
      });
    };
    upd();
    const id = setInterval(upd, 300);
    window.visualViewport?.addEventListener("resize", upd);
    window.visualViewport?.addEventListener("scroll", upd);
    window.addEventListener("scroll", upd, true);
    return () => {
      clearInterval(id);
      window.visualViewport?.removeEventListener("resize", upd);
      window.visualViewport?.removeEventListener("scroll", upd);
      window.removeEventListener("scroll", upd, true);
    };
  }, []);

  const isActive = (href: string) => {
    if (href === "/events") return !!(pathname?.startsWith("/events") || pathname?.startsWith("/event-templates"));
    if (href === "/money") return !!(pathname?.startsWith("/money") || pathname?.startsWith("/wallets") || pathname?.startsWith("/categories") || pathname?.startsWith("/goals"));
    return pathname === href || pathname?.startsWith(href + "/");
  };

  const handleCreate = () => {
    // Если переданы оба — показываем меню выбора.
    // Если один — сразу вызываем его.
    if (onCreateTask && onCreateOperation) {
      setCreateMenuOpen((v) => !v);
    } else if (onCreateTask) {
      onCreateTask();
    } else if (onCreateOperation) {
      onCreateOperation();
    }
  };

  return (
    <>
      <div style={{
        position: "fixed", top: 60, left: 8, zIndex: 9999,
        background: "rgba(0,0,0,.8)", color: "#0f0", font: "11px monospace",
        padding: "6px 8px", borderRadius: 6, lineHeight: 1.5, pointerEvents: "none",
      }}>
        innerH: {dbg.ih}<br/>
        visualH: {dbg.vh}<br/>
        vp.offsetTop: {dbg.vot}<br/>
        nav.top: {dbg.navTop}<br/>
        nav.bottom: {dbg.navBot}<br/>
        safe-bottom: {dbg.sab}<br/>
        screen.h: {typeof screen !== "undefined" ? screen.height : 0}
      </div>
      {/* Нижняя плашка */}
      <nav
        ref={navRef}
        aria-label="Основная навигация"
        className="md:hidden shrink-0 flex items-stretch justify-between px-2"
        style={{
          background: "var(--app-sidebar-bg)",
          boxShadow: "var(--shadow-mobile)",
          borderTop: "1px solid var(--app-border)",
          minHeight: "calc(58px + env(safe-area-inset-bottom, 0px))",
          paddingTop: "6px",
          paddingBottom: "calc(6px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <BottomItem
          href="/dashboard"
          label="Главная"
          icon={
            <Home size={20} strokeWidth={isActive("/dashboard") ? 2.1 : 1.8} />
          }
          active={isActive("/dashboard")}
        />
        <BottomItem
          href="/plan"
          label="План"
          icon={
            <ClipboardList
              size={20}
              strokeWidth={isActive("/plan") ? 2.1 : 1.8}
            />
          }
          active={isActive("/plan")}
        />

        {/* FAB */}
        <button
          type="button"
          onClick={handleCreate}
          aria-label="Создать"
          className="flex flex-col items-center justify-center rounded-full select-none transition-transform active:scale-95"
          style={{
            width: 44,
            height: 44,
            marginTop: -14,
            background: "linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)",
            boxShadow: "var(--shadow-fab)",
            color: "#FFF",
          }}
        >
          <Plus size={20} strokeWidth={2.3} />
        </button>

        <BottomItem
          href="/money"
          label="Деньги"
          icon={
            <Wallet size={20} strokeWidth={isActive("/money") ? 2.1 : 1.8} />
          }
          active={isActive("/money")}
        />
        <BottomButton
          label="Ещё"
          icon={<Menu size={20} strokeWidth={1.8} />}
          onClick={() => setDrawerOpen(true)}
        />
      </nav>

      {/* Меню выбора типа создания */}
      {createMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-40"
          onClick={() => setCreateMenuOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute left-3 right-3 rounded-2xl p-2"
            style={{
              bottom:
                "calc(max(12px, env(safe-area-inset-bottom, 12px)) + 84px)",
              background: "var(--app-card-bg)",
              border: "1px solid var(--app-border)",
              boxShadow:
                "0 1px 2px rgba(16,24,40,.1), 0 16px 40px -8px rgba(16,24,40,.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="w-full text-left px-3 py-3 rounded-xl nav-hover text-[14px] font-medium"
              style={{ color: "var(--t-primary)" }}
              onClick={() => {
                setCreateMenuOpen(false);
                onCreateTask?.();
              }}
            >
              Новая задача
            </button>
            <button
              type="button"
              className="w-full text-left px-3 py-3 rounded-xl nav-hover text-[14px] font-medium"
              style={{ color: "var(--t-primary)" }}
              onClick={() => {
                setCreateMenuOpen(false);
                onCreateOperation?.();
              }}
            >
              Новая операция
            </button>
          </div>
        </div>
      )}

      {/* Drawer */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-40"
          onClick={() => setDrawerOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <aside
            className="absolute left-0 top-0 bottom-0 w-[260px] flex flex-col"
            style={{
              background: "var(--app-sidebar-bg)",
              borderRight: "1px solid var(--app-sidebar-border)",
              paddingTop: "env(safe-area-inset-top, 0px)",
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center h-[60px] px-4 shrink-0">
              <span
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{
                  background:
                    "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)",
                }}
              >
                <span className="text-[#fff] text-[11px] font-bold tracking-tight">
                  FL
                </span>
              </span>
              <span
                className="ml-2.5 font-semibold text-[15px]"
                style={{ color: "var(--t-primary)", letterSpacing: "-0.015em" }}
              >
                FinLife
              </span>
              <button
                type="button"
                aria-label="Закрыть меню"
                onClick={() => setDrawerOpen(false)}
                className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center nav-hover"
                style={{ color: "var(--t-muted)" }}
              >
                <X size={18} strokeWidth={1.9} />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5 scroll-slim">
              {NAV_ITEMS.map(({ id, label, href, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={id}
                    href={href}
                    onClick={() => setDrawerOpen(false)}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-lg text-[14px] font-medium transition-colors",
                      active ? "nav-active" : "nav-hover"
                    )}
                    style={{
                      height: 40,
                      padding: "0 12px",
                      color: active
                        ? "var(--app-accent-ink)"
                        : "var(--t-secondary)",
                    }}
                  >
                    <Icon size={18} strokeWidth={active ? 2.1 : 1.8} />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}

function BottomItem({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex-1 flex flex-col items-center justify-center gap-0.5 select-none"
      style={{ color: active ? "var(--app-accent)" : "var(--t-muted)" }}
    >
      {icon}
      <span className="text-[10.5px] font-medium">{label}</span>
    </Link>
  );
}

function BottomButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 flex flex-col items-center justify-center gap-0.5 select-none"
      style={{ color: "var(--t-muted)" }}
    >
      {icon}
      <span className="text-[10.5px] font-medium">{label}</span>
    </button>
  );
}
