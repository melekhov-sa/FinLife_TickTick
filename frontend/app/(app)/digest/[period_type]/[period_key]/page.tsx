"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  CheckSquare, TrendingUp, TrendingDown, Heart, Zap, Sparkles, ArrowLeft,
} from "lucide-react";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { useDigest, useDigestMarkViewed } from "@/hooks/useDigests";
import type { DigestDetail } from "@/types/api";

function StatRow({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/[0.05] last:border-0">
      <span className="text-[13px]" style={{ color: "var(--t-secondary)" }}>{label}</span>
      <span className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--t-primary)" }}>
        {value}{sub && <span className="font-normal text-[12px] ml-1" style={{ color: "var(--t-muted)" }}>{sub}</span>}
      </span>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] p-4" style={{ background: "rgba(255,255,255,0.02)" }}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-indigo-400 shrink-0" />
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--t-primary)" }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

function DigestContent({ digest }: { digest: DigestDetail }) {
  const { payload } = digest;
  const tasks = payload.tasks;
  const habits = payload.habits;
  const finance = payload.finance;
  const efficiency = payload.efficiency;
  const xp = payload.xp;
  const highlights = payload.highlights;

  const habitPct = Math.round(habits.completion_rate * 100);
  const balanceDelta = finance.balance_delta;

  return (
    <div className="space-y-4">
      {/* Tasks */}
      <Section title="Задачи" icon={CheckSquare}>
        <StatRow label="Выполнено" value={tasks.completed} />
        <StatRow label="Просрочено (открытые)" value={tasks.overdue_open} />
        <StatRow label="Перенесено" value={tasks.rescheduled} />
        {tasks.by_category_top.length > 0 && (
          <div className="mt-2 pt-2 border-t border-white/[0.05]">
            <p className="text-[11px] uppercase tracking-wider mb-2" style={{ color: "var(--t-faint)" }}>
              Топ категории
            </p>
            {tasks.by_category_top.map(([name, count]) => (
              <StatRow key={name} label={name} value={count} sub="задач" />
            ))}
          </div>
        )}
      </Section>

      {/* Habits */}
      <Section title="Привычки" icon={Heart}>
        <StatRow label="Выполнение" value={`${habitPct}%`} />
        {habits.longest_streak && (
          <StatRow
            label="Лучшая серия"
            value={habits.longest_streak.days}
            sub={`дн. — ${habits.longest_streak.name}`}
          />
        )}
        {habits.broken_streaks.length > 0 && (
          <div className="mt-2 pt-2 border-t border-white/[0.05]">
            <p className="text-[11px] uppercase tracking-wider mb-2" style={{ color: "var(--t-faint)" }}>
              Прерванные серии
            </p>
            {habits.broken_streaks.map((s) => (
              <StatRow key={s.name} label={s.name} value={s.days_before} sub="дн. до срыва" />
            ))}
          </div>
        )}
      </Section>

      {/* Finance */}
      <Section title="Финансы" icon={balanceDelta >= 0 ? TrendingUp : TrendingDown}>
        <StatRow label="Доходы" value={finance.income_total.toLocaleString("ru-RU")} sub="₽" />
        <StatRow label="Расходы" value={finance.expense_total.toLocaleString("ru-RU")} sub="₽" />
        <StatRow
          label="Баланс"
          value={(balanceDelta >= 0 ? "+" : "") + balanceDelta.toLocaleString("ru-RU")}
          sub="₽"
        />
        {finance.top_expense_category && (
          <StatRow
            label="Главная трата"
            value={finance.top_expense_category[1].toLocaleString("ru-RU")}
            sub={`₽ — ${finance.top_expense_category[0]}`}
          />
        )}
      </Section>

      {/* XP & Efficiency */}
      <Section title="Прогресс" icon={Zap}>
        <StatRow label="XP за неделю" value={`+${xp.gained}`} />
        <StatRow label="Уровень" value={xp.level_after} />
        <StatRow
          label="Эффективность"
          value={efficiency.score}
          sub={efficiency.delta_vs_prev !== 0
            ? `(${efficiency.delta_vs_prev >= 0 ? "+" : ""}${efficiency.delta_vs_prev} к прошлой)`
            : undefined}
        />
        {highlights.most_productive_day && (
          <StatRow
            label="Продуктивный день"
            value={highlights.most_productive_count}
            sub={`задач — ${new Date(highlights.most_productive_day).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}`}
          />
        )}
      </Section>

      {/* AI Comment */}
      {digest.ai_comment && (
        <Section title="Комментарий ИИ" icon={Sparkles}>
          <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--t-secondary)" }}>
            {digest.ai_comment}
          </p>
        </Section>
      )}
    </div>
  );
}

export default function DigestDetailPage() {
  const params = useParams<{ period_type: string; period_key: string }>();
  const router = useRouter();
  const { data: digest, isPending, isError } = useDigest(params.period_type, params.period_key);
  const { mutate: markViewed } = useDigestMarkViewed();

  // Mark as viewed once when the digest loads for the first time
  useEffect(() => {
    if (digest && !digest.viewed_at) {
      markViewed(digest.id);
    }
  }, [digest, markViewed]);

  return (
    <>
      <AppTopbar
        title={digest ? `Итоги ${digest.period_key}` : "Дайджест"}
        subtitle={
          digest
            ? `${new Date(digest.payload.period.from).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} — ${new Date(digest.payload.period.to).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}`
            : undefined
        }
        actions={
          <button
            onClick={() => router.push("/digest")}
            className="flex items-center gap-1.5 text-[13px] transition-opacity hover:opacity-75"
            style={{ color: "var(--t-muted)" }}
          >
            <ArrowLeft className="w-4 h-4" />
            Все итоги
          </button>
        }
      />

      <main className="flex-1 overflow-auto p-3 md:p-6">
        <div className="max-w-2xl mx-auto">
          {isPending && (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-32 rounded-2xl animate-pulse"
                  style={{ background: "rgba(255,255,255,0.03)" }}
                />
              ))}
            </div>
          )}

          {isError && (
            <p className="text-center py-12 text-[14px]" style={{ color: "var(--t-muted)" }}>
              Не удалось загрузить дайджест
            </p>
          )}

          {digest && <DigestContent digest={digest} />}
        </div>
      </main>
    </>
  );
}
