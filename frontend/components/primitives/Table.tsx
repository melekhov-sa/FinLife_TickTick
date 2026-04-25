"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "./Skeleton";
import { EmptyState } from "./EmptyState";

type SortDirection = "asc" | "desc";

export interface TableColumn<T> {
  key: string;
  label: ReactNode;
  align?: "left" | "right" | "center";
  width?: string | number;
  sortable?: boolean;
  render?: (row: T) => ReactNode;
  cellClassName?: string;
  headerClassName?: string;
}

export interface TableProps<T> {
  data: T[];
  columns: TableColumn<T>[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  loadingRows?: number;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  defaultSort?: { key: string; direction: SortDirection };
  size?: "sm" | "md";
  variant?: "default" | "card";
  className?: string;
}

export function Table<T>({
  data,
  columns,
  rowKey,
  loading = false,
  loadingRows = 5,
  empty,
  onRowClick,
  defaultSort,
  size = "md",
  variant = "default",
  className,
}: TableProps<T>) {
  const [sort, setSort] = useState<{ key: string; direction: SortDirection } | null>(
    defaultSort ?? null,
  );

  const sorted = useMemo(() => {
    if (!sort) return data;
    const col = columns.find((c) => c.key === sort.key);
    if (!col || !col.sortable) return data;
    return [...data].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sort.key];
      const bv = (b as Record<string, unknown>)[sort.key];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return sort.direction === "asc" ? av - bv : bv - av;
      }
      return sort.direction === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [data, sort, columns]);

  const toggleSort = (key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return null;
    });
  };

  const rowH = size === "sm" ? "h-9" : "h-11";
  const cellPad = size === "sm" ? "px-3 py-1.5 text-[13px]" : "px-4 py-2.5 text-[14px]";
  const headPad = size === "sm" ? "px-3 py-2 text-[11px]" : "px-4 py-3 text-[12px]";

  const isEmpty = !loading && sorted.length === 0;

  const tableEl = (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-white dark:bg-[#15181f]">
          <tr className="border-b border-slate-200 dark:border-white/[0.07]">
            {columns.map((col) => {
              const sortDir = sort?.key === col.key ? sort.direction : null;
              const align =
                col.align === "right"
                  ? "text-right"
                  : col.align === "center"
                  ? "text-center"
                  : "text-left";
              return (
                <th
                  key={col.key}
                  style={
                    col.width
                      ? { width: typeof col.width === "number" ? `${col.width}px` : col.width }
                      : undefined
                  }
                  className={cn(
                    headPad,
                    align,
                    "font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50",
                    col.sortable &&
                      "cursor-pointer select-none hover:text-slate-700 dark:hover:text-[#fff]",
                    col.headerClassName,
                  )}
                  onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                >
                  <span
                    className={cn(
                      "inline-flex items-center gap-1",
                      col.align === "right" && "flex-row-reverse",
                    )}
                  >
                    {col.label}
                    {col.sortable &&
                      (sortDir === "asc" ? (
                        <ChevronUp size={12} />
                      ) : sortDir === "desc" ? (
                        <ChevronDown size={12} />
                      ) : (
                        <ChevronsUpDown size={12} className="opacity-40" />
                      ))}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: loadingRows }).map((_, i) => (
              <tr
                key={`skel-${i}`}
                className={cn(rowH, "border-b border-slate-100 dark:border-white/[0.04]")}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cellPad}>
                    <Skeleton variant="text" className="w-3/4" />
                  </td>
                ))}
              </tr>
            ))
          ) : isEmpty ? (
            <tr>
              <td colSpan={columns.length} className="p-0">
                {empty ?? <EmptyState icon={<Inbox size={32} />} title="Нет данных" />}
              </td>
            </tr>
          ) : (
            sorted.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  rowH,
                  "border-b border-slate-100 dark:border-white/[0.04]",
                  onRowClick &&
                    "cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.03]",
                )}
              >
                {columns.map((col) => {
                  const align =
                    col.align === "right"
                      ? "text-right"
                      : col.align === "center"
                      ? "text-center"
                      : "text-left";
                  return (
                    <td
                      key={col.key}
                      className={cn(
                        cellPad,
                        align,
                        "text-slate-700 dark:text-white/85",
                        col.cellClassName,
                      )}
                    >
                      {col.render
                        ? col.render(row)
                        : ((row as Record<string, unknown>)[col.key] as ReactNode)}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  if (variant === "card") {
    return (
      <div
        className={cn(
          "bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.07] rounded-xl overflow-hidden",
          className,
        )}
      >
        {tableEl}
      </div>
    );
  }
  return <div className={className}>{tableEl}</div>;
}
