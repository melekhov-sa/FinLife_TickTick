"use client";

import { type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * PageHeader
 *
 * Универсальный header страницы. Слоты — все опциональны кроме `title`.
 *
 * Анатомия (сверху вниз):
 *   row 1: [back] [eyebrow / title + counter / subtitle]                       [actions]
 *   row 2:  period                              (PeriodSwitcher)
 *   row 3:  tabs                                (Tabs)
 *   row 4:  filters                             (FilterChip[])
 *
 * Все строки независимы. Если слот не передан — строка не рисуется.
 *
 * Sticky-режим: header прилипает к topbar (top:0 внутри scroll-контейнера
 * страницы; AppTopbar сам остаётся выше, поскольку он sticky на уровне body).
 * Использует backdrop-filter + полупрозрачный фон, чтобы tabs/filters не
 * наезжали на контент при скролле.
 */

type Density = "compact" | "regular" | "spacious";

export interface PageHeaderProps {
  /** Кнопка «Назад». */
  back?: { label?: string; onClick: () => void } | null;
  /** Тонкая строка над title (хлебные крошки). */
  breadcrumbs?: ReactNode;
  /** Короткий ярлык над title (uppercase). */
  eyebrow?: ReactNode;
  /** Заголовок страницы. */
  title: ReactNode;
  /** Цифра/чип рядом с title — обычно <Counter/>. */
  counter?: ReactNode;
  /** Подзаголовок под title. */
  subtitle?: ReactNode;
  /** Кнопки действий справа. */
  actions?: ReactNode;
  /** Переключатель периода — обычно <PeriodSwitcher/>. */
  period?: ReactNode;
  /** Вкладки разделов — обычно <Tabs/>. */
  tabs?: ReactNode;
  /** Чипы-фильтры — обычно стек <FilterChip/> + поиск. */
  filters?: ReactNode;
  /** Плотность. По умолчанию regular. */
  density?: Density;
  /** Sticky-режим под AppTopbar. */
  sticky?: boolean;
  /** Нижний 1px бордер. */
  divider?: boolean;
  className?: string;
}

const DENSITY_TOKENS: Record<Density, { padY: number; titleFz: number; rowGap: number }> = {
  compact:  { padY: 12, titleFz: 18, rowGap: 10 },
  regular:  { padY: 18, titleFz: 22, rowGap: 14 },
  spacious: { padY: 24, titleFz: 26, rowGap: 18 },
};

export function PageHeader({
  back,
  breadcrumbs,
  eyebrow,
  title,
  counter,
  subtitle,
  actions,
  period,
  tabs,
  filters,
  density = "regular",
  sticky = false,
  divider = true,
  className,
}: PageHeaderProps) {
  const tok = DENSITY_TOKENS[density];

  return (
    <header
      data-sticky={sticky || undefined}
      className={cn(
        "page-header",
        sticky && "sticky top-0 z-10 sb-blur",
        className,
      )}
      style={{
        background: sticky
          ? "color-mix(in oklab, var(--app-bg) 92%, transparent)"
          : "transparent",
        borderBottom: divider ? "1px solid var(--app-border)" : "none",
        padding: `${tok.padY}px clamp(16px, 3vw, 24px)`,
      }}
    >
      {/* breadcrumbs */}
      {breadcrumbs && (
        <div
          className="mb-2 flex items-center gap-1.5"
          style={{ fontSize: 12, color: "var(--t-muted)" }}
        >
          {breadcrumbs}
        </div>
      )}

      {/* row 1: back + title + actions */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex items-start gap-2.5">
          {back && (
            <button
              type="button"
              onClick={back.onClick}
              aria-label={back.label || "Назад"}
              className="inline-flex items-center justify-center shrink-0 transition-colors hover:bg-[var(--app-accent-weak)]"
              style={{
                width: 32,
                height: 32,
                marginTop: 2,
                borderRadius: 8,
                color: "var(--t-secondary)",
                border: "1px solid var(--app-border)",
                background: "var(--app-card-bg)",
              }}
            >
              <ChevronLeft size={16} strokeWidth={1.75} />
            </button>
          )}
          <div className="min-w-0">
            {eyebrow && (
              <div
                className="mb-1 uppercase font-semibold"
                style={{
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  color: "var(--t-muted)",
                }}
              >
                {eyebrow}
              </div>
            )}
            <h1
              className="font-display flex items-center min-w-0 gap-2.5"
              style={{
                fontSize: tok.titleFz,
                lineHeight: 1.2,
                fontWeight: 700,
                color: "var(--t-primary)",
                letterSpacing: "-0.015em",
              }}
            >
              <span className="truncate">{title}</span>
              {counter != null && counter}
            </h1>
            {subtitle && (
              <div
                className="mt-1"
                style={{
                  fontSize: 13.5,
                  color: "var(--t-muted)",
                  lineHeight: 1.4,
                }}
              >
                {subtitle}
              </div>
            )}
          </div>
        </div>
        {actions != null && (
          <div className="shrink-0 flex items-center gap-2">{actions}</div>
        )}
      </div>

      {/* row 2: period */}
      {period && <div className="mt-3 flex items-center flex-wrap gap-3">{period}</div>}

      {/* row 3: tabs */}
      {tabs && <div style={{ marginTop: tok.rowGap }}>{tabs}</div>}

      {/* row 4: filters */}
      {filters && (
        <div
          className="ph-scroll-x flex items-center gap-2"
          style={{ marginTop: tabs ? 12 : tok.rowGap, paddingBottom: 2 }}
        >
          {filters}
        </div>
      )}
    </header>
  );
}

export default PageHeader;
