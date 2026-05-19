"use client";

import { useState } from "react";
import { RefreshCw, Pencil, Check, X, Archive, RotateCcw, AlertCircle, Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/primitives/PageHeader";
import { api } from "@/lib/api";
import type { TaskTemplateItem } from "@/types/api";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { Badge } from "@/components/primitives/Badge";
import { Chip } from "@/components/primitives/Chip";
import { Card } from "@/components/primitives/Card";
import { Select, type SelectOption } from "@/components/primitives/Select";
import { Skeleton } from "@/components/primitives/Skeleton";
import { Tooltip } from "@/components/primitives/Tooltip";
import { EmptyState } from "@/components/primitives/EmptyState";
import { CreateTaskModal } from "@/components/modals/CreateTaskModal";

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

const FREQ_OPTIONS: SelectOption[] = [
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

  const catOptions: SelectOption[] = [
    { value: "", label: "— Без категории —" },
    ...categories.filter((c) => !c.is_archived).map((c) => ({
      value: String(c.category_id),
      label: `${c.emoji ? c.emoji + " " : ""}${c.title}`,
    })),
  ];

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

  const rowBorder = !isLast ? "border-b border-slate-100 dark:border-white/[0.05]" : "";

  if (editing) {
    return (
      <div className={`px-4 py-3 space-y-2 ${rowBorder}`}>
        <div className="flex gap-2">
          <Input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="Название шаблона"
            size="sm"
            className="flex-1"
            autoFocus
          />
          <Button
            onClick={save}
            disabled={isPending || !editTitle.trim()}
            variant="primary"
            size="sm"
            iconOnly
            className="shrink-0"
          >
            <Check size={12} strokeWidth={2.5} />
          </Button>
          <Button
            onClick={() => setEditing(false)}
            variant="ghost"
            size="sm"
            iconOnly
            className="shrink-0"
          >
            <X size={12} />
          </Button>
        </div>

        <Input
          value={editNote}
          onChange={(e) => setEditNote(e.target.value)}
          placeholder="Заметка (необязательно)"
          size="sm"
        />

        <div className="flex gap-2">
          <Select
            value={editFreq}
            onChange={setEditFreq}
            options={FREQ_OPTIONS}
            size="sm"
            className="flex-1"
          />
          <Input
            type="number"
            min="1"
            value={editInterval}
            onChange={(e) => setEditInterval(e.target.value)}
            placeholder="Интервал"
            size="sm"
            className="w-20 text-center"
          />
        </div>

        <div className="flex gap-2">
          <Select
            value={editCatId}
            onChange={setEditCatId}
            options={catOptions}
            size="sm"
            className="flex-1"
          />
          <Input
            type="date"
            value={editActiveUntil}
            onChange={(e) => setEditActiveUntil(e.target.value)}
            size="sm"
            className="flex-1"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors group/row ${rowBorder}`}
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
        <Badge variant="accent" size="sm">{freqLabel(item.freq)}</Badge>
        {!archived && (
          <Tooltip content="Редактировать">
            <button
              onClick={startEdit}
              className="w-6 h-6 flex items-center justify-center rounded-md md:opacity-0 md:group-hover/row:opacity-100 hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-all"
              style={{ color: "var(--t-faint)" }}
            >
              <Pencil size={11} />
            </button>
          </Tooltip>
        )}
        <Tooltip content={archived ? "Восстановить" : "В архив"}>
          <button
            onClick={() => archived ? restoreTemplate() : archiveTemplate()}
            className="w-6 h-6 flex items-center justify-center rounded-md md:opacity-0 md:group-hover/row:opacity-100 hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-all"
            style={{ color: "var(--t-faint)" }}
          >
            {archived ? <RotateCcw size={11} /> : <Archive size={11} />}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RecurringTasksPage() {
  const [archived, setArchived] = useState<TabArchived>(false);
  const [showCreate, setShowCreate] = useState(false);
  const { data: templates, isLoading, isError } = useTaskTemplates(archived);
  const { data: categories = [] } = useWorkCategories();

  return (
    <>
      {showCreate && <CreateTaskModal onClose={() => setShowCreate(false)} defaultMode="recurring" />}
      <PageHeader
        title="Повторяющиеся задачи"
        density="compact"
        actions={
          <Button variant="primary" size="sm" leftIcon={<Plus size={13} />} onClick={() => setShowCreate(true)}>
            Создать шаблон
          </Button>
        }
      />

      <main className="flex-1 overflow-auto p-3 md:p-6 w-full">
        {/* Tabs + count */}
        <div className="flex items-center justify-between mb-3 md:mb-5">
          <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-lg md:rounded-xl p-0.5 md:p-1">
            {TABS.map(({ value, label }) => (
              <Chip
                key={String(value)}
                label={label}
                size="sm"
                selected={archived === value}
                onClick={() => setArchived(value)}
              />
            ))}
          </div>

          {templates && templates.length > 0 && (
            <span
              className="text-[10px] md:text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.06]"
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
              <Skeleton key={i} variant="rect" height={56} className="rounded-xl" />
            ))}
          </div>
        )}

        {/* Error */}
        {isError && (
          <EmptyState
            icon={<AlertCircle size={24} />}
            title="Не удалось загрузить шаблоны"
            size="md"
          />
        )}

        {/* List */}
        {!isLoading && !isError && (
          <Card padding="none" className="overflow-hidden rounded-xl md:rounded-2xl">
            {templates && templates.length === 0 && (
              <EmptyState
                icon={<RefreshCw size={18} />}
                title="Нет повторяющихся задач"
                size="sm"
              />
            )}

            {templates && templates.map((item, i) => (
              <TemplateRow
                key={item.template_id}
                item={item}
                isLast={i === templates.length - 1}
                categories={categories}
                archived={archived}
              />
            ))}
          </Card>
        )}
      </main>
    </>
  );
}
