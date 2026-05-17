"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { cn } from "@/lib/utils";

/**
 * InlineEditField — текст, который превращается в input по клику.
 *
 * Поведение:
 *   • В покое — текст с едва заметным hover-border снизу.
 *   • Клик / фокус → input с border-bottom цвета акцента.
 *   • Enter → сохраняет (если значение изменилось), снимает фокус.
 *   • Escape → отменяет, возвращает исходное.
 *   • Blur → сохраняет (если значение изменилось), иначе ничего.
 *   • disabled → просто текст, hover нет.
 *
 * Не клонирует children. Не управляет состоянием через ref снаружи.
 * Хранит локальный draft, синхронизирует с `value` через useEffect.
 */

export type InlineEditFieldSize = "sm" | "md" | "lg";

export interface InlineEditFieldProps {
  value: string;
  onSave: (next: string) => void;
  /** Что показать когда пусто и в покое. */
  placeholder?: string;
  size?: InlineEditFieldSize;
  /** Многострочный режим (textarea). По умолчанию false. */
  multiline?: boolean;
  /** Максимум строк textarea, по умолчанию 6. */
  maxRows?: number;
  /** Заблокировать редактирование (только просмотр). */
  disabled?: boolean;
  /** Триммить значение при сохранении. По умолчанию true. */
  trim?: boolean;
  /** Разрешить пустое значение. По умолчанию true. Если false — пустое отменяется. */
  allowEmpty?: boolean;
  /** Доступ. метка. */
  ariaLabel?: string;
  className?: string;
  /** Опционально стилизовать сам узел снаружи (например, font-weight). */
  textClassName?: string;
  /** Авто-вход в режим редактирования при mount. */
  autoEdit?: boolean;
}

const SIZE = {
  sm: { fz: 13, lh: 1.45, py: 4 },
  md: { fz: 15, lh: 1.4,  py: 5 },
  lg: { fz: 18, lh: 1.3,  py: 6 },
} as const;

export const InlineEditField = forwardRef<HTMLDivElement, InlineEditFieldProps>(
  function InlineEditField(
    {
      value,
      onSave,
      placeholder = "Без названия",
      size = "lg",
      multiline = false,
      maxRows = 6,
      disabled = false,
      trim = true,
      allowEmpty = true,
      ariaLabel,
      className,
      textClassName,
      autoEdit = false,
    },
    ref,
  ) {
    const reactId = useId();
    const [editing, setEditing] = useState(autoEdit);
    const [draft, setDraft] = useState(value);
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

    // Sync external value → draft, но только когда мы НЕ в режиме редактирования.
    useEffect(() => {
      if (!editing) setDraft(value);
    }, [value, editing]);

    // Autofocus + select при входе в редактирование.
    useEffect(() => {
      if (!editing) return;
      const el = inputRef.current;
      if (!el) return;
      // микро-таймаут, чтобы фокус не съел текущий click-handler
      const t = setTimeout(() => {
        el.focus();
        if ("select" in el) el.select();
      }, 0);
      return () => clearTimeout(t);
    }, [editing]);

    const commit = useCallback(() => {
      let next = draft;
      if (trim) next = next.trim();
      if (!allowEmpty && next === "") {
        // отмена — пустое не разрешено
        setDraft(value);
        setEditing(false);
        return;
      }
      if (next !== value) onSave(next);
      setEditing(false);
    }, [draft, value, onSave, trim, allowEmpty]);

    const cancel = useCallback(() => {
      setDraft(value);
      setEditing(false);
    }, [value]);

    const onKey = (e: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      } else if (e.key === "Enter") {
        // Enter сохраняет в одну линию всегда, в multiline — только без Shift.
        if (!multiline || (multiline && !e.shiftKey)) {
          e.preventDefault();
          commit();
        }
      }
    };

    const sz = SIZE[size];
    const isEmpty = value.trim() === "";

    if (!editing) {
      return (
        <div
          ref={ref}
          className={cn("relative inline-block w-full", className)}
        >
          <button
            type="button"
            disabled={disabled}
            onClick={() => !disabled && setEditing(true)}
            onFocus={() => !disabled && setEditing(true)}
            aria-label={ariaLabel ?? "Редактировать"}
            className={cn(
              "block w-full text-left transition-colors",
              "focus-visible:outline-none",
              !disabled && "cursor-text",
            )}
            style={{
              fontSize: sz.fz,
              lineHeight: sz.lh,
              padding: `${sz.py}px 0`,
              color: isEmpty ? "var(--t-faint)" : "var(--t-primary)",
              borderBottom: "1px solid transparent",
            }}
            onMouseEnter={(e) => {
              if (disabled) return;
              (e.currentTarget as HTMLButtonElement).style.borderBottomColor =
                "var(--app-border)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderBottomColor =
                "transparent";
            }}
          >
            <span className={cn("inline-block", textClassName)}>
              {isEmpty ? placeholder : value}
            </span>
          </button>
        </div>
      );
    }

    const sharedProps = {
      id: reactId,
      "aria-label": ariaLabel ?? "Редактирование",
      value: draft,
      onChange: (e: { currentTarget: { value: string } }) =>
        setDraft(e.currentTarget.value),
      onBlur: commit,
      onKeyDown: onKey,
      className: cn(
        "block w-full bg-transparent outline-none resize-none",
        textClassName,
      ),
      style: {
        fontSize: sz.fz,
        lineHeight: sz.lh,
        padding: `${sz.py}px 0`,
        color: "var(--t-primary)",
        borderBottom: "1.5px solid var(--app-accent)",
      } as React.CSSProperties,
    };

    return (
      <div ref={ref} className={cn("relative inline-block w-full", className)}>
        {multiline ? (
          <textarea
            ref={(el) => { inputRef.current = el; }}
            rows={Math.min(Math.max(draft.split("\n").length, 1), maxRows)}
            placeholder={placeholder}
            {...sharedProps}
          />
        ) : (
          <input
            ref={(el) => { inputRef.current = el; }}
            type="text"
            placeholder={placeholder}
            {...sharedProps}
          />
        )}
      </div>
    );
  },
);

export default InlineEditField;
