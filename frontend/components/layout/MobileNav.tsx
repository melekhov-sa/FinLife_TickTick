"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, ClipboardList, Plus, Wallet, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./AppSidebar";
import { useKeyboardVisible } from "@/lib/useKeyboardVisible";
import { hapticTick } from "@/lib/native";
import { QuickExpenseSheet } from "@/components/modals/QuickExpenseSheet";
import { SelfCheckModal } from "@/components/modals/SelfCheckModal";

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
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [quickExpenseOpen, setQuickExpenseOpen] = useState(false);
  const [selfCheckOpen, setSelfCheckOpen] = useState(false);
  const keyboardOpen = useKeyboardVisible();

  // Свайп от левой кромки экрана открывает меню «Ещё» (как в TickTick)
  const drawerOpenRef = useRef(drawerOpen);
  const drawerTouchRef = useRef<{ x: number; y: number } | null>(null);
  const [dragX, setDragX] = useState<number | null>(null); // интерактивная протяжка drawer
  drawerOpenRef.current = drawerOpen;
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let tracking = false;
    let mode: "drawer" | "back" = "drawer";
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      // только от кромки, только когда меню закрыто и нет открытых шитов
      if (t.clientX > 24 || drawerOpenRef.current) return;
      if (document.querySelector(".modal-overlay")) return;
      // вложенная страница (есть кнопка «Назад») → жест ведёт назад
      mode = document.querySelector("[data-page-back]") ? "back" : "drawer";
      tracking = true;
      startX = t.clientX;
      startY = t.clientY;
    };
    let engaged = false;
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      if (!engaged) {
        if (dy > 44) { tracking = false; return; } // вертикальный скролл
        if (dx > 14 && dx > dy * 1.2) {
          engaged = true;
          void hapticTick();
        } else {
          return;
        }
      }
      if (mode === "drawer") {
        // меню следует за пальцем
        setDragX(Math.max(0, Math.min(dx, 260)));
      } else {
        // контент уезжает вправо за пальцем (свайп-назад)
        const el = document.getElementById("app-scroll");
        if (el) {
          el.style.transition = "none";
          el.style.transform = `translateX(${Math.max(0, dx) * 0.35}px)`;
          el.style.opacity = String(1 - Math.min(dx / 600, 0.25));
        }
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (engaged) {
        if (mode === "drawer") {
          setDragX((cur) => {
            if ((cur ?? 0) > 110) {
              setDrawerOpen(true);
              void hapticTick();
            }
            return null;
          });
        } else {
          const t = e.changedTouches[0];
          const dx = t ? t.clientX - startX : 0;
          const el = document.getElementById("app-scroll");
          if (el) {
            el.style.transition = "transform 200ms cubic-bezier(0.22,1,0.36,1), opacity 200ms ease";
            el.style.transform = "";
            el.style.opacity = "";
          }
          if (dx > 100) {
            void hapticTick();
            // нажать существующую кнопку «Назад» — она знает свой маршрут
            const backBtn = document.querySelector<HTMLButtonElement>("[data-page-back]");
            backBtn?.click();
          }
        }
      }
      tracking = false;
      engaged = false;
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
    };
  }, []);

  const isActive = (href: string) => {
    if (href === "/events") return !!(pathname?.startsWith("/events") || pathname?.startsWith("/event-templates"));
    if (href === "/money") return !!(pathname?.startsWith("/money") || pathname?.startsWith("/wallets") || pathname?.startsWith("/categories") || pathname?.startsWith("/goals"));
    return pathname === href || pathname?.startsWith(href + "/");
  };

  const handleCreate = () => {
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
      {/* Нижняя плашка */}
      <nav
        aria-label="Основная навигация"
        className="md:hidden shrink-0 flex items-stretch justify-between px-2 transition-transform duration-200 rounded-2xl border"
        style={{
          // Плавающий островок над home-индикатором (минимум 14px подъёма,
          // если safe-area не сообщается).
          background: "var(--app-sidebar-bg)",
          borderColor: "var(--app-border)",
          boxShadow:
            "0 10px 28px -10px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.08)",
          minHeight: "56px",
          margin:
            "6px 10px calc(8px + max(env(safe-area-inset-bottom, 0px), 14px))",
          paddingTop: "6px",
          paddingBottom: "6px",
          transform: keyboardOpen ? "translateY(200%)" : "translateY(0)",
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
          className="flex flex-col items-center justify-center rounded-full select-none transition-transform active:scale-95 fab-breathe motion-reduce:animate-none"
          style={{
            width: 44,
            height: 44,
            marginTop: -14,
            background: "var(--app-accent-gradient)",
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
              className="w-full text-left px-3 py-3 rounded-xl nav-hover text-[14px] font-semibold"
              style={{ color: "var(--t-primary)" }}
              onClick={() => {
                setCreateMenuOpen(false);
                setQuickExpenseOpen(true);
              }}
            >
              💸 Быстрый расход
            </button>
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
            <button
              type="button"
              className="w-full text-left px-3 py-3 rounded-xl nav-hover text-[14px] font-medium"
              style={{ color: "var(--t-primary)" }}
              onClick={() => {
                setCreateMenuOpen(false);
                setSelfCheckOpen(true);
              }}
            >
              ❓ Спросить себя
            </button>
            <button
              type="button"
              className="w-full text-left px-3 py-3 rounded-xl nav-hover text-[14px] font-medium"
              style={{ color: "var(--app-accent-ink)" }}
              onClick={() => {
                setCreateMenuOpen(false);
                router.push("/quick-add");
              }}
            >
              ⚡ ИИ-ввод текстом
            </button>
          </div>
        </div>
      )}

      {quickExpenseOpen && <QuickExpenseSheet onClose={() => setQuickExpenseOpen(false)} />}
      {selfCheckOpen && <SelfCheckModal onClose={() => setSelfCheckOpen(false)} />}

      {/* Drawer */}
      {(drawerOpen || dragX !== null) && (
        <div
          className={dragX === null ? "md:hidden fixed inset-0 z-40 animate-overlay-fade" : "md:hidden fixed inset-0 z-40"}
          onClick={() => setDrawerOpen(false)}
          style={dragX !== null ? { pointerEvents: "none" } : undefined}
        >
          <div
            className="absolute inset-0 bg-black/40"
            style={dragX !== null ? { opacity: Math.min((dragX ?? 0) / 260, 1) * 0.9 } : undefined}
          />
          <aside
            className={
              dragX === null
                ? "absolute left-0 top-0 bottom-0 w-[260px] flex flex-col animate-drawer-in"
                : "absolute left-0 top-0 bottom-0 w-[260px] flex flex-col"
            }
            onTouchStart={(e) => {
              const t = e.touches[0];
              if (t) drawerTouchRef.current = { x: t.clientX, y: t.clientY };
            }}
            onTouchMove={(e) => {
              const start = drawerTouchRef.current;
              const t = e.touches[0];
              if (!start || !t) return;
              const dx = t.clientX - start.x;
              const dy = Math.abs(t.clientY - start.y);
              if (dx < -48 && Math.abs(dx) > dy * 1.5) {
                drawerTouchRef.current = null;
                setDrawerOpen(false);
              }
            }}
            onTouchEnd={() => { drawerTouchRef.current = null; }}
            style={{
              background: "var(--app-sidebar-bg)",
              borderRight: "1px solid var(--app-sidebar-border)",
              paddingTop: "env(safe-area-inset-top, 0px)",
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
              // интерактивная протяжка: меню следует за пальцем
              ...(dragX !== null
                ? { transform: `translateX(${dragX - 260}px)`, willChange: "transform" as const }
                : {}),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center h-[60px] px-4 shrink-0">
              <span
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{
                  background: "var(--app-accent-gradient)",
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
      onClick={(e) => {
        // iOS-паттерн: тап по уже активному табу скроллит к началу
        if (active) {
          e.preventDefault();
          document.getElementById("app-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
          void hapticTick();
        }
      }}
      className="flex-1 flex flex-col items-center justify-center gap-0.5 select-none"
      style={{ color: active ? "var(--app-accent)" : "var(--t-muted)" }}
    >
      {icon}
      <span className="text-[11px] font-semibold leading-none" style={{ opacity: 1 }}>{label}</span>
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
      <span className="text-[11px] font-semibold leading-none" style={{ opacity: 1 }}>{label}</span>
    </button>
  );
}
