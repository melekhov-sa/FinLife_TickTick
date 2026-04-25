"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "destructive" | "link";
type Size = "xs" | "sm" | "md" | "lg";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: Variant;
  size?: Size;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  iconOnly?: boolean;
  fullWidth?: boolean;
  loading?: boolean;
  children?: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-gradient-to-br from-indigo-600 to-violet-600 text-[#fff] shadow-sm " +
    "hover:from-indigo-500 hover:to-violet-500 hover:shadow-md " +
    "active:from-indigo-700 active:to-violet-700",
  secondary:
    "bg-slate-100 text-slate-900 hover:bg-slate-200 active:bg-slate-300 " +
    "dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10 dark:active:bg-white/15",
  ghost:
    "bg-transparent text-slate-700 hover:bg-slate-100 active:bg-slate-200 " +
    "dark:text-slate-300 dark:hover:bg-white/5 dark:active:bg-white/10",
  outline:
    "border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50 " +
    "dark:border-white/15 dark:bg-transparent dark:text-slate-300 dark:hover:border-white/25 dark:hover:bg-white/5",
  destructive:
    "bg-red-600 text-[#fff] hover:bg-red-500 active:bg-red-700 shadow-sm",
  link:
    "bg-transparent text-indigo-600 hover:text-indigo-500 underline underline-offset-4 " +
    "dark:text-indigo-400 dark:hover:text-indigo-300",
};

const sizeClasses: Record<Size, string> = {
  xs: "h-7 px-2 text-[12px] gap-1",
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-9 px-4 text-[13px] gap-2",
  lg: "h-11 px-5 text-[14px] gap-2",
};

const iconOnlySizeClasses: Record<Size, string> = {
  xs: "w-7 h-7 p-0",
  sm: "w-8 h-8 p-0",
  md: "w-9 h-9 p-0",
  lg: "w-11 h-11 p-0",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    leftIcon,
    rightIcon,
    iconOnly = false,
    fullWidth = false,
    loading = false,
    disabled,
    className,
    children,
    type = "button",
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center font-medium rounded-lg select-none transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:ring-offset-1",
        "disabled:opacity-50 disabled:pointer-events-none",
        variantClasses[variant],
        iconOnly ? iconOnlySizeClasses[size] : sizeClasses[size],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {leftIcon && !loading && <span className="shrink-0">{leftIcon}</span>}
      {loading ? <Loader2 className="animate-spin shrink-0" size={14} /> : children}
      {rightIcon && !loading && <span className="shrink-0">{rightIcon}</span>}
    </button>
  );
});
