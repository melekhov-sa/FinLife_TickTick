"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  CheckSquare, TrendingUp, TrendingDown, Heart, Zap, Sparkles, ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { useDigest, useDigestMarkViewed } from "@/hooks/useDigests";
import type { DigestDetail } from "@/types/api";
import { Skeleton } from "@/components/primitives/Skeleton";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

function useCounterAnimation(target: number, duration: number = 1000): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion() || target === 0) {
      setValue(target);
      return;
    }
    setValue(0);
    startRef.current = null;

    const step = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      setValue(Math.round(easeOutQuart(progress) * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return value;
}

function useTypewriter(text: string | null, digestId: number): { displayed: string; done: boolean } {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!text) {
      setDisplayed("");
      setDone(true);
      return;
    }

    const storageKey = `digest-tw-${digestId}`;
    if (typeof window !== "undefined" && sessionStorage.getItem(storageKey) === "1") {
      setDisplayed(text);
      setDone(true);
      return;
    }

    if (prefersReducedMotion()) {
      setDisplayed(text);
      setDone(true);
      if (typeof window !== "undefined") sessionStorage.setItem(storageKey, "1");
      return;
    }

    setDisplayed("");
    setDone(false);

    const msPerChar = 40;
    let i = 0;

    const tick = () => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        setDone(true);
        if (typeof window !== "undefined") sessionStorage.setItem(storageKey, "1");
      } else {
        timerRef.current = setTimeout(tick, msPerChar);
      }
    };

    timerRef.current = setTimeout(tick, msPerChar);
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [text, digestId]);

  return { displayed, done };
}

function AnimatedNumber({ value, duration = 1000 }: { value: number; duration?: number }) {
  const animated = useCounterAnimation(value, duration);
  return <>{animated.toLocaleString("ru-RU")}</>;
}

function AnimatedSection({
  title,
  icon: Icon,
  children,
  index,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  index: number;
}) {
  const reduced = prefersReducedMotion();
  const delay = reduced ? 0 : index * 120;

  return (
    <div
      className="digest-section-animate rounded-2xl border border-white/[0.07] p-4 transition-all duration-200 hover:scale-[1.01] hover:shadow-lg"
      style={{
        background: "rgba(255,255,255,0.02)",
        opacity: reduced ? 1 : 0,
        animation: reduced
          ? undefined
          : `digest-fade-up 500ms cubic-bezier(0.4,0,0.2,1) ${delay}ms forwards`,
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-indigo-400 shrink-0" />
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--t-primary)" }}>
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

function StatRow({
  label,
  value,
  sub,
  animateValue,
  animateDuration,
}: {
  label: string;
  value: string | number;
  sub?: string;
  animateValue?: number;
  animateDuration?: number;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/[0.05] last:border-0">
      <span className="text-[13px]" style={{ color: "var(--t-secondary)" }}>
        {label}
      </span>
      <span
        className="text-[13px] font-semibold tabular-nums"
        style={{ color: "var(--t-primary)" }}
      >
        {animateValue !== undefined ? (
          <AnimatedNumber value={animateValue} duration={animateDuration ?? 1000} />
        ) : (
          value
        )}
        {sub && (
          <span
            className="font-normal text-[12px] ml-1"
            style={{ color: "var(--t-muted)" }}
          >
            {sub}
          </span>
        )}
      </span>
    </div>
  );
}

function AiSection({ digest, index }: { digest: DigestDetail; index: number }) {
  const { displayed, done } = useTypewriter(digest.ai_comment, digest.id);

  return (
    <AnimatedSection title="Комментарий ИИ" icon={Sparkles} index={index}>
      {digest.ai_comment ? (
        <p
          className="text-[13px] leading-relaxed whitespace-pre-wrap"
          style={{ color: "var(--t-secondary)" }}
        >
          {displayed}
          {!done && (
            <span
              className="inline-block w-[1px] h-[1em] ml-0.5 align-middle"
              style={{
                background: "var(--t-secondary)",
                animation: "digest-glow-pulse 1s ease-in-out infinite",
              }}
            />
          )}
        </p>
      ) : (
        <div className="flex items-start gap-2">
          <Sparkles className="w-4 h-4 mt-0.5 shrink-0 text-indigo-400/50" />
          <p className="text-[13px]" style={{ color: "var(--t-muted)" }}>
            AI-комментарий не сформирован.{" "}
            <Link
              href="/settings"
              className="underline underline-offset-2 hover:opacity-75 transition-opacity"
              style={{ color: "var(--t-secondary)" }}
            >
              Включи в настройках
            </Link>{" "}
            →
          </p>
        </div>
      )}
    </AnimatedSection>
  );
}

function DigestHero({ digest }: { digest: DigestDetail }) {
  const reduced = prefersReducedMotion();
  const from = new Date(digest.payload.period.from).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
  const to = new Date(digest.payload.period.to).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div
      className="relative rounded-2xl overflow-hidden p-5 mb-4"
      style={{
        background: "linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(139,92,246,0.15) 100%)",
        border: "1px solid rgba(99,102,241,0.25)",
        opacity: reduced ? 1 : 0,
        animation: reduced ? undefined : "digest-fade-up 500ms cubic-bezier(0.4,0,0.2,1) 0ms forwards",
      }}
    >
      {/* Radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 0%, rgba(139,92,246,0.18) 0%, transparent 70%)",
        }}
      />
      <div className="relative flex items-center gap-3">
        <Sparkles
          className="w-6 h-6 text-indigo-400 shrink-0"
          style={{
            animation: reduced ? undefined : "digest-glow-pulse 2s ease-in-out infinite",
          }}
        />
        <div>
          <p
            className="font-bold leading-tight"
            style={{ color: "var(--t-primary)", fontSize: "var(--fs-title, 22px)" }}
          >
            {digest.period_key}
          </p>
          <p
            className="mt-0.5"
            style={{ color: "var(--t-secondary)", fontSize: "var(--fs-sm, 13px)" }}
          >
            {from} — {to}
          </p>
        </div>
      </div>
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
  const effDeltaLabel =
    efficiency.delta_vs_prev !== 0
      ? `(${efficiency.delta_vs_prev >= 0 ? "+" : ""}${efficiency.delta_vs_prev} к прошлой)`
      : undefined;

  return (
    <div className="space-y-4">
      {/* Задачи */}
      <AnimatedSection title="Задачи" icon={CheckSquare} index={1}>
        <StatRow label="Выполнено" value={tasks.completed} animateValue={tasks.completed} animateDuration={800} />
        <StatRow label="Просрочено (открытые)" value={tasks.overdue_open} />
        <StatRow label="Перенесено" value={tasks.rescheduled} />
        {tasks.by_category_top.length > 0 && (
          <div className="mt-2 pt-2 border-t border-white/[0.05]">
            <p
              className="text-[11px] uppercase tracking-wider mb-2"
              style={{ color: "var(--t-faint)" }}
            >
              Топ категории
            </p>
            {tasks.by_category_top.map(([name, count]) => (
              <StatRow key={name} label={name} value={count} sub="задач" />
            ))}
          </div>
        )}
      </AnimatedSection>

      {/* Привычки */}
      <AnimatedSection title="Привычки" icon={Heart} index={2}>
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
            <p
              className="text-[11px] uppercase tracking-wider mb-2"
              style={{ color: "var(--t-faint)" }}
            >
              Прерванные серии
            </p>
            {habits.broken_streaks.map((s) => (
              <StatRow key={s.name} label={s.name} value={s.days_before} sub="дн. до срыва" />
            ))}
          </div>
        )}
      </AnimatedSection>

      {/* Финансы */}
      <AnimatedSection
        title="Финансы"
        icon={balanceDelta >= 0 ? TrendingUp : TrendingDown}
        index={3}
      >
        <StatRow
          label="Доходы"
          value={finance.income_total.toLocaleString("ru-RU")}
          animateValue={finance.income_total}
          animateDuration={1000}
          sub="₽"
        />
        <StatRow
          label="Расходы"
          value={finance.expense_total.toLocaleString("ru-RU")}
          animateValue={finance.expense_total}
          animateDuration={1000}
          sub="₽"
        />
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
      </AnimatedSection>

      {/* XP & Эффективность */}
      <AnimatedSection title="Прогресс" icon={Zap} index={4}>
        <StatRow
          label="XP за неделю"
          value={`+${xp.gained}`}
          animateValue={xp.gained}
          animateDuration={1200}
        />
        <StatRow label="Уровень" value={xp.level_after} />
        <StatRow label="Эффективность" value={efficiency.score} sub={effDeltaLabel} />
        {highlights.most_productive_day && (
          <StatRow
            label="Продуктивный день"
            value={highlights.most_productive_count}
            sub={`задач — ${new Date(highlights.most_productive_day).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}`}
          />
        )}
      </AnimatedSection>

      {/* AI комментарий */}
      <AiSection digest={digest} index={5} />
    </div>
  );
}

export default function DigestDetailPage() {
  const params = useParams<{ period_type: string; period_key: string }>();
  const router = useRouter();
  const { data: digest, isPending, isError } = useDigest(params.period_type, params.period_key);
  const { mutate: markViewed } = useDigestMarkViewed();

  useEffect(() => {
    if (digest && !digest.viewed_at) {
      markViewed(digest.id);
    }
  }, [digest, markViewed]);

  return (
    <>
      <AppTopbar
        title={digest ? `Итоги ${digest.period_key}` : "Дайджест"}
        subtitle={undefined}
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
        <div className="w-full">
          {isPending && (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton
                  key={i}
                  variant="rect"
                  height={i === 0 ? 88 : 128}
                  className="rounded-2xl"
                />
              ))}
            </div>
          )}

          {isError && (
            <p
              className="text-center py-12 text-[14px]"
              style={{ color: "var(--t-muted)" }}
            >
              Не удалось загрузить дайджест
            </p>
          )}

          {digest && (
            <>
              <DigestHero digest={digest} />
              <DigestContent digest={digest} />
            </>
          )}
        </div>
      </main>
    </>
  );
}
