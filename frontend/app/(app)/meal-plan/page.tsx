"use client";

import { useState, useRef } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, ShoppingCart, Search, BookOpen, Calendar } from "lucide-react";
import { clsx } from "clsx";
import { useMealPlan, useUpsertMealEntry, useDeleteMealEntry, type MealEntry } from "@/hooks/useMealPlan";
import { useDishes, useDeleteDish, useMealPlanToList, type Dish } from "@/hooks/useDishes";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Skeleton } from "@/components/primitives/Skeleton";
import { DishModal } from "@/components/modals/DishModal";

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const SLOTS: { key: string; label: string }[] = [
  { key: "breakfast", label: "Завтрак" },
  { key: "snack",     label: "Перекус" },
  { key: "lunch",     label: "Обед" },
  { key: "dinner",    label: "Ужин" },
];

const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: "Завтрак",
  snack: "Перекус",
  lunch: "Обед",
  dinner: "Ужин",
};

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  date.setHours(0, 0, 0, 0);
  return date;
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addWeeks(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n * 7);
  return result;
}

function weekLabel(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const fmtDay = (d: Date) => d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  if (monday.getMonth() === sunday.getMonth()) {
    return `${monday.getDate()}–${fmtDay(sunday)}`;
  }
  return `${fmtDay(monday)} – ${fmtDay(sunday)}`;
}

// ── MealCell ──────────────────────────────────────────────────────────────────

function MealCell({
  entry,
  weekStart,
  dayIndex,
  slot,
  dishes,
}: {
  entry: MealEntry | undefined;
  weekStart: string;
  dayIndex: number;
  slot: string;
  dishes: Dish[];
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(entry?.dish_name ?? "");
  const [showCatalog, setShowCatalog] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const { mutate: upsert } = useUpsertMealEntry();
  const { mutate: remove } = useDeleteMealEntry();
  const inputRef = useRef<HTMLInputElement>(null);
  const catalogRef = useRef<HTMLDivElement>(null);

  const filteredDishes = dishes.filter((d) =>
    !catalogQuery.trim() || d.name.toLowerCase().includes(catalogQuery.toLowerCase())
  );

  function commit(dishName?: string, dishId?: number) {
    const trimmed = (dishName ?? text).trim();
    if (trimmed && trimmed !== entry?.dish_name) {
      upsert({ week_start: weekStart, day_of_week: dayIndex, meal_slot: slot, dish_name: trimmed, dish_id: dishId ?? null });
    } else if (!trimmed && entry) {
      remove({ id: entry.id, week_start: weekStart });
    }
    setEditing(false);
    setShowCatalog(false);
  }

  function startEdit() {
    setText(entry?.dish_name ?? "");
    setEditing(true);
    setShowCatalog(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleRemove(e: React.MouseEvent) {
    e.stopPropagation();
    if (entry) remove({ id: entry.id, week_start: weekStart });
  }

  if (editing) {
    return (
      <div className="relative">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => { setText(e.target.value); setShowCatalog(e.target.value.length > 0 && dishes.length > 0); setCatalogQuery(e.target.value); }}
          onBlur={(e) => { if (!catalogRef.current?.contains(e.relatedTarget as Node)) { commit(); setShowCatalog(false); } }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { setText(entry?.dish_name ?? ""); setEditing(false); setShowCatalog(false); }
          }}
          className="w-full rounded-lg px-2 py-1.5 text-[12px] outline-none border border-indigo-400"
          style={{ background: "var(--t-input-bg, transparent)", color: "var(--t-primary)" }}
          placeholder="Блюдо или выберите из каталога…"
        />
        {showCatalog && filteredDishes.length > 0 && (
          <div
            ref={catalogRef}
            className="absolute left-0 top-full mt-1 w-full max-h-[200px] overflow-y-auto rounded-xl z-20 shadow-xl"
            style={{ background: "var(--app-card-bg)", border: "1px solid var(--app-border)" }}
          >
            {filteredDishes.map((d) => (
              <button
                key={d.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { commit(d.name, d.id); }}
                className="w-full text-left px-3 py-2 text-[12px] hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                style={{ color: "var(--t-primary)" }}
              >
                <span className="font-medium">{d.name}</span>
                {d.meal_types && (
                  <span className="ml-2 text-[11px]" style={{ color: "var(--t-faint)" }}>
                    {d.meal_types.split(",").map((t) => MEAL_TYPE_LABELS[t] ?? t).join(", ")}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={startEdit}
      className={clsx(
        "group w-full min-h-[36px] rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors relative",
        entry
          ? "bg-indigo-50 dark:bg-indigo-500/[0.08] hover:bg-indigo-100 dark:hover:bg-indigo-500/[0.14]"
          : "hover:bg-slate-100 dark:hover:bg-white/[0.06] border border-dashed border-slate-200 dark:border-white/[0.08]",
      )}
    >
      {entry ? (
        <>
          <span style={{ color: "var(--t-primary)" }}>{entry.dish_name}</span>
          <span
            onClick={handleRemove}
            className="absolute top-1 right-1 hidden group-hover:flex w-5 h-5 items-center justify-center rounded opacity-60 hover:opacity-100"
            style={{ color: "var(--t-faint)" }}
          >
            <Trash2 size={11} />
          </span>
        </>
      ) : (
        <span style={{ color: "var(--t-faint)" }}>+</span>
      )}
    </button>
  );
}

// ── DishCard ──────────────────────────────────────────────────────────────────

function DishCard({ dish, onEdit, onDelete }: { dish: Dish; onEdit: () => void; onDelete: () => void }) {
  const types = dish.meal_types ? dish.meal_types.split(",").map((t) => MEAL_TYPE_LABELS[t] ?? t) : [];

  return (
    <div
      className="rounded-xl p-3 flex flex-col gap-2"
      style={{ background: "var(--app-card-bg)", border: "1px solid var(--app-border)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[14px] truncate" style={{ color: "var(--t-primary)" }}>{dish.name}</div>
          {types.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {types.map((t) => (
                <span
                  key={t}
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                  style={{ background: "var(--app-accent-light, #EEF2FF)", color: "var(--app-accent, #6366F1)" }}
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <button type="button" onClick={onEdit} className="w-7 h-7 flex items-center justify-center rounded-lg nav-hover text-[13px]" style={{ color: "var(--t-muted)" }} title="Редактировать">
            ✏️
          </button>
          <button type="button" onClick={onDelete} className="w-7 h-7 flex items-center justify-center rounded-lg nav-hover" style={{ color: "var(--t-muted)" }} title="Удалить">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {dish.ingredients.length > 0 && (
        <div className="text-[12px]" style={{ color: "var(--t-secondary)" }}>
          {dish.ingredients.slice(0, 4).map((ing, i) => (
            <span key={ing.id}>
              {i > 0 && <span style={{ color: "var(--t-faint)" }}> · </span>}
              {ing.ingredient_name}
              {ing.quantity && <span style={{ color: "var(--t-faint)" }}> {ing.quantity}{ing.unit ? ` ${ing.unit}` : ""}</span>}
            </span>
          ))}
          {dish.ingredients.length > 4 && <span style={{ color: "var(--t-faint)" }}> +{dish.ingredients.length - 4}</span>}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = "plan" | "dishes";

export default function MealPlanPage() {
  const [tab, setTab] = useState<Tab>("plan");
  const [monday, setMonday] = useState(() => getMonday(new Date()));
  const weekStart = toISO(monday);
  const { data: entries, isLoading: planLoading } = useMealPlan(weekStart);
  const { data: dishes = [], isLoading: dishesLoading } = useDishes();
  const { mutate: deleteDish } = useDeleteDish();
  const { mutateAsync: toList, isPending: toListPending } = useMealPlanToList();

  const [dishModal, setDishModal] = useState<{ open: boolean; dish?: Dish }>({ open: false });
  const [catalogSearch, setCatalogSearch] = useState("");
  const [toListSuccess, setToListSuccess] = useState(false);

  const byKey = new Map<string, MealEntry>();
  for (const e of entries ?? []) {
    byKey.set(`${e.day_of_week}:${e.meal_slot}`, e);
  }

  const today = toISO(new Date());
  const todayIndex = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; })();
  const isCurrentWeek = weekStart === toISO(getMonday(new Date()));

  const filteredDishes = dishes.filter((d) =>
    !catalogSearch.trim() || d.name.toLowerCase().includes(catalogSearch.toLowerCase())
  );

  async function handleToList() {
    try {
      await toList({ week_start: weekStart });
      setToListSuccess(true);
      setTimeout(() => setToListSuccess(false), 3000);
    } catch {
      // ignore
    }
  }

  return (
    <>
      <PageHeader
        title="Меню на неделю"
        actions={
          <div className="flex items-center gap-2">
            {tab === "plan" && (
              <>
                <button
                  onClick={() => setMonday((m) => addWeeks(m, -1))}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border transition-colors hover:bg-slate-100 dark:hover:bg-white/[0.08]"
                  style={{ borderColor: "var(--app-border)", color: "var(--t-muted)" }}
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-[13px] font-medium min-w-[130px] text-center" style={{ color: "var(--t-primary)" }}>
                  {weekLabel(monday)}
                </span>
                <button
                  onClick={() => setMonday((m) => addWeeks(m, 1))}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border transition-colors hover:bg-slate-100 dark:hover:bg-white/[0.08]"
                  style={{ borderColor: "var(--app-border)", color: "var(--t-muted)" }}
                >
                  <ChevronRight size={16} />
                </button>
                {!isCurrentWeek && (
                  <button
                    onClick={() => setMonday(getMonday(new Date()))}
                    className="text-[12px] font-medium px-2.5 py-1 rounded-lg transition-colors hover:bg-slate-100 dark:hover:bg-white/[0.08]"
                    style={{ color: "var(--t-muted)" }}
                  >
                    Сегодня
                  </button>
                )}
                <button
                  onClick={handleToList}
                  disabled={toListPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.06] disabled:opacity-60"
                  style={{ borderColor: "var(--app-border)", color: toListSuccess ? "#22c55e" : "var(--t-secondary)" }}
                  title="Собрать список покупок из блюд этой недели"
                >
                  <ShoppingCart size={14} />
                  {toListSuccess ? "Создан!" : "В покупки"}
                </button>
              </>
            )}
            {tab === "dishes" && (
              <button
                onClick={() => setDishModal({ open: true })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white"
                style={{ background: "var(--app-accent-gradient)" }}
              >
                <Plus size={14} />
                Новое блюдо
              </button>
            )}
          </div>
        }
      />

      {/* Tab bar */}
      <div className="px-4 md:px-6 pt-1 pb-0 flex gap-1 shrink-0">
        <TabBtn active={tab === "plan"} onClick={() => setTab("plan")} icon={<Calendar size={14} />}>
          Меню
        </TabBtn>
        <TabBtn active={tab === "dishes"} onClick={() => setTab("dishes")} icon={<BookOpen size={14} />}>
          Блюда {dishes.length > 0 && <span className="ml-1 text-[10px]">({dishes.length})</span>}
        </TabBtn>
      </div>

      {/* Plan tab */}
      {tab === "plan" && (
        <main className="flex-1 p-3 md:p-6 overflow-x-auto">
          {planLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} variant="rect" className="h-12 rounded-xl" />)}
            </div>
          ) : (
            <table className="w-full border-collapse" style={{ minWidth: 560 }}>
              <thead>
                <tr>
                  <th className="w-20 text-left pb-2 pr-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t-faint)" }}>
                      Приём
                    </span>
                  </th>
                  {DAYS.map((day, i) => (
                    <th key={i} className="pb-2 px-1 text-center">
                      <span
                        className={clsx("text-[12px] font-bold", isCurrentWeek && i === todayIndex ? "text-indigo-500" : "")}
                        style={!(isCurrentWeek && i === todayIndex) ? { color: "var(--t-muted)" } : undefined}
                      >
                        {day}
                      </span>
                      {isCurrentWeek && i === todayIndex && (
                        <div className="w-1 h-1 rounded-full bg-indigo-500 mx-auto mt-0.5" />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SLOTS.map(({ key, label }) => (
                  <tr key={key}>
                    <td className="py-1 pr-3 align-top">
                      <span className="text-[12px] font-medium" style={{ color: "var(--t-faint)" }}>{label}</span>
                    </td>
                    {DAYS.map((_, dayIdx) => (
                      <td key={dayIdx} className="py-1 px-1 align-top">
                        <MealCell
                          entry={byKey.get(`${dayIdx}:${key}`)}
                          weekStart={weekStart}
                          dayIndex={dayIdx}
                          slot={key}
                          dishes={dishes}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </main>
      )}

      {/* Dishes tab */}
      {tab === "dishes" && (
        <main className="flex-1 p-3 md:p-6 overflow-y-auto">
          {/* Search */}
          <div className="relative mb-4">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--t-faint)" }} />
            <input
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder="Поиск по блюдам…"
              className="w-full rounded-xl pl-9 pr-3 py-2 text-[13px] outline-none border focus:border-indigo-400"
              style={{ background: "var(--app-card-bg)", borderColor: "var(--app-border)", color: "var(--t-primary)" }}
            />
          </div>

          {dishesLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} variant="rect" className="h-24 rounded-xl" />)}
            </div>
          ) : filteredDishes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <BookOpen size={40} className="mb-3 opacity-20" style={{ color: "var(--t-muted)" }} />
              <p className="text-[14px] font-medium" style={{ color: "var(--t-secondary)" }}>
                {catalogSearch ? "Блюда не найдены" : "Нет блюд в каталоге"}
              </p>
              {!catalogSearch && (
                <button
                  onClick={() => setDishModal({ open: true })}
                  className="mt-3 flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold text-white"
                  style={{ background: "var(--app-accent-gradient)" }}
                >
                  <Plus size={14} />
                  Добавить первое блюдо
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredDishes.map((dish) => (
                <DishCard
                  key={dish.id}
                  dish={dish}
                  onEdit={() => setDishModal({ open: true, dish })}
                  onDelete={() => { if (confirm(`Удалить "${dish.name}"?`)) deleteDish(dish.id); }}
                />
              ))}
            </div>
          )}
        </main>
      )}

      {dishModal.open && (
        <DishModal
          dish={dishModal.dish}
          onClose={() => setDishModal({ open: false })}
          onSaved={() => setDishModal({ open: false })}
        />
      )}
    </>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors",
        active ? "nav-active" : "nav-hover"
      )}
      style={{ color: active ? "var(--app-accent-ink)" : "var(--t-secondary)" }}
    >
      {icon}
      {children}
    </button>
  );
}
