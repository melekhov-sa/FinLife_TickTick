"use client";

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

type Side = "top" | "bottom" | "left" | "right";
type Align = "start" | "center" | "end";

export interface PopoverProps {
  trigger: ReactElement;
  children: ReactNode;
  side?: Side;
  align?: Align;
  /** Controlled mode. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Override для popover body. */
  className?: string;
  /** Закрывать popover при клике внутри (для меню). Default false. */
  closeOnClickInside?: boolean;
}

const positionMap: Record<Side, Record<Align, string>> = {
  top: {
    start:  "bottom-full left-0 mb-1.5",
    center: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
    end:    "bottom-full right-0 mb-1.5",
  },
  bottom: {
    start:  "top-full left-0 mt-1.5",
    center: "top-full left-1/2 -translate-x-1/2 mt-1.5",
    end:    "top-full right-0 mt-1.5",
  },
  left: {
    start:  "right-full top-0 mr-1.5",
    center: "right-full top-1/2 -translate-y-1/2 mr-1.5",
    end:    "right-full bottom-0 mr-1.5",
  },
  right: {
    start:  "left-full top-0 ml-1.5",
    center: "left-full top-1/2 -translate-y-1/2 ml-1.5",
    end:    "left-full bottom-0 ml-1.5",
  },
};

const FOCUSABLE_SELECTOR =
  'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, object, embed, [tabindex]:not([tabindex="-1"]), [contenteditable]';

export function Popover({
  trigger,
  children,
  side = "bottom",
  align = "start",
  open: openProp,
  onOpenChange,
  className,
  closeOnClickInside = false,
}: PopoverProps) {
  const [openInternal, setOpenInternal] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? !!openProp : openInternal;

  const setOpen = useCallback(
    (v: boolean) => {
      if (!isControlled) setOpenInternal(v);
      onOpenChange?.(v);
    },
    [isControlled, onOpenChange],
  );

  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const triggerElRef = useRef<HTMLElement | null>(null);

  // Outside click + Escape
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerElRef.current?.focus();
      }
      // Focus trap (Tab cycling) within popover
      if (e.key === "Tab" && popRef.current) {
        const focusables = popRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (!popRef.current.contains(active)) return;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  // Auto-focus first focusable inside on open
  useEffect(() => {
    if (!open || !popRef.current) return;
    const focusables = popRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    focusables[0]?.focus();
  }, [open]);

  if (!isValidElement(trigger)) {
    return <>{trigger}</>;
  }

  const childProps = trigger.props as {
    onClick?: (e: React.MouseEvent) => void;
    ref?: React.Ref<HTMLElement>;
  };

  const triggerEl = cloneElement(trigger, {
    onClick: (e: React.MouseEvent) => {
      childProps.onClick?.(e);
      setOpen(!open);
    },
    ref: (node: HTMLElement | null) => {
      triggerElRef.current = node;
      const orig = childProps.ref;
      if (typeof orig === "function") orig(node);
      else if (orig && typeof orig === "object") {
        (orig as React.MutableRefObject<HTMLElement | null>).current = node;
      }
    },
    "aria-haspopup": "dialog",
    "aria-expanded": open,
  } as Partial<typeof childProps> & Record<string, unknown>);

  return (
    <span ref={wrapRef} className="relative inline-flex">
      {triggerEl}
      {open && (
        <div
          ref={popRef}
          role="dialog"
          onClick={closeOnClickInside ? () => setOpen(false) : undefined}
          className={cn(
            "absolute z-[110] min-w-[180px] rounded-xl border shadow-lg p-1.5",
            "animate-in fade-in zoom-in-95 duration-150",
            "bg-white border-slate-200 dark:bg-[#1a1d23] dark:border-white/[0.08]",
            positionMap[side][align],
            className,
          )}
        >
          {children}
        </div>
      )}
    </span>
  );
}
