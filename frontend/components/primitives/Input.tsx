"use client";

import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { Eye, EyeOff, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> {
  label?: ReactNode;
  helperText?: ReactNode;
  error?: ReactNode;
  prefix?: ReactNode;
  suffix?: ReactNode;
  size?: Size;
  tabular?: boolean;
}

const sizeClasses: Record<Size, string> = {
  sm: "h-8 text-[13px]",
  md: "h-9 text-[13px]",
  lg: "h-11 text-[14px]",
};

const sizePadX: Record<Size, string> = {
  sm: "px-2.5",
  md: "px-3",
  lg: "px-3.5",
};

const sizeAffixGap: Record<Size, string> = {
  sm: "gap-2",
  md: "gap-2",
  lg: "gap-2.5",
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    helperText,
    error,
    prefix,
    suffix,
    size = "md",
    tabular = false,
    type = "text",
    id,
    className,
    disabled,
    readOnly,
    ...rest
  },
  ref,
) {
  const reactId = useId();
  const inputId = id ?? reactId;
  const [showPwd, setShowPwd] = useState(false);

  // type=password → toggle eye
  const isPassword = type === "password";
  const effectiveType = isPassword ? (showPwd ? "text" : "password") : type;

  // type=search → search icon prefix
  const resolvedPrefix =
    prefix ?? (type === "search" ? <Search size={size === "lg" ? 16 : 14} aria-hidden /> : null);

  const resolvedSuffix = isPassword ? (
    <button
      type="button"
      onClick={() => setShowPwd((v) => !v)}
      tabIndex={-1}
      aria-label={showPwd ? "Скрыть пароль" : "Показать пароль"}
      className={cn(
        "inline-flex items-center justify-center rounded-md text-slate-500 hover:text-slate-700",
        "dark:text-slate-400 dark:hover:text-slate-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60",
      )}
    >
      {showPwd ? <EyeOff size={size === "lg" ? 16 : 14} /> : <Eye size={size === "lg" ? 16 : 14} />}
    </button>
  ) : (
    suffix
  );

  const hasError = Boolean(error);
  const describedById = error || helperText ? `${inputId}-desc` : undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-[12px] font-medium text-slate-700 dark:text-slate-300 select-none"
        >
          {label}
        </label>
      )}

      <div
        className={cn(
          "flex items-center rounded-lg border bg-white transition-colors",
          "dark:bg-white/[0.03]",
          sizeClasses[size],
          sizePadX[size],
          sizeAffixGap[size],
          hasError
            ? "border-red-500 focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-500/30"
            : "border-slate-300 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/30 " +
                "dark:border-white/15 dark:focus-within:border-indigo-400",
          disabled && "opacity-50 pointer-events-none bg-slate-50 dark:bg-white/[0.02]",
          readOnly && "bg-slate-50 dark:bg-white/[0.02]",
        )}
      >
        {resolvedPrefix && (
          <span className="shrink-0 inline-flex items-center justify-center text-slate-500 dark:text-slate-400">
            {resolvedPrefix}
          </span>
        )}

        <input
          ref={ref}
          id={inputId}
          type={effectiveType}
          disabled={disabled}
          readOnly={readOnly}
          aria-invalid={hasError || undefined}
          aria-describedby={describedById}
          className={cn(
            "w-full bg-transparent outline-none border-0 p-0",
            "text-slate-900 placeholder:text-slate-400",
            "dark:text-slate-100 dark:placeholder:text-slate-500",
            "disabled:cursor-not-allowed",
            tabular && "tabular-nums",
            type === "number" &&
              "[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [appearance:textfield]",
          )}
          {...rest}
        />

        {resolvedSuffix && (
          <span
            className={cn(
              "shrink-0 inline-flex items-center justify-center",
              !isPassword && "text-slate-500 dark:text-slate-400",
            )}
          >
            {resolvedSuffix}
          </span>
        )}
      </div>

      {(error || helperText) && (
        <p
          id={describedById}
          className={cn(
            "text-[12px] leading-snug",
            hasError ? "text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-400",
          )}
        >
          {error || helperText}
        </p>
      )}
    </div>
  );
});
