"use client";

import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { api } from "@/lib/api";
import {
  Pencil,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  Plus,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { Select } from "@/components/ui/Select";
import type { SelectOption } from "@/components/ui/Select";
import { clsx } from "clsx";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TaskPreset {
  id: number;
  name: string;
  title_template: string;
  description_template: string | null;
  default_task_category_id: number | null;
  is_active: boolean;
  sort_order: number;
}

interface WorkCategory {
  category_id: number;
  title: string;
  emoji: string | null;
  is_archived: boolean;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useAllPresets() {
  return useQuery<TaskPreset[]>({
    queryKey: ["task-presets-all"],
    queryFn: () => api.get<TaskPreset[]>("/api/v2/task-presets?include_inactive=true"),
    staleTime: 30_000,
  });
}

function useWorkCategories() {
  return useQuery<WorkCategory[]>({
    queryKey: ["work-categories-all"],
    queryFn: () => api.get<WorkCategory[]>("/api/v2/work-categories?include_archived=true"),
    staleTime: 60_000,
  });
}

function useCreatePreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      title_template: string;
      description_template?: string | null;
      default_task_category_id?: number | null;
    }) => api.post("/api/v2/task-presets", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-presets-all"] }),
  });
}

function useUpdatePreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: number;
      name?: string;
      title_template?: string;
      description_template?: string | null;
      default_task_category_id?: number | null;
      is_active?: boolean;
    }) => api.patch(`/api/v2/task-presets/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-presets-all"] }),
  });
}

function useMovePreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, direction }: { id: number; direction: "up" | "down" }) =>
      api.post(`/api/v2/task-presets/${id}/move`, { direction }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-presets-all"] }),
  });
}

// ── PresetRow ─────────────────────────────────────────────────────────────────

function PresetRow({
  preset,
  isFirst,
  isLast,
  categoryName,
}: {
  preset: TaskPreset;
  isFirst: boolean;
  isLast: boolean;
  categoryName: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(preset.name);
  const [editTitle, setEditTitle] = useState(preset.title_template);
  const [editDesc, setEditDesc] = useState(preset.description_template ?? "");
  const [editCatId, setEditCatId] = useState<number | null>(
    preset.default_task_category_id
  );

  const nameRef = useRef<HTMLInputElement>(null);

  const { mutate: update, isPending: updating } = useUpdatePreset();
  const { mutate: move } = useMovePreset();

  const { data: categories = [] } = useWorkCategories();

  const catOptions: SelectOption[] = [
    { value: "", label: "— Без категории —" },
    ...categories.filter((c) => !c.is_archived).map((c) => ({
      value: String(c.category_id),
      label: `${c.emoji ? c.emoji + " " : ""}${c.title}`,
    })),
  ];

  function startEdit() {
    setEditName(preset.name);
    setEditTitle(preset.title_template);
    setEditDesc(preset.description_template ?? "");
    setEditCatId(preset.default_task_category_id);
    setEditing(true);
    setTimeout(() => nameRef.current?.select(), 30);
  }

  function save() {
    const n = editName.trim();
    const t = editTitle.trim();
    if (!n || !t) return;
    update({
      id: preset.id,
      name: n,
      title_template: t,
      description_template: editDesc.trim() || null,
      default_task_category_id: editCatId,
    });
    setEditing(false);
  }

  function cancel() {
    setEditing(false);
  }

  function toggleActive() {
    update({ id: preset.id, is_active: !preset.is_active });
  }

  const btnBase =
    "w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/[0.08] transition-colors disabled:opacity-30";

  if (editing) {
    return (
      <div className="px-4 py-3 border-b border-white/[0.05] space-y-2">
        <div className="flex gap-2">
          <input
            ref={nameRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Название шаблона"
            className="flex-1 text-[13px] bg-white/[0.06] border border-indigo-500/40 rounded-lg px-2.5 py-1.5 outline-none"
            style={{ color: "var(--t-primary)" }}
            autoFocus
          />
          <button
            onClick={save}
            disabled={updating || !editName.trim() || !editTitle.trim()}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white transition-colors disabled:opacity-40 shrink-0"
          >
            <Check size={12} strokeWidth={2.5} />
          </button>
          <button
            onClick={cancel}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.08] transition-colors shrink-0"
            style={{ color: "var(--t-faint)" }}
          >
            <X size={12} />
          </button>
        </div>
        <input
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          placeholder="Шаблон заголовка задачи"
          className="w-full text-[12px] bg-white/[0.06] border border-white/[0.1] rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-500/40"
          style={{ color: "var(--t-secondary)" }}
        />
        <textarea
          value={editDesc}
          onChange={(e) => setEditDesc(e.target.value)}
          placeholder="Описание (необязательно)"
          rows={2}
          className="w-full text-[12px] bg-white/[0.06] border border-white/[0.1] rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-500/40 resize-none"
          style={{ color: "var(--t-secondary)" }}
        />
        <Select
          value={editCatId ?? ""}
          onChange={(v) => setEditCatId(v ? Number(v) : null)}
          options={catOptions}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] hover:bg-white/[0.02] transition-colors group/row">
      <div className="flex-1 min-w-0">
        <p
          className="text-[14px] font-medium truncate"
          style={{ color: "var(--t-primary)" }}
        >
          {preset.name}
        </p>
        <p
          className="text-[12px] truncate"
          style={{ color: "var(--t-muted)" }}
        >
          {preset.title_template}
          {categoryName && (
            <span
              className="ml-2 text-[11px]"
              style={{ color: "var(--t-faint)" }}
            >
              · {categoryName}
            </span>
          )}
        </p>
      </div>
      <div className="flex gap-1 shrink-0 items-center">
        <button
          onClick={() => move({ id: preset.id, direction: "up" })}
          disabled={isFirst}
          className={clsx(
            btnBase,
            "opacity-0 group-hover/row:opacity-100"
          )}
          style={{ color: "var(--t-faint)" }}
          title="Выше"
        >
          <ChevronUp size={13} />
        </button>
        <button
          onClick={() => move({ id: preset.id, direction: "down" })}
          disabled={isLast}
          className={clsx(
            btnBase,
            "opacity-0 group-hover/row:opacity-100"
          )}
          style={{ color: "var(--t-faint)" }}
          title="Ниже"
        >
          <ChevronDown size={13} />
        </button>
        <button
          onClick={startEdit}
          className={clsx(
            btnBase,
            "opacity-0 group-hover/row:opacity-100"
          )}
          style={{ color: "var(--t-faint)" }}
          title="Изменить"
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={toggleActive}
          className={clsx(
            "flex items-center gap-1 py-1 px-2 rounded-lg border text-[11px] transition-all",
            preset.is_active
              ? "border-white/[0.07] hover:bg-amber-500/10 hover:border-amber-500/20 hover:text-amber-400"
              : "border-white/[0.07] hover:bg-emerald-500/10 hover:border-emerald-500/20 hover:text-emerald-400"
          )}
          style={{ color: "var(--t-faint)" }}
          title={preset.is_active ? "Деактивировать" : "Активировать"}
        >
          {preset.is_active ? (
            <>
              <ToggleRight size={11} />
              <span>Откл.</span>
            </>
          ) : (
            <>
              <ToggleLeft size={11} />
              <span>Вкл.</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ── AddPresetForm ─────────────────────────────────────────────────────────────

function AddPresetForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [titleTpl, setTitleTpl] = useState("");
  const [desc, setDesc] = useState("");
  const [catId, setCatId] = useState<number | null>(null);

  const { mutate: create, isPending } = useCreatePreset();
  const { data: categories = [] } = useWorkCategories();

  const catOptions: SelectOption[] = [
    { value: "", label: "— Без категории —" },
    ...categories.filter((c) => !c.is_archived).map((c) => ({
      value: String(c.category_id),
      label: `${c.emoji ? c.emoji + " " : ""}${c.title}`,
    })),
  ];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    const t = titleTpl.trim();
    if (!n || !t) return;
    create(
      {
        name: n,
        title_template: t,
        description_template: desc.trim() || null,
        default_task_category_id: catId,
      },
      {
        onSuccess: () => {
          setName("");
          setTitleTpl("");
          setDesc("");
          setCatId(null);
          onDone();
        },
      }
    );
  }

  return (
    <form
      onSubmit={submit}
      className="px-4 py-3 bg-white/[0.03] border-t border-white/[0.06] space-y-2"
    >
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название шаблона"
          className="flex-1 text-[13px] bg-white/[0.06] border border-white/[0.1] rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500/50"
          style={{ color: "var(--t-primary)" }}
          autoFocus
        />
        <button
          type="submit"
          disabled={isPending || !name.trim() || !titleTpl.trim()}
          className="text-[12px] font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg px-3 py-1.5 transition-colors shrink-0"
        >
          {isPending ? "..." : "Добавить"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.08] transition-colors shrink-0"
          style={{ color: "var(--t-faint)" }}
        >
          <X size={13} />
        </button>
      </div>
      <input
        value={titleTpl}
        onChange={(e) => setTitleTpl(e.target.value)}
        placeholder="Шаблон заголовка задачи"
        className="w-full text-[12px] bg-white/[0.06] border border-white/[0.1] rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500/50"
        style={{ color: "var(--t-secondary)" }}
      />
      <textarea
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="Описание (необязательно)"
        rows={2}
        className="w-full text-[12px] bg-white/[0.06] border border-white/[0.1] rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500/50 resize-none"
        style={{ color: "var(--t-secondary)" }}
      />
      <Select
        value={catId ?? ""}
        onChange={(v) => setCatId(v ? Number(v) : null)}
        options={catOptions}
      />
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TaskPresetsPage() {
  const [tab, setTab] = useState<"active" | "inactive">("active");
  const [showAddForm, setShowAddForm] = useState(false);

  const { data, isLoading, isError, error } = useAllPresets();
  const { data: categories = [] } = useWorkCategories();

  const allPresets = data ?? [];

  const catMap = Object.fromEntries(
    categories.map((c) => [c.category_id, c])
  );

  const visible = allPresets.filter((p) =>
    tab === "active" ? p.is_active : !p.is_active
  );

  const activeCount = allPresets.filter((p) => p.is_active).length;
  const inactiveCount = allPresets.filter((p) => !p.is_active).length;

  const tabBtn = (key: "active" | "inactive", label: string, count: number) => (
    <button
      onClick={() => {
        setTab(key);
        setShowAddForm(false);
      }}
      className={clsx(
        "px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors",
        tab === key
          ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30"
          : "border border-transparent hover:bg-white/[0.05]"
      )}
      style={{ color: tab === key ? undefined : "var(--t-secondary)" }}
    >
      {label}
      <span
        className="ml-1.5 text-[11px]"
        style={{ color: tab === key ? "var(--t-muted)" : "var(--t-faint)" }}
      >
        {count}
      </span>
    </button>
  );

  return (
    <>
      <AppTopbar
        title="Шаблоны задач"
        subtitle="Быстрое заполнение формы создания задачи"
      />

      <main className="flex-1 overflow-auto p-3 md:p-6 w-full">
        {/* Tabs */}
        <div className="flex items-center gap-2 mb-4">
          {tabBtn("active", "Активные", activeCount)}
          {tabBtn("inactive", "Неактивные", inactiveCount)}
        </div>

        {/* Loading skeleton */}
        {isLoading && (
          <div className="space-y-px">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-14 bg-white/[0.03] rounded animate-pulse mb-px"
              />
            ))}
          </div>
        )}

        {isError && (
          <div className="text-center py-12">
            <p className="text-red-400/70 text-sm">Не удалось загрузить шаблоны</p>
            {error && <p className="text-[11px] text-white/30 mt-2">{String(error)}</p>}
          </div>
        )}

        {!isLoading && !isError && (
          <div className="bg-slate-50 dark:bg-white/[0.03] border-[1.5px] border-slate-300 dark:border-white/[0.09] rounded-2xl overflow-hidden">
            {visible.length === 0 ? (
              <div
                className="py-12 text-center text-sm"
                style={{ color: "var(--t-muted)" }}
              >
                {tab === "active"
                  ? "Нет активных шаблонов"
                  : "Нет неактивных шаблонов"}
              </div>
            ) : (
              <div>
                {visible.map((preset, idx) => (
                  <PresetRow
                    key={preset.id}
                    preset={preset}
                    isFirst={idx === 0}
                    isLast={idx === visible.length - 1}
                    categoryName={
                      preset.default_task_category_id
                        ? catMap[preset.default_task_category_id]?.title ?? null
                        : null
                    }
                  />
                ))}
              </div>
            )}

            {tab === "active" && (
              showAddForm ? (
                <AddPresetForm onDone={() => setShowAddForm(false)} />
              ) : (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-[13px] hover:bg-white/[0.03] transition-colors border-t border-white/[0.05]"
                  style={{ color: "var(--t-faint)" }}
                >
                  <Plus size={13} />
                  Добавить шаблон
                </button>
              )
            )}
          </div>
        )}
      </main>
    </>
  );
}
