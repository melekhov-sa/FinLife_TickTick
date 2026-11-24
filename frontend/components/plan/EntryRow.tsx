"use client";

/**
 * Строка записи в «Плане» и её меню действий.
 *
 * Вынесено из page.tsx, где было 1667 строк. Три бага этой осени жили
 * именно здесь и ловились тяжело: невидимая в светлой теме кнопка, меню,
 * уехавшее за край экрана, и меню, обрезанное свайп-контейнером.
 * В отдельном файле они хотя бы видны целиком.
 */

import { useDraggable, type DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  GripVertical,
  Minus,
  MoreVertical,
  Play,
  SkipForward,
  Trash2,
} from "lucide-react";
import { clsx } from "clsx";
import { Popover } from "@/components/primitives/Popover";
import { SwipeRow } from "@/components/primitives/SwipeRow";
import { useIncrementHabitToday, useDecrementHabitToday } from "@/hooks/useHabits";
import { isCompletable } from "@/lib/completion";
import { pluralizeYears } from "@/lib/utils";
import {
  ENTRY_GROUP_STRIPE,
  entryGroupType,
  type PlanEntry,
} from "@/components/plan/types";

interface RowMenuProps {
  entry: PlanEntry;
  onReschedule: () => void;
  onDeleteTask: () => void;
  onSkipTaskOcc: () => void;
  onSkipEvent: () => void;
  onExecuteOp: () => void;
  onSkipOp: () => void;
}

function RowMenu({
  entry,
  onReschedule,
  onDeleteTask,
  onSkipTaskOcc,
  onSkipEvent,
  onExecuteOp,
  onSkipOp,
}: RowMenuProps) {
  const isTask = entry.kind === 'task';
  const isTaskOcc = entry.kind === 'task_occ';
  const isChained = entry.meta.is_chained === true;
  const isOp = entry.kind === 'planned_op';
  const isEvent = entry.kind === 'event';

  const hasMenu = (isTask || isTaskOcc || isOp || isEvent) && !entry.is_done;
  if (!hasMenu) return null;

  const itemCls = 'w-full text-left px-4 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.06]';
  const normalStyle: React.CSSProperties = { color: 'var(--t-primary)', fontSize: 'var(--fs-sm, 13px)' };
  const dangerStyle: React.CSSProperties = { color: 'rgb(239 68 68)', fontSize: 'var(--fs-sm, 13px)' };

  return (
    <Popover
      side="bottom"
      align="end"
      closeOnClickInside
      className="!p-0 w-44"   /* без overflow-hidden: он перебивал прокрутку меню */
      trigger={
        <button
          onClick={(e) => e.stopPropagation()}
          className="md:opacity-0 md:group-hover/row:opacity-100 w-6 h-6 flex items-center justify-center rounded transition-all hover:bg-slate-100 dark:hover:bg-white/[0.08]"
          style={{ color: 'var(--t-faint)' }}
          title="Действия"
        >
          <MoreVertical size={14} />
        </button>
      }
    >
      {isTask && (
        <>
          <button className={itemCls} style={normalStyle} onClick={onReschedule}>
            <CalendarDays size={13} className="inline mr-2 opacity-60" />
            Перенести
          </button>
          {/* «Архивировать» здесь было, но срабатывало мгновенно, без
              подтверждения и без отмены: задача молча исчезала со страницы,
              и это читалось как баг. Архивация задачи осталась в карточке
              задачи (TaskDetailPanel) и на странице «Задачи».
              Удаление необратимо, поэтому со спросом: ненужную задачу
              раньше приходилось закрывать как выполненную, что портило
              статистику. */}
          <button className={itemCls} style={dangerStyle} onClick={onDeleteTask}>
            <Trash2 size={12} className="inline mr-2 opacity-60" />
            Удалить
          </button>
        </>
      )}

      {isTaskOcc && (
        <>
          <button className={itemCls} style={normalStyle} onClick={onReschedule}>
            <CalendarDays size={13} className="inline mr-2 opacity-60" />
            Перенести
          </button>
          {/* У цепочечного повторения активна ровно одна задача, и следующая
              рождается только из её закрытия. Пропуск оборвал бы цепочку
              молча — не выполнено, не запланировано, напоминать нечему.
              Не нужна сейчас — переноси; не нужна совсем — выключи
              повторение на странице «Повторяющиеся задачи». */}
          {!isChained && (
            <button className={itemCls} style={dangerStyle} onClick={onSkipTaskOcc}>
              <SkipForward size={12} className="inline mr-2 opacity-60" />
              Пропустить
            </button>
          )}
        </>
      )}

      {isOp && (
        <>
          <button className={itemCls} style={normalStyle} onClick={onExecuteOp}>
            <Play size={11} className="inline mr-2 opacity-60 fill-current" />
            Выполнить
          </button>
          <button className={itemCls} style={dangerStyle} onClick={onSkipOp}>
            <SkipForward size={12} className="inline mr-2 opacity-60" />
            Пропустить
          </button>
        </>
      )}

      {isEvent && (
        <button className={itemCls} style={dangerStyle} onClick={onSkipEvent}>
          <SkipForward size={12} className="inline mr-2 opacity-60" />
          Пропустить
        </button>
      )}
    </Popover>
  );
}

function DragHandle({ attributes, listeners }: { attributes: DraggableAttributes; listeners: SyntheticListenerMap | undefined }) {
  return (
    <button
      {...attributes}
      {...listeners}
      // На телефоне ручка видна всегда (наводить нечем), на ПК —
      // только при наведении. Раньше здесь стояли и opacity-0, и
      // opacity-30 одновременно, и побеждал тот, что ниже в CSS.
      className="shrink-0 w-5 h-5 flex items-center justify-center rounded opacity-30 md:opacity-0 md:group-hover/row:opacity-50 md:touch-none cursor-grab active:cursor-grabbing transition-opacity"
      style={{ color: "var(--t-faint)", touchAction: "none" }}
      tabIndex={-1}
      aria-label="Перетащить"
    >
      <GripVertical size={12} />
    </button>
  );
}

export function EntryRow({
  entry,
  hideOverdueBadge,
  onComplete,
  onCompleteEvent,
  onReschedule,
  onExecuteOp,
  onSkipOp,
  onDeleteTask,
  onSkipTaskOcc,
  onSkipEvent,
  onEntryClick,
  isCompleting,
}: {
  entry: PlanEntry;
  /** Внутри блока «Просрочено» бейдж на каждой строке дублирует
   *  заголовок блока и съедает ширину названия. */
  hideOverdueBadge?: boolean;
  onComplete: (entry: PlanEntry) => void;
  onCompleteEvent: (entry: PlanEntry) => void;
  onReschedule: (entry: PlanEntry) => void;
  onExecuteOp: (entry: PlanEntry) => void;
  onSkipOp: (entry: PlanEntry) => void;
  onDeleteTask: (entry: PlanEntry) => void;
  onSkipTaskOcc: (entry: PlanEntry) => void;
  onSkipEvent: (entry: PlanEntry) => void;
  onEntryClick?: (entry: PlanEntry) => void;
  isCompleting?: boolean;
}) {
  const canComplete = isCompletable(entry.kind) && !entry.is_done;
  const isOp = entry.kind === "planned_op";
  const opKind = entry.meta.op_kind as string | undefined;
  const amountFormatted = entry.meta.amount_formatted as string | undefined;

  // Counter habit (e.g. «1/2 таблеток») — same look/controls as on the dashboard.
  const isCounterHabit = entry.kind === "habit" && entry.meta.habit_type === "counter";
  const habitId = entry.meta.habit_id as number | undefined;
  const counterCount = (entry.meta.completion_count as number) ?? 0;
  const counterTarget = (entry.meta.target_count as number) ?? 1;
  const counterUnit = entry.meta.unit_label as string | null | undefined;
  const { mutate: incrementHabit } = useIncrementHabitToday();
  const { mutate: decrementHabit } = useDecrementHabitToday();

  const canDrag = (entry.kind === "task" || entry.kind === "event" || entry.kind === "planned_op") && !entry.is_done;
  const draggableId = `${entry.kind}-${entry.id}`;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: draggableId,
    disabled: !canDrag,
  });

  // Свайп вправо — выполнить; влево — перенести (только задачи)
  const swipeComplete = !entry.is_done && (canComplete || (isCounterHabit && !!habitId) || isOp)
    ? {
        icon: <span className="text-[18px] font-black leading-none">✓</span>,
        color: "var(--c-success-ink)",
        onTrigger: () => {
          if (isCounterHabit && habitId) incrementHabit(habitId);
          else if (isOp) onExecuteOp(entry);
          else if (!isCompleting) onComplete(entry);
        },
      }
    : undefined;
  const swipeReschedule = !entry.is_done && (entry.kind === "task" || entry.kind === "task_occ")
    ? {
        icon: <span className="text-[15px] leading-none">📅</span>,
        color: "var(--c-warning-ink)",
        onTrigger: () => onReschedule(entry),
      }
    : undefined;

  return (
    <SwipeRow left={swipeComplete} right={swipeReschedule}>
    <div
      ref={setNodeRef}
      className={clsx(
        "flex items-center gap-2.5 py-[7px] border-t first:border-0 transition-colors cursor-default group/row",
        "border-[var(--app-border)] hover:bg-slate-50/50 dark:hover:bg-white/[0.03]",
        isCompleting && "task-row-completing",
        isDragging && "opacity-30",
      )}
    >
      {/* Цвет типа дела */}
      <span
        aria-hidden
        className="w-[2.5px] self-stretch rounded-full shrink-0 my-0.5"
        style={{
          background: ENTRY_GROUP_STRIPE[entryGroupType(entry.kind)],
          opacity: entry.is_done ? 0.25 : 0.7,
        }}
      />

      {/* Checkbox / icon */}
      <div className="shrink-0">
        {isCounterHabit && !entry.is_done && habitId ? (
          <button
            onClick={() => incrementHabit(habitId)}
            className="w-[16px] h-[16px] rounded-[5px] border-[1.5px] border-violet-400 hover:bg-violet-500/15 transition-colors text-violet-400 text-[10px] font-bold flex items-center justify-center"
            title="+1"
            aria-label="+1"
          >
            +
          </button>
        ) : canComplete ? (
          <button
            onClick={() => { if (!isCompleting) onComplete(entry); }}
            className={clsx(
              "tap-halo relative w-[16px] h-[16px] rounded-full border-[1.5px] transition-all hover:scale-110 flex items-center justify-center",
              entry.is_overdue
                ? "border-red-400 hover:bg-red-500/20"
                : "border-violet-300/70 dark:border-violet-400/40 hover:bg-violet-500/15 hover:border-violet-400",
              isCompleting && "task-check-completing",
            )}
            title="Отметить как выполненное"
          >
            <span className="task-check-mark" aria-hidden="true">✓</span>
          </button>
        ) : entry.is_done && isCompletable(entry.kind) ? (
          <div className="w-[16px] h-[16px] rounded-full bg-emerald-500 flex items-center justify-center">
            <span className="text-[8px] text-[#fff] font-bold">✓</span>
          </div>
        ) : isOp ? (
          <button
            onClick={() => onExecuteOp(entry)}
            className="w-[16px] h-[16px] rounded-full border-[1.5px] border-amber-300 dark:border-amber-400/50 shrink-0 transition-all hover:bg-amber-50 dark:hover:bg-amber-400/10 hover:border-amber-400 hover:scale-110"
            title="Выполнить операцию"
          />
        ) : entry.kind === "event" && entry.meta.completion_mode === "manual" ? (
          <button
            onClick={() => onCompleteEvent(entry)}
            className="w-[16px] h-[16px] shrink-0 transition-colors"
            style={{ color: entry.is_done ? "var(--color-emerald-500, #10b981)" : "var(--t-faint)" }}
            title={entry.is_done ? "Отменить выполнение" : "Отметить как выполненное"}
          >
            {entry.is_done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
          </button>
        ) : entry.kind === "event" ? (
          <div className="w-[16px] h-[16px] shrink-0" aria-hidden="true" />
        ) : (
          <div className="w-[16px] h-[16px] rounded-full border-[1.5px] border-slate-200 dark:border-white/20 shrink-0" />
        )}
      </div>

      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => isOp ? onExecuteOp(entry) : onEntryClick?.(entry)}>
        <div className="flex items-center gap-1.5">
          <span className={clsx(
            "task-title-text text-[14px] font-medium leading-snug line-clamp-2",
            entry.is_done ? "line-through decoration-slate-300 dark:decoration-white/20" : "",
            entry.is_overdue && !entry.is_done ? "text-red-500 dark:text-red-400/90" : ""
          )} style={{ color: entry.is_done ? "var(--t-muted)" : (entry.is_overdue ? undefined : "var(--t-primary)") }}>
            {entry.time && (
              <span
                className="text-[11px] font-semibold tabular-nums px-1.5 py-px rounded-md mr-1.5 align-middle inline-block"
                style={{
                  background: entry.is_done ? "var(--app-border-subtle, var(--app-border))" : "var(--app-accent-weak)",
                  color: entry.is_done ? "var(--t-faint)" : "var(--app-accent)",
                }}
              >
                {String(entry.time).slice(0, 5)}
              </span>
            )}
            {entry.category_emoji && <span className="mr-0.5">{entry.category_emoji}</span>}
            {entry.title}
          </span>

          {/* Only useful meta — no kind chips */}
          {isOp && amountFormatted && (
            <span className={clsx(
              "text-[12px] font-semibold tabular-nums shrink-0",
              opKind === "INCOME" ? "money-income" : "money-expense"
            )}>
              {opKind === "INCOME" ? "+" : "\u2212"}{amountFormatted} ₽
            </span>
          )}

          {entry.kind === "event" && entry.meta.person_age != null && (
            <span className={clsx(
              "text-[11px] font-semibold shrink-0",
              entry.meta.is_jubilee ? "text-amber-400" : "text-pink-400",
            )}>
              {entry.meta.is_jubilee ? "🎉 " : ""}{String(entry.meta.person_age)} {pluralizeYears(entry.meta.person_age as number)}
            </span>
          )}

          {isCounterHabit && (
            <span className={clsx(
              "text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded border shrink-0",
              entry.is_done
                ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20"
                : "text-violet-500 bg-violet-500/10 border-violet-500/20"
            )}>
              {counterCount}/{counterTarget}{counterUnit ? ` ${counterUnit}` : ""}
            </span>
          )}

          {entry.kind === "habit" && Boolean(entry.meta.current_streak) && (
            <span className="text-[11px] shrink-0" style={{ color: "var(--t-muted)" }}>
              🔥{String(entry.meta.current_streak)}
            </span>
          )}

          {entry.is_overdue && !entry.is_done && !hideOverdueBadge && (
            <span className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-500/[0.12] px-1 py-px rounded shrink-0">
              просроч.
            </span>
          )}

        </div>
      </div>

      {isCounterHabit && counterCount > 0 && habitId && (
        <button
          onClick={() => decrementHabit(habitId)}
          className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md md:opacity-0 md:group-hover/row:opacity-100 transition-all hover:bg-slate-100 dark:hover:bg-white/[0.06]"
          style={{ color: "var(--t-faint)" }}
          title="Отменить +1"
          aria-label="Отменить +1"
        >
          <Minus size={12} />
        </button>
      )}

      <div className="shrink-0">
        <RowMenu
          entry={entry}
          onReschedule={() => onReschedule(entry)}
          onDeleteTask={() => onDeleteTask(entry)}
          onSkipTaskOcc={() => onSkipTaskOcc(entry)}
          onSkipEvent={() => onSkipEvent(entry)}
          onExecuteOp={() => onExecuteOp(entry)}
          onSkipOp={() => onSkipOp(entry)}
        />
      </div>

      {canDrag && (
        <DragHandle
          attributes={attributes}
          listeners={listeners}
        />
      )}
    </div>
    </SwipeRow>
  );
}
