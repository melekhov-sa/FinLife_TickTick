"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/**
 * FormField — обёртка для любого поля формы.
 *
 *   label + children + (error | hint)
 *
 * • required → к label добавляется красная «*»
 * • error    → красный текст снизу + data-атрибут на единственного ребёнка
 *              (Input/Select/DateInput/Textarea), чтобы их собственная стилизация
 *              ошибки сработала. Если у children этого нет — error всё равно
 *              виден текстом снизу.
 * • hint     → серый текст снизу, скрывается при наличии error
 *
 * Не клонирует children для замены props (риск ломаного поведения сторонних
 * компонентов). Передаёт только `aria-describedby` и `data-error` через клон.
 * Любая компонента-примитив должна сама подхватить `aria-invalid` через id или
 * через data-атрибут.
 */

export type FormFieldSize = "sm" | "md";

export interface FormFieldProps {
  label?: ReactNode;
  /** Обязательное поле — звёздочка в label. */
  required?: boolean;
  /** Если задано — текст ошибки внизу + data-error на children. */
  error?: ReactNode;
  /** Серый текст-подсказка под полем. Скрыт при наличии error. */
  hint?: ReactNode;
  /** Уникальный id поля (для htmlFor у label, если возможно). */
  htmlFor?: string;
  size?: FormFieldSize;
  className?: string;
  children: ReactNode;
}

const TOK = {
  sm: { labelFz: 11.5, gap: 4, msgFz: 11.5, msgGap: 4 },
  md: { labelFz: 12.5, gap: 6, msgFz: 12,   msgGap: 6 },
} as const;

export function FormField({
  label,
  required = false,
  error,
  hint,
  htmlFor,
  size = "md",
  className,
  children,
}: FormFieldProps) {
  const tok = TOK[size];
  const hasError = Boolean(error);

  // Прокидываем data-error и aria-invalid в единственного ребёнка, не ломая его props
  const enhancedChildren = Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    const c = child as ReactElement<Record<string, unknown>>;
    return cloneElement(c, {
      ...c.props,
      "data-error": hasError ? "" : undefined,
      "aria-invalid": hasError || c.props["aria-invalid"] || undefined,
    });
  });

  return (
    <div className={cn("flex flex-col", className)} style={{ gap: tok.gap }}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="select-none font-medium"
          style={{
            fontSize: tok.labelFz,
            color: "var(--t-secondary)",
            letterSpacing: "-0.005em",
          }}
        >
          {label}
          {required && (
            <span aria-hidden style={{ color: "var(--c-danger-ink)", marginLeft: 3 }}>
              *
            </span>
          )}
        </label>
      )}

      {enhancedChildren}

      {(hasError || hint) && (
        <p
          role={hasError ? "alert" : undefined}
          style={{
            fontSize: tok.msgFz,
            color: hasError ? "var(--c-danger-ink)" : "var(--t-muted)",
            lineHeight: 1.4,
            marginTop: tok.msgGap - tok.gap,
          }}
        >
          {hasError ? error : hint}
        </p>
      )}
    </div>
  );
}

export default FormField;
