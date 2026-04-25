"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "info" | "success" | "warning" | "danger";

export interface ToastOptions {
  title: ReactNode;
  description?: ReactNode;
  variant?: ToastVariant;
  /** мс, default 4000. 0 — не закрывать автоматически. */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

interface ToastInternal extends ToastOptions {
  id: string;
  _exiting?: boolean;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const variantConfig: Record<
  ToastVariant,
  { Icon: typeof Info; accent: string; iconColor: string }
> = {
  info:    { Icon: Info,          accent: "bg-blue-500",    iconColor: "text-blue-500 dark:text-blue-400" },
  success: { Icon: CircleCheck,   accent: "bg-emerald-500", iconColor: "text-emerald-500 dark:text-emerald-400" },
  warning: { Icon: TriangleAlert, accent: "bg-amber-500",   iconColor: "text-amber-500 dark:text-amber-400" },
  danger:  { Icon: CircleAlert,   accent: "bg-red-500",     iconColor: "text-red-500 dark:text-red-400" },
};

type Position = "bottom-right" | "top-right" | "bottom-left" | "top-left";

const positionClasses: Record<Position, string> = {
  "bottom-right": "bottom-4 right-4 items-end",
  "top-right":    "top-4 right-4 items-end",
  "bottom-left":  "bottom-4 left-4 items-start",
  "top-left":     "top-4 left-4 items-start",
};

export interface ToastProviderProps {
  children: ReactNode;
  position?: Position;
  /** Максимум одновременно видимых тостов (default 3). */
  max?: number;
}

export function ToastProvider({ children, position = "bottom-right", max = 3 }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastInternal[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((list) => list.map((t) => (t.id === id ? { ...t, _exiting: true } : t)));
    setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
    }, 180);
    const tm = timersRef.current.get(id);
    if (tm) {
      clearTimeout(tm);
      timersRef.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = Math.random().toString(36).slice(2);
      const duration = options.duration ?? 4000;
      setToasts((list) => {
        const next: ToastInternal[] = [...list, { id, ...options }];
        if (next.length > max) {
          const dropped = next.slice(0, next.length - max);
          for (const d of dropped) {
            const tm = timersRef.current.get(d.id);
            if (tm) {
              clearTimeout(tm);
              timersRef.current.delete(d.id);
            }
          }
          return next.slice(-max);
        }
        return next;
      });
      if (duration > 0) {
        const tm = setTimeout(() => dismiss(id), duration);
        timersRef.current.set(id, tm);
      }
      return id;
    },
    [dismiss, max],
  );

  // cleanup on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((tm) => clearTimeout(tm));
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className={cn(
          "pointer-events-none fixed z-[200] flex flex-col gap-2 w-[min(96vw,380px)]",
          positionClasses[position],
        )}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastInternal; onDismiss: () => void }) {
  const variant = toast.variant ?? "info";
  const { Icon, accent, iconColor } = variantConfig[variant];
  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto relative flex gap-3 rounded-xl shadow-lg border overflow-hidden",
        "bg-white border-slate-200 dark:bg-[#1a1d23] dark:border-white/[0.08]",
        "pl-3.5 pr-2.5 py-3",
        toast._exiting
          ? "animate-out slide-out-to-right-full fade-out duration-200"
          : "animate-in slide-in-from-right-full fade-in duration-200",
      )}
    >
      <span aria-hidden className={cn("absolute left-0 top-0 bottom-0 w-1", accent)} />
      <span className={cn("shrink-0 mt-0.5", iconColor)}>
        <Icon size={18} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 leading-snug">
          {toast.title}
        </div>
        {toast.description && (
          <div className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
            {toast.description}
          </div>
        )}
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick();
              onDismiss();
            }}
            className="mt-1.5 text-[12px] font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Закрыть"
        className={cn(
          "shrink-0 inline-flex items-center justify-center w-6 h-6 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100",
          "dark:hover:text-slate-200 dark:hover:bg-white/10",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60",
        )}
      >
        <X size={14} />
      </button>
    </div>
  );
}
