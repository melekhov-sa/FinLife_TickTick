"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/primitives/Input";
import { Select, type SelectOption } from "@/components/primitives/Select";
import { DateInput } from "@/components/primitives/DateInput";
import { Button } from "@/components/primitives/Button";

/**
 * FilterBar — универсальная панель фильтров для страниц-списков.
 *
 * Заменяет ручной паттерн на /money и /budget: текстовый поиск + N селектов
 * + от/до по датам + кнопка сброса.
 *
 * Поведение:
 *   • Desktop (≥ md): всё в одну линию — search занимает 1fr, селекты/даты
 *     фиксированной ширины, reset справа.
 *   • Mobile (< md): search сверху на всю ширину, фильтры скрыты под кнопкой
 *     «Фильтры (N)» (collapsible). При раскрытии — селекты столбиком, даты
 *     парой 50/50. Reset — снизу при наличии активных.
 *
 * Никаких новых CSS-переменных и keyframes.
 */

export interface FilterBarFilter {
  /** Стабильный id для key. */
  id: string;
  /** Подпись под селект на мобиле (раскрытый вид). На десктопе — placeholder. */
  label?: string;
  /** Текущее значение. Пустая строка = «не выбрано». */
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  /** Ширина селекта на десктопе. По умолчанию 180px. */
  desktopWidth?: number;
  searchable?: boolean;
}

export interface FilterBarDateRange {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  fromPlaceholder?: string;
  toPlaceholder?: string;
  /** Подпись группы на мобиле. */
  label?: string;
}

export interface FilterBarProps {
  // search
  search?: string;
  onSearch?: (v: string) => void;
  searchPlaceholder?: string;
  // filters
  filters?: FilterBarFilter[];
  // date range
  dateRange?: FilterBarDateRange;
  // reset
  onReset?: () => void;
  /** Число активных фильтров — показывается на кнопке «Фильтры (N)» и рядом с «Сбросить». */
  activeCount?: number;
  // styling
  className?: string;
}

export function FilterBar({
  search,
  onSearch,
  searchPlaceholder = "Поиск...",
  filters = [],
  dateRange,
  onReset,
  activeCount,
  className,
}: FilterBarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Compute active count fallback (если caller не передал).
  const fallbackActive =
    (search ? 1 : 0) +
    filters.filter((f) => f.value && f.value !== "").length +
    (dateRange?.from ? 1 : 0) +
    (dateRange?.to ? 1 : 0);
  const count = activeCount ?? fallbackActive;
  const hasFiltersToShow = filters.length > 0 || Boolean(dateRange);

  // Close mobile panel on Escape
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <div ref={wrapRef} className={cn("w-full", className)}>
      {/* ── DESKTOP (md+) ─────────────────────────────────────── */}
      <div className="hidden md:flex items-center gap-2">
        {onSearch && (
          <div className="flex-1 min-w-[200px]">
            <Input
              type="search"
              value={search ?? ""}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={searchPlaceholder}
              size="md"
            />
          </div>
        )}

        {filters.map((f) => (
          <div key={f.id} style={{ width: f.desktopWidth ?? 180 }} className="shrink-0">
            <Select
              size="md"
              value={f.value}
              onChange={f.onChange}
              options={f.options}
              placeholder={f.placeholder ?? f.label ?? "Не выбрано"}
              searchable={f.searchable}
            />
          </div>
        ))}

        {dateRange && (
          <div className="flex items-center gap-2 shrink-0">
            <div style={{ width: 160 }}>
              <DateInput
                size="md"
                value={dateRange.from}
                onChange={dateRange.onFromChange}
                placeholder={dateRange.fromPlaceholder ?? "От"}
              />
            </div>
            <span aria-hidden style={{ color: "var(--t-faint)", fontSize: 13 }}>—</span>
            <div style={{ width: 160 }}>
              <DateInput
                size="md"
                value={dateRange.to}
                onChange={dateRange.onToChange}
                placeholder={dateRange.toPlaceholder ?? "До"}
                min={dateRange.from || undefined}
              />
            </div>
          </div>
        )}

        {onReset && count > 0 && (
          <div className="ml-auto shrink-0">
            <Button
              variant="ghost"
              size="md"
              onClick={onReset}
              leftIcon={<X size={14} strokeWidth={1.9} />}
            >
              Сбросить
              <span
                className="ml-1.5 inline-flex items-center justify-center tabular-nums"
                style={{
                  minWidth: 18,
                  height: 18,
                  padding: "0 5px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 600,
                  background: "var(--c-neutral-bg)",
                  color: "var(--t-secondary)",
                }}
              >
                {count}
              </span>
            </Button>
          </div>
        )}
      </div>

      {/* ── MOBILE (< md) ─────────────────────────────────────── */}
      <div className="md:hidden flex flex-col gap-2">
        <div className="flex items-center gap-2">
          {onSearch && (
            <div className="flex-1">
              <Input
                type="search"
                value={search ?? ""}
                onChange={(e) => onSearch(e.target.value)}
                placeholder={searchPlaceholder}
                size="md"
              />
            </div>
          )}
          {hasFiltersToShow && (
            <Button
              variant={mobileOpen || count > 0 ? "secondary" : "outline"}
              size="md"
              onClick={() => setMobileOpen((v) => !v)}
              leftIcon={<SlidersHorizontal size={14} strokeWidth={1.9} />}
              aria-expanded={mobileOpen}
            >
              Фильтры
              {count > 0 && (
                <span
                  className="ml-1 inline-flex items-center justify-center tabular-nums"
                  style={{
                    minWidth: 18,
                    height: 18,
                    padding: "0 5px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                    background: "var(--app-accent-weak)",
                    color: "var(--app-accent-ink)",
                  }}
                >
                  {count}
                </span>
              )}
            </Button>
          )}
        </div>

        {mobileOpen && hasFiltersToShow && (
          <div
            className="flex flex-col gap-3 p-3 rounded-xl"
            style={{
              background: "var(--app-card-bg)",
              border: "1px solid var(--app-border)",
            }}
          >
            {filters.map((f) => (
              <div key={f.id} className="flex flex-col gap-1.5">
                {f.label && (
                  <label className="text-[12px] font-medium" style={{ color: "var(--t-secondary)" }}>
                    {f.label}
                  </label>
                )}
                <Select
                  size="md"
                  value={f.value}
                  onChange={f.onChange}
                  options={f.options}
                  placeholder={f.placeholder ?? f.label ?? "Не выбрано"}
                  searchable={f.searchable}
                />
              </div>
            ))}

            {dateRange && (
              <div className="flex flex-col gap-1.5">
                {dateRange.label && (
                  <label className="text-[12px] font-medium" style={{ color: "var(--t-secondary)" }}>
                    {dateRange.label}
                  </label>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <DateInput
                    size="md"
                    value={dateRange.from}
                    onChange={dateRange.onFromChange}
                    placeholder={dateRange.fromPlaceholder ?? "От"}
                  />
                  <DateInput
                    size="md"
                    value={dateRange.to}
                    onChange={dateRange.onToChange}
                    placeholder={dateRange.toPlaceholder ?? "До"}
                    min={dateRange.from || undefined}
                  />
                </div>
              </div>
            )}

            {onReset && count > 0 && (
              <div className="pt-1">
                <Button
                  variant="ghost"
                  size="md"
                  fullWidth
                  onClick={onReset}
                  leftIcon={<X size={14} strokeWidth={1.9} />}
                >
                  Сбросить фильтры ({count})
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default FilterBar;
