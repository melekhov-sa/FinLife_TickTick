"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FormRowProps {
  /** Текст лейбла. */
  label: ReactNode;
  /** Признак обязательного поля — добавляет красную звёздочку. */
  required?: boolean;
  /** Опциональная подсказка под полем. */
  hint?: ReactNode;
  /** Опциональная ошибка под полем. Если задана — перебивает hint. */
  error?: ReactNode;
  /** Доп. класс для всего ряда. */
  className?: string;
  /** Содержимое поля (input/select/...) */
  children: ReactNode;
}

/**
 * Двух-колоночный ряд формы:
 *  - на md+ — лейбл слева в фиксированной ширине, поле справа
 *  - на mobile — стек, лейбл сверху как раньше
 */
export function FormRow({ label, required, hint, error, className, children }: FormRowProps) {
  return (
    <div
      className={cn(
        "md:grid md:grid-cols-[140px_1fr] md:gap-4 md:items-start",
        className
      )}
    >
      <div className="text-[11px] md:text-xs font-medium uppercase tracking-wider mb-1.5 md:mb-0 md:pt-2.5 text-slate-500 dark:text-white/72">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </div>
      <div className="min-w-0">
        {children}
        {(error || hint) && (
          <p
            className={cn(
              "mt-1 text-[11px]",
              error ? "text-red-500" : "text-slate-500 dark:text-white/55"
            )}
          >
            {error || hint}
          </p>
        )}
      </div>
    </div>
  );
}
