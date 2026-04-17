"use client";

import { clsx } from "clsx";
import type { HabitItem } from "@/types/api";

interface Props {
  habit: HabitItem;
  onComplete: () => void;
  onOpen: () => void;
  animateBump?: boolean;
  animateGlow?: boolean;
}

function streakLabel(n: number): string {
  if (n === 0) return "";
  if (n === 1) return "1 день подряд";
  if (n >= 5 && n <= 20) return `${n} дней подряд`;
  const last = n % 10;
  if (last === 1) return `${n} день подряд`;
  if (last >= 2 && last <= 4) return `${n} дня подряд`;
  return `${n} дней подряд`;
}

function streakBadgeCls(n: number): string {
  if (n >= 30) return "text-emerald-300 bg-emerald-500/20 border-emerald-500/30";
  if (n >= 14) return "text-amber-300 bg-amber-500/15 border-amber-500/25";
  if (n >= 7)  return "text-white/75 bg-white/[0.08] border-white/[0.12]";
  return "text-white/50 bg-white/[0.05] border-white/[0.08]";
}

export function DoTodayCard({ habit, onComplete, onOpen, animateBump, animateGlow }: Props) {
  const hasStreak = habit.current_streak > 0;

  function handleClick() {
    onComplete();
  }

  function handleDetailClick(e: React.MouseEvent) {
    e.stopPropagation();
    onOpen();
  }

  return (
    <div
      onClick={handleClick}
      className={clsx(
        "group relative bg-white/[0.06] border border-white/[0.12] rounded-2xl p-4 cursor-pointer hover:bg-white/[0.09] hover:border-white/[0.18] active:scale-[0.99] transition-all select-none",
        animateGlow && "habit-card-glow"
      )}
    >
      {/* Row 1: emoji + title + streak */}
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0 leading-none mt-0.5">{habit.category_emoji ?? "🔄"}</span>
        <div className="flex-1 min-w-0">
          <p
            className="font-semibold leading-snug"
            style={{ fontSize: "var(--fs-title)", color: "var(--t-primary)" }}
          >
            {habit.title}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {hasStreak && (
              <span
                className={clsx(
                  "px-2 py-0.5 rounded-full border font-semibold",
                  streakBadgeCls(habit.current_streak),
                  animateBump && "habit-streak-bump"
                )}
                style={{ fontSize: "var(--fs-badge)" }}
              >
                🔥 {streakLabel(habit.current_streak)}
              </span>
            )}
            {habit.category_title && (
              <span style={{ fontSize: "var(--fs-caption)", color: "var(--t-faint)" }}>
                {habit.category_title}
              </span>
            )}
            {habit.reminder_time && (
              <span style={{ fontSize: "var(--fs-caption)", color: "var(--t-faint)" }}>
                ⏰ {habit.reminder_time}
              </span>
            )}
          </div>
        </div>
        {/* Detail button — does NOT trigger complete */}
        <button
          onClick={handleDetailClick}
          className="shrink-0 opacity-40 group-hover:opacity-100 transition-opacity w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/[0.10]"
          style={{ fontSize: "var(--fs-caption)", color: "var(--t-faint)" }}
          title="Подробнее"
        >
          ···
        </button>
      </div>

      {/* Row 2: 14-day bar */}
      <div className="flex gap-0.5 mt-3">
        {(habit.recent_days ?? []).map((done, i) => {
          const isRecent = i >= 7;
          return (
            <div
              key={i}
              className={clsx(
                "flex-1 rounded-sm transition-colors",
                isRecent ? "h-4" : "h-2.5",
                done
                  ? isRecent ? "bg-emerald-400/80" : "bg-emerald-500/50"
                  : isRecent ? "bg-white/[0.10]" : "bg-white/[0.06]"
              )}
              title={done ? "Выполнено" : "Не выполнено"}
            />
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span style={{ fontSize: "var(--fs-badge)", color: "var(--t-faint)" }}>14 дней</span>
        <span
          className="tabular-nums"
          style={{ fontSize: "var(--fs-badge)", color: "var(--t-faint)" }}
        >
          {(habit.recent_days ?? []).filter(Boolean).length} / 14
        </span>
      </div>

      {/* Tap hint */}
      <div className="mt-3 flex items-center justify-center">
        <span
          className="px-3 py-1 rounded-full bg-indigo-600/80 hover:bg-indigo-500 text-white font-medium transition-colors"
          style={{ fontSize: "var(--fs-caption)" }}
        >
          Нажми чтобы отметить
        </span>
      </div>
    </div>
  );
}
