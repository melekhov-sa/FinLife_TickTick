"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: ReactNode;
  description?: ReactNode;
  size?: Size;
  indeterminate?: boolean;
}

const boxSizeClasses: Record<Size, string> = {
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
  lg: "w-[18px] h-[18px]",
};

const iconSize: Record<Size, number> = {
  sm: 10,
  md: 12,
  lg: 14,
};

const labelSize: Record<Size, string> = {
  sm: "text-[12px]",
  md: "text-[13px]",
  lg: "text-[14px]",
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  {
    label,
    description,
    size = "md",
    indeterminate = false,
    id,
    className,
    disabled,
    checked,
    ...rest
  },
  forwardedRef,
) {
  const reactId = useId();
  const inputId = id ?? reactId;
  const innerRef = useRef<HTMLInputElement | null>(null);

  // Merge refs
  function setRef(node: HTMLInputElement | null) {
    innerRef.current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
  }

  useEffect(() => {
    if (innerRef.current) innerRef.current.indeterminate = indeterminate;
  }, [indeterminate, checked]);

  const isChecked = checked || indeterminate;

  return (
    <label
      htmlFor={inputId}
      className={cn(
        "inline-flex items-start gap-2 select-none cursor-pointer",
        disabled && "opacity-50 pointer-events-none cursor-not-allowed",
        className,
      )}
    >
      <span className="relative inline-flex shrink-0 items-center justify-center mt-px">
        <input
          ref={setRef}
          id={inputId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          className="peer sr-only"
          {...rest}
        />
        <span
          aria-hidden
          className={cn(
            "inline-flex items-center justify-center rounded border transition-colors",
            boxSizeClasses[size],
            isChecked
              ? "bg-indigo-600 border-indigo-600 text-[#fff] dark:bg-indigo-500 dark:border-indigo-500"
              : "bg-white border-slate-300 dark:bg-white/[0.03] dark:border-white/20",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500/60 peer-focus-visible:ring-offset-1",
          )}
        >
          {indeterminate ? (
            <Minus size={iconSize[size]} strokeWidth={3} />
          ) : checked ? (
            <Check size={iconSize[size]} strokeWidth={3} />
          ) : null}
        </span>
      </span>

      {(label || description) && (
        <span className="flex flex-col leading-tight">
          {label && (
            <span className={cn("text-slate-900 dark:text-slate-100", labelSize[size])}>
              {label}
            </span>
          )}
          {description && (
            <span className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
              {description}
            </span>
          )}
        </span>
      )}
    </label>
  );
});
