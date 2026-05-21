"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Minus, Settings, Trash2, Zap, RefreshCw } from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/lib/api";
import type { CounterItem } from "@/types/api";
import type { WorkCategoryItem } from "@/types/api";
import type { WidgetProps } from "../types";
import {
  useCounters,
  useCreateCounter,
  useIncrementCounter,
  useDecrementCounter,
  useDeleteCounter,
  useUpdateCounter,
} from "@/hooks/useCounters";
import { pluralizeYears } from "@/lib/utils";

// ── Per-instance config in localStorage ──────────────────────────────────────

const cfgKey = (instanceId: string) => `finlife:counter-cfg-${instanceId}`;

function loadCfg(instanceId: string): number | null {
  try {
    const raw = localStorage.getItem(cfgKey(instanceId));
    return raw ? (JSON.parse(raw).counter_id as number) : null;
  } catch {
    return null;
  }
}

function saveCfg(instanceId: string, counterId: number) {
  localStorage.setItem(cfgKey(instanceId), JSON.stringify({ counter_id: counterId }));
}

function clearCfg(instanceId: string) {
  localStorage.removeItem(cfgKey(instanceId));
}

// ── Setup form ────────────────────────────────────────────────────────────────

function SetupForm({
  instanceId,
  onDone,
}: {
  instanceId: string;
  onDone: (counterId: number) => void;
}) {
  const { data: counters = [] } = useCounters();
  const { data: categories = [] } = useQuery<WorkCategoryItem[]>({
    queryKey: ["work-categories"],
    queryFn: () => api.get<WorkCategoryItem[]>("/api/v2/work-categories"),
    staleTime: 5 * 60_000,
  });

  const { mutate: createCounter, isPending } = useCreateCounter();

  const [tab, setTab] = useState<"pick" | "create">(counters.length > 0 ? "pick" : "create");
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("");
  const [mode, setMode] = useState<"manual" | "auto_event" | "auto_task">("manual");
  const [sourceCatId, setSourceCatId] = useState<number | "">("");
  const [periodType, setPeriodType] = useState<"year" | "month">("year");

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    createCounter(
      {
        title: t,
        emoji: emoji.trim() || null,
        mode,
        source_category_id: mode !== "manual" && sourceCatId ? Number(sourceCatId) : null,
        period_type: periodType,
      },
      { onSuccess: (res) => { onDone(res.id); } }
    );
  }

  return (
    <div className="h-full flex flex-col p-3 gap-3 overflow-y-auto">
      {counters.length > 0 && (
        <div className="flex gap-1 text-[12px]">
          <button
            onClick={() => setTab("pick")}
            className={clsx("flex-1 py-1 rounded-lg font-medium transition-colors",
              tab === "pick" ? "bg-indigo-500/20 text-indigo-400" : "hover:bg-white/[0.05]"
            )}
            style={{ color: tab === "pick" ? undefined : "var(--t-faint)" }}
          >
            Выбрать
          </button>
          <button
            onClick={() => setTab("create")}
            className={clsx("flex-1 py-1 rounded-lg font-medium transition-colors",
              tab === "create" ? "bg-indigo-500/20 text-indigo-400" : "hover:bg-white/[0.05]"
            )}
            style={{ color: tab === "create" ? undefined : "var(--t-faint)" }}
          >
            Создать
          </button>
        </div>
      )}

      {tab === "pick" && (
        <div className="flex flex-col gap-1">
          {counters.map((c) => (
            <button
              key={c.id}
              onClick={() => onDone(c.id)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-left hover:bg-white/[0.06] transition-colors border border-transparent hover:border-white/[0.08]"
            >
              <span className="text-lg shrink-0">{c.emoji ?? "🔢"}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate" style={{ color: "var(--t-primary)" }}>{c.title}</p>
                <p className="text-[11px]" style={{ color: "var(--t-faint)" }}>
                  {c.mode === "manual" ? "Ручной" : c.mode === "auto_event" ? "Авто: события" : "Авто: задачи"} · {c.period_type === "year" ? "год" : "месяц"}
                </p>
              </div>
              <span className="text-[18px] font-bold tabular-nums shrink-0" style={{ color: "var(--t-muted)" }}>{c.current_count}</span>
            </button>
          ))}
        </div>
      )}

      {tab === "create" && (
        <form onSubmit={handleCreate} className="flex flex-col gap-2.5">
          <div className="flex gap-2">
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="🔢"
              className="w-10 text-center text-lg bg-white/[0.05] border border-white/[0.08] rounded-lg focus:outline-none focus:border-indigo-500/50"
            />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Название счётчика"
              autoFocus
              className="flex-1 px-2.5 py-1.5 text-[13px] bg-white/[0.05] border border-white/[0.08] rounded-lg focus:outline-none focus:border-indigo-500/50"
              style={{ color: "var(--t-primary)" }}
            />
          </div>

          {/* Mode */}
          <div className="flex gap-1">
            {(["manual", "auto_event", "auto_task"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={clsx(
                  "flex-1 py-1 rounded-lg text-[11px] font-medium transition-colors",
                  mode === m ? "bg-indigo-500/20 text-indigo-400" : "bg-white/[0.04] hover:bg-white/[0.07]"
                )}
                style={{ color: mode === m ? undefined : "var(--t-faint)" }}
              >
                {m === "manual" ? "Ручной" : m === "auto_event" ? "События" : "Задачи"}
              </button>
            ))}
          </div>

          {mode !== "manual" && (
            <select
              value={sourceCatId}
              onChange={(e) => setSourceCatId(e.target.value ? Number(e.target.value) : "")}
              className="w-full px-2.5 py-1.5 text-[13px] bg-white/[0.05] border border-white/[0.08] rounded-lg focus:outline-none focus:border-indigo-500/50 [color-scheme:dark]"
              style={{ color: "var(--t-secondary)" }}
            >
              <option value="">— Категория —</option>
              {categories.map((c) => (
                <option key={c.category_id} value={c.category_id}>
                  {c.emoji ? `${c.emoji} ` : ""}{c.title}
                </option>
              ))}
            </select>
          )}

          {/* Period */}
          <div className="flex gap-1">
            {(["year", "month"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriodType(p)}
                className={clsx(
                  "flex-1 py-1 rounded-lg text-[11px] font-medium transition-colors",
                  periodType === p ? "bg-indigo-500/20 text-indigo-400" : "bg-white/[0.04] hover:bg-white/[0.07]"
                )}
                style={{ color: periodType === p ? undefined : "var(--t-faint)" }}
              >
                {p === "year" ? "Год" : "Месяц"}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={isPending || !title.trim() || (mode !== "manual" && !sourceCatId)}
            className="w-full py-2 rounded-xl text-[13px] font-semibold bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 transition-colors text-white"
          >
            {isPending ? "Создаю..." : "Создать"}
          </button>
        </form>
      )}
    </div>
  );
}

// ── Counter display ───────────────────────────────────────────────────────────

function CounterDisplay({
  counter,
  instanceId,
  onDetach,
}: {
  counter: CounterItem;
  instanceId: string;
  onDetach: () => void;
}) {
  const { mutate: increment, isPending: incPending } = useIncrementCounter();
  const { mutate: decrement, isPending: decPending } = useDecrementCounter();
  const { mutate: deleteCounter } = useDeleteCounter();
  const [showMenu, setShowMenu] = useState(false);

  const isManual = counter.mode === "manual";
  const delta = counter.current_count - counter.previous_count;
  const trend = delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-1 relative">
        <span className="text-xl shrink-0">{counter.emoji ?? "🔢"}</span>
        <span className="flex-1 text-[13px] font-semibold truncate min-w-0" style={{ color: "var(--t-primary)" }}>
          {counter.title}
        </span>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md shrink-0" style={{ background: "var(--c-neutral-bg)", color: "var(--t-faint)" }}>
          {counter.current_label}
        </span>
        <button
          onClick={() => setShowMenu((v) => !v)}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/[0.08] transition-colors shrink-0"
          style={{ color: "var(--t-faint)" }}
        >
          <Settings size={11} />
        </button>
        {showMenu && (
          <div
            className="absolute top-6 right-0 z-20 bg-slate-800 border border-white/[0.10] rounded-xl shadow-xl overflow-hidden"
            style={{ minWidth: 160 }}
          >
            <button
              onClick={() => { onDetach(); setShowMenu(false); }}
              className="w-full text-left px-3 py-2 text-[12px] hover:bg-white/[0.06] transition-colors"
              style={{ color: "var(--t-secondary)" }}
            >
              <RefreshCw size={11} className="inline mr-2 opacity-60" />
              Сменить счётчик
            </button>
            <button
              onClick={() => { deleteCounter(counter.id); onDetach(); setShowMenu(false); }}
              className="w-full text-left px-3 py-2 text-[12px] hover:bg-red-500/10 hover:text-red-400 transition-colors"
              style={{ color: "var(--t-faint)" }}
            >
              <Trash2 size={11} className="inline mr-2 opacity-60" />
              Удалить счётчик
            </button>
          </div>
        )}
      </div>

      {/* Count */}
      <div className="flex-1 flex flex-col items-center justify-center gap-1">
        <span
          className="tabular-nums font-black leading-none"
          style={{
            fontSize: "clamp(40px, 15cqw, 72px)",
            letterSpacing: "-0.04em",
            color: "var(--t-primary)",
          }}
        >
          {counter.current_count}
        </span>

        {/* Comparison */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] tabular-nums" style={{ color: "var(--t-faint)" }}>
            {counter.previous_count} в {counter.previous_label}
          </span>
          {trend !== "flat" && (
            <span className={clsx(
              "text-[11px] font-semibold tabular-nums",
              trend === "up" ? "text-emerald-400" : "text-red-400",
            )}>
              {trend === "up" ? "+" : ""}{delta}
            </span>
          )}
        </div>

        {/* Auto badge */}
        {!isManual && (
          <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md mt-0.5"
            style={{ background: "rgba(99,102,241,0.12)", color: "var(--t-muted)" }}>
            <Zap size={9} />
            {counter.mode === "auto_event" ? "Авто: события" : "Авто: задачи"}
          </span>
        )}
      </div>

      {/* Controls — manual only */}
      {isManual && (
        <div className="flex items-center justify-center gap-3 mt-1">
          <button
            onClick={() => decrement(counter.id)}
            disabled={decPending || counter.current_count <= 0}
            className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/[0.10] hover:bg-white/[0.06] disabled:opacity-30 transition-all"
            style={{ color: "var(--t-secondary)" }}
          >
            <Minus size={16} />
          </button>
          <button
            onClick={() => increment(counter.id)}
            disabled={incPending}
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 transition-all shadow-lg shadow-indigo-500/20"
          >
            <Plus size={18} className="text-white" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────

export function CounterWidget({ instanceId }: WidgetProps) {
  const [counterId, setCounterId] = useState<number | null>(null);

  useEffect(() => {
    setCounterId(loadCfg(instanceId));
  }, [instanceId]);

  const { data: counters, isLoading } = useCounters();
  const counter = counters?.find((c) => c.id === counterId) ?? null;

  function handleSelect(id: number) {
    saveCfg(instanceId, id);
    setCounterId(id);
  }

  function handleDetach() {
    clearCfg(instanceId);
    setCounterId(null);
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center animate-pulse">
        <div className="w-16 h-8 rounded-lg" style={{ background: "var(--c-neutral-bg)" }} />
      </div>
    );
  }

  if (!counterId || !counter) {
    return <SetupForm instanceId={instanceId} onDone={handleSelect} />;
  }

  return (
    <CounterDisplay
      counter={counter}
      instanceId={instanceId}
      onDetach={handleDetach}
    />
  );
}
