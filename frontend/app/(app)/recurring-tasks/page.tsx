"use client";

import { useState } from "react";
import { RefreshCw, Pencil, Check, X, Archive, RotateCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { api } from "@/lib/api";
import type { TaskTemplateItem } from "@/types/api";

const RU_MONTHS = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];

function freqLabel(freq: string): string {
  const map: Record<string, string> = {
    DAILY: "Ежедневно",
    WEEKLY: "Еженедельно",
    MONTHLY: "Ежемесячно",
    YEARLY: "Ежегодно",
  };
  return map[freq] ?? freq;
}

function formatDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${parseInt(d)} ${RU_MONTHS[parseInt(m) - 1]}`;
}

const TABS = [
  { value: false, label: "Активные" },
  { value: true,  label: "Архив" },
] as const;

type TabArchived = (typeof TABS)[number]["value"];

const FREQ_OPTIONS = [
  { value: "DAILY",   label: "Ежедневно" },
  { value: "WEEKLY",  label: "Еженедельно" },
  { value: "MONTHLY", label: "Ежемесячно" },
  { value: "YEARLY",  label: "Ежегодно" },
];

interface WorkCategory {
  category_id: number;
  title: string;
  emoji: string | null;
  is_archived: boolean;
}

function useTaskTemplates(archived: boolean) {
  return useQuery<TaskTemplateItem[]>({
    queryKey: ["task-templates", archived],
    queryFn: () => api.get<TaskTemplateItem[]>(`/api/v2/task-templates?archived=${archived}`),
    staleTime: 30 * 1000,
  });
}

function useWorkCategories() {
  return useQuery<WorkCategory[]>({
    queryKey: ["work-categories"],
    queryFn: () => api.get<WorkCategory[]>("/api/v2/work-categories"),
    staleTime: 60_000,
  });
}

function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; [k: string]: unknown }) =>
      api.patch(`/api/v2/task-templates/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-templates"] });
    },
  });
}

// ── TemplateRow ───────────────────────────────────────────────────────────────

function TemplateRow({
  item,
  isLast,
  categories,
  archived,
}: {
  item: TaskTemplateItem;
  isLast: boolean;
  categories: WorkCategory[];
  archived: boolean;
}) {
  const qc = useQueryClient();
  const { mutate: archiveTemplate } = useMutation({
    mutationFn: () => api.delete(`/api/v2/task-templates/${item.template_id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-templates"] }),
  });
  const { mutate: restoreTemplate } = useMutation({
    mutationFn: () => api.post(`/api/v2/task-templates/${item.template_id}/restore`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-templates"] }),
  });
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editNote, setEditNote] = useState(item.note ?? "");
  const [editCatId, setEditCatId] = useState<string>(String(item.category_id ?? ""));
  const [editFreq, setEditFreq] = useState(item.freq);
  const [editInterval, setEditInterval] = useState(String(item.interval));
  const [editActiveUntil, setEditActiveUntil] = useState(item.active_until ?? "");

  const { mutate: update, isPending } = useUpdateTemplate();

  function startEdit() {
    setEditTitle(item.title);
    setEditNote(item.note ?? "");
    setEditCatId(String(item.category_id ?? ""));
    setEditFreq(item.freq);
    setEditInterval(String(item.interval));
    setEditActiveUntil(item.active_until ?? "");
    setEditing(true);
  }

  function save() {
    const t = editTitle.trim();
    if (!t) return;
    update({
      id: item.template_id,
      title: t,
      note: editNote || null,
      category_id: editCatId ? Number(editCatId) : 0,
      freq: editFreq,
      interval: Number(editInterval) || 1,
      active_until: editActiveUntil || null,
    });
    setEditing(false);
  }

  const inputCls = "w-full text-[12px] bg-white/[0.06] border border-white/[0.1] rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-500/40";

  if (editing) {
    return (
      <div className={`px-4 py-3 space-y-2 ${!isLast ? "border-b border-white/[0.05]" : ""}`}>
        <div className="flex gap-2">
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="Название шаблона"
            className="flex-1 text-[13px] bg-white/[0.06] border border-indigo-500/40 rounded-lg px-2.5 py-1.5 outline-none"
            style={{ color: "var(--t-primary)" }}
            autoFocus
          />
          <button
            onClick={save}
            disabled={isPending || !editTitle.trim()}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white transition-colors disabled:opacity-40 shrink-0"
          >
            <Check size={12} strokeWidth={2.5} />
          </button>
          <button
            onClick={() => setEditing(false)}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.08] transition-colors shrink-0"
            style={{ color: "var(--t-faint)" }}
          >
            <X size={12} />
          </button>
        </div>

        <input
          value={editNote}
          onChange={(e) => setEditNote(e.target.value)}
          placeholder="Заметка (необязательно)"
          className={inputCls}
          style={{ color: "var(--t-secondary)" }}
        />

        <div className="flex gap-2">
          <select
            value={editFreq}
            onChange={(e) => setEditFreq(e.target.value)}
            className={`flex-1 ${inputCls}`}
            style={{ color: "var(--t-secondary)" }}
          >
            {FREQ_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            value={editInterval}
            onChange={(e) => setEditInterval(e.target.value)}
            placeholder="Интервал"
            className="w-20 text-[12px] bg-white/[0.06] border border-white/[0.1] rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-500/40 text-center"
            style={{ color: "var(--t-secondary)" }}
          />
        </div>

        <div className="flex gap-2">
          <select
            value={editCatId}
            onChange={(e) => setEditCatId(e.target.value)}
            className={`flex-1 ${inputCls}`}
            style={{ color: "var(--t-secondary)" }}
          >
            <option value="">— Без категории —</option>
            {categories.filter((c) => !c.is_archived).map((c) => (
              <option key={c.category_id} value={c.category_id}>
                {c.emoji ? `${c.emoji} ` : ""}{c.title}
              </option>
            ))}
          </select>
          <div className="flex-1">
            <input
              type="date"
              value={editActiveUntil}
              onChange={(e) => setEditActiveUntil(e.target.value)}
              className={inputCls}
              style={{ color: "var(--t-secondary)" }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors group/row ${
        !isLast ? "border-b border-white/[0.05]" : ""
      }`}
    >
      <span className="text-base shrink-0">
        {item.category_emoji ?? "🔄"}
      </span>

      <div className="flex-1 min-w-0">
        <p
          className="text-[14px] font-medium truncate"
          style={{ color: "var(--t-primary)" }}
        >
          {item.title}
        </p>
        <p className="text-[11px] mt-0.5" style={{ color: "var(--t-faint)" }}>
          {item.interval > 1
            ? `Каждые ${item.interval} (${freqLabel(item.freq).toLowerCase()})`
            : freqLabel(item.freq)}
          {" · "}
          {item.next_occurrence
            ? `Следующий: ${formatDate(item.next_occurrence)}`
            : "Нет запланированных"}
        </p>
        {(item.active_until || item.note) && (
          <p className="text-[10px] mt-0.5 truncate" style={{ color: "var(--t-faint)" }}>
            {item.active_until && `до ${formatDate(item.active_until)}`}
            {item.active_until && item.note && " · "}
            {item.note}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 font-medium">
          {freqLabel(item.freq)}
        </span>
        {!archived && (
          <button
            onClick={startEdit}
            className="w-6 h-6 flex items-center justify-center rounded-md md:opacity-0 md:group-hover/row:opacity-100 hover:bg-white/[0.08] transition-all"
            style={{ color: "var(--t-faint)" }}
            title="Редактировать"
          >
            <Pencil size={11} />
          </button>
        )}
        <button
          onClick={() => archived ? restoreTemplate() : archiveTemplate()}
          className="w-6 h-6 flex items-center justify-center rounded-md md:opacity-0 md:group-hover/row:opacity-100 hover:bg-white/[0.08] transition-all"
          style={{ color: "var(--t-faint)" }}
          title={archived ? "Восстановить" : "В архив"}
        >
          {archived ? <RotateCcw size={11} /> : <Archive size={11} />}
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RecurringTasksPage() {
  const [archived, setArchived] = useState<TabArchived>(false);
  const { data: templates, isLoading, isError } = useTaskTemplates(archived);
  const { data: categories = [] } = useWorkCategories();

  return (
    <>
      <AppTopbar title="Повторяющиеся задачи" />

      <main className="flex-1 overflow-auto p-3 md:p-6 w-full">
        {/* Tabs + count */}
        <div className="flex items-center justify-between mb-3 md:mb-5">
          <div className="flex items-center gap-0.5 bg-white/[0.03] border border-white/[0.06] rounded-lg md:rounded-xl p-0.5 md:p-1">
            {TABS.map(({ value, label }) => (
              <button
                key={String(value)}
                onClick={() => setArchived(value)}
                className={`px-2.5 md:px-3 py-1 md:py-1.5 rounded-md md:rounded-lg text-[11px] md:text-xs font-medium transition-colors ${
                  archived === value
                    ? "bg-white/[0.09] text-white shadow-sm"
                    : "text-white/55 hover:text-white/80"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {templates && templates.length > 0 && (
            <span
              className="text-[10px] md:text-[11px] font-medium px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.06]"
              style={{ color: "var(--t-faint)" }}
            >
              {templates.length}
            </span>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-1">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-14 bg-white/[0.02] rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {/* Error */}
        {isError && (
          <p className="text-red-400/70 text-sm text-center py-12">
            Не удалось загрузить шаблоны
          </p>
        )}

        {/* List */}
        {!isLoading && !isError && (
          <div className="bg-slate-50 dark:bg-white/[0.03] border-[1.5px] border-slate-300 dark:border-white/[0.09] rounded-xl md:rounded-2xl overflow-hidden">
            {/* Empty state */}
            {templates && templates.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 md:py-16 text-center px-4">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-2.5 md:mb-3">
                  <RefreshCw size={18} className="text-white/30" />
                </div>
                <p className="text-[13px] md:text-sm font-medium" style={{ color: "var(--t-muted)" }}>
                  Нет повторяющихся задач
                </p>
                {!archived && (
                  <a
                    href="/legacy/tasks?mode=recurring"
                    className="mt-2 text-xs font-medium text-indigo-400/60 hover:text-indigo-400 transition-colors"
                  >
                    Создать в старом интерфейсе
                  </a>
                )}
              </div>
            )}

            {/* Rows */}
            {templates && templates.map((item, i) => (
              <TemplateRow
                key={item.template_id}
                item={item}
                isLast={i === templates.length - 1}
                categories={categories}
                archived={archived}
              />
            ))}
          </div>
        )}

        {/* Link to legacy for creating */}
        {!isLoading && !isError && templates && templates.length > 0 && !archived && (
          <div className="mt-4 text-center">
            <a
              href="/legacy/tasks?mode=recurring"
              className="text-[11px] font-medium text-indigo-400/50 hover:text-indigo-400/80 transition-colors"
            >
              Управление в старом интерфейсе
            </a>
          </div>
        )}
      </main>
    </>
  );
}
