"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

type Side = "top" | "bottom" | "left" | "right";

export interface TooltipProps {
  content: ReactNode;
  children: ReactElement;
  side?: Side;
  /** мс перед показом, default 300. */
  delay?: number;
  disabled?: boolean;
  /** Override для tooltip body. */
  className?: string;
}

const wrapperPos: Record<Side, string> = {
  top:    "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
  left:   "right-full top-1/2 -translate-y-1/2 mr-1.5",
  right:  "left-full top-1/2 -translate-y-1/2 ml-1.5",
};

const arrowPos: Record<Side, string> = {
  top:    "top-full left-1/2 -translate-x-1/2 -mt-px",
  bottom: "bottom-full left-1/2 -translate-x-1/2 -mb-px rotate-180",
  left:   "left-full top-1/2 -translate-y-1/2 -ml-px -rotate-90",
  right:  "right-full top-1/2 -translate-y-1/2 -mr-px rotate-90",
};

export function Tooltip({
  content,
  children,
  side = "top",
  delay = 300,
  disabled = false,
  className,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show() {
    if (disabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setOpen(true), delay);
  }
  function hide() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setOpen(false);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!isValidElement(children)) return <>{children}</>;

  const childProps = children.props as {
    onMouseEnter?: (e: React.MouseEvent) => void;
    onMouseLeave?: (e: React.MouseEvent) => void;
    onFocus?: (e: React.FocusEvent) => void;
    onBlur?: (e: React.FocusEvent) => void;
  };

  const trigger = cloneElement(children, {
    onMouseEnter: (e: React.MouseEvent) => {
      childProps.onMouseEnter?.(e);
      show();
    },
    onMouseLeave: (e: React.MouseEvent) => {
      childProps.onMouseLeave?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent) => {
      childProps.onFocus?.(e);
      show();
    },
    onBlur: (e: React.FocusEvent) => {
      childProps.onBlur?.(e);
      hide();
    },
  } as Partial<typeof childProps>);

  return (
    <span className="relative inline-flex">
      {trigger}
      {open && (
        <span
          role="tooltip"
          className={cn(
            "absolute z-[120] animate-in fade-in zoom-in-95 duration-150",
            wrapperPos[side],
          )}
        >
          <span
            className={cn(
              "inline-block rounded-md px-2 py-1 text-[12px] font-medium whitespace-nowrap shadow-md",
              "bg-slate-900 text-[#fff] dark:bg-slate-100 dark:text-slate-900",
              className,
            )}
          >
            {content}
          </span>
          <span
            aria-hidden
            className={cn(
              "absolute w-0 h-0 border-x-[5px] border-t-[5px] border-x-transparent",
              "border-t-slate-900 dark:border-t-slate-100",
              arrowPos[side],
            )}
          />
        </span>
      )}
    </span>
  );
}
