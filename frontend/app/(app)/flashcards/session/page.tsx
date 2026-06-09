"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MoreVertical, CheckCircle2, XCircle, ChevronRight, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/primitives/PageHeader";
import { api } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface SessionCard {
  id: number;
  category_id: number;
  category_name: string;
  category_emoji: string | null;
  word: string;
  short_definition: string;
  simple_explanation: string;
  example: string;
  difficulty: number;
  mode: "learn" | "review";
  quiz_options: string[] | null;
}

// ── 3-dot menu ────────────────────────────────────────────────────────────────

function CardMenu({ onSkip, open, onToggle }: { onSkip: () => void; open: boolean; onToggle: () => void }) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--app-accent-weak)]"
        style={{ width: 36, height: 36, color: "var(--t-muted)", border: "1px solid var(--app-border)", background: "var(--app-card-bg)" }}
        aria-label="Меню"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onToggle} />
          <div
            className="absolute right-0 top-10 z-50 rounded-xl overflow-hidden shadow-xl"
            style={{
              background: "var(--app-card-bg)",
              border: "1px solid var(--app-border)",
              minWidth: 220,
            }}
          >
            <button
              onClick={() => { onToggle(); onSkip(); }}
              className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors hover:bg-[var(--app-accent-weak)]"
              style={{ fontSize: 14, color: "var(--c-danger-ink)" }}
            >
              <XCircle size={16} />
              Не буду изучать это слово
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Learn card (flip animation) ────────────────────────────────────────────────

function LearnCard({ card, onSeen, onSkip }: { card: SessionCard; onSeen: () => void; onSkip: () => void }) {
  const [flipped, setFlipped] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="relative flex flex-col h-full select-none">
      {/* menu */}
      <div className="absolute top-0 right-0 z-10">
        <CardMenu onSkip={onSkip} open={menuOpen} onToggle={() => setMenuOpen(v => !v)} />
      </div>

      {/* category chip */}
      <div className="flex items-center gap-1.5 mb-4 pr-10">
        <span style={{ fontSize: 18 }}>{card.category_emoji ?? "📚"}</span>
        <span style={{ fontSize: 12, color: "var(--t-muted)", fontWeight: 500 }}>{card.category_name}</span>
        <span
          className="ml-auto px-2 py-0.5 rounded-full"
          style={{
            fontSize: 10,
            fontWeight: 600,
            background: "var(--app-accent-weak)",
            color: "var(--app-accent)",
          }}
        >
          Новое слово
        </span>
      </div>

      {/* flip card */}
      <div
        className="flex-1 cursor-pointer"
        style={{ perspective: 1200 }}
        onClick={() => !flipped && setFlipped(true)}
      >
        <div
          className="relative w-full h-full"
          style={{
            transformStyle: "preserve-3d",
            transition: "transform 0.5s cubic-bezier(0.23,1,0.32,1)",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
            minHeight: 340,
          }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl p-8"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              background: "var(--app-card-bg)",
              border: "1px solid var(--app-border)",
            }}
          >
            <div
              className="text-center"
              style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--t-primary)" }}
            >
              {card.word}
            </div>
            <div className="mt-6 flex items-center gap-2" style={{ color: "var(--t-muted)", fontSize: 13 }}>
              <span>Нажмите чтобы открыть</span>
              <RotateCcw size={13} />
            </div>
          </div>

          {/* Back */}
          <div
            className="absolute inset-0 flex flex-col rounded-3xl p-6 overflow-y-auto"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              background: "var(--app-card-bg)",
              border: "1px solid var(--app-border)",
            }}
          >
            <div
              className="text-center mb-4"
              style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--t-primary)" }}
            >
              {card.word}
            </div>

            <div
              className="rounded-2xl p-4 mb-3"
              style={{ background: "var(--app-accent-weak)" }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--app-accent)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Простыми словами
              </div>
              <div style={{ fontSize: 15, color: "var(--t-primary)", lineHeight: 1.6 }}>
                {card.simple_explanation}
              </div>
            </div>

            <div
              className="rounded-2xl p-4"
              style={{ background: "var(--app-card-bg)", border: "1px solid var(--app-border)" }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--t-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Пример
              </div>
              <div style={{ fontSize: 14, color: "var(--t-secondary)", lineHeight: 1.6, fontStyle: "italic" }}>
                {card.example}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action button */}
      {flipped && (
        <button
          onClick={onSeen}
          className="mt-4 w-full flex items-center justify-center gap-2 rounded-2xl transition-all"
          style={{
            height: 52,
            background: "var(--app-accent)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 15,
          }}
        >
          Понятно, дальше
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  );
}

// ── Review card (quiz) ─────────────────────────────────────────────────────────

function ReviewCard({ card, onAnswer }: { card: SessionCard; onAnswer: (correct: boolean) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSelect = (opt: string) => {
    if (submitted) return;
    setSelected(opt);
  };

  const handleSubmit = () => {
    if (!selected || submitted) return;
    setSubmitted(true);
    const isCorrect = selected === card.short_definition;
    setTimeout(() => onAnswer(isCorrect), 1200);
  };

  const getOptionStyle = (opt: string): React.CSSProperties => {
    if (!submitted) {
      return {
        background: selected === opt ? "var(--app-accent-weak)" : "var(--app-card-bg)",
        border: `1.5px solid ${selected === opt ? "var(--app-accent)" : "var(--app-border)"}`,
        color: "var(--t-primary)",
      };
    }
    if (opt === card.short_definition) {
      return { background: "color-mix(in srgb, #22C55E 15%, transparent)", border: "1.5px solid #22C55E", color: "var(--t-primary)" };
    }
    if (opt === selected) {
      return { background: "color-mix(in srgb, #EF4444 12%, transparent)", border: "1.5px solid #EF4444", color: "var(--t-primary)" };
    }
    return { background: "var(--app-card-bg)", border: "1.5px solid var(--app-border)", color: "var(--t-muted)", opacity: 0.5 };
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* category */}
      <div className="flex items-center gap-1.5">
        <span style={{ fontSize: 18 }}>{card.category_emoji ?? "📚"}</span>
        <span style={{ fontSize: 12, color: "var(--t-muted)", fontWeight: 500 }}>{card.category_name}</span>
        <span
          className="ml-auto px-2 py-0.5 rounded-full"
          style={{ fontSize: 10, fontWeight: 600, background: "color-mix(in srgb, #F59E0B 15%, transparent)", color: "#F59E0B" }}
        >
          Повторение
        </span>
      </div>

      {/* question */}
      <div
        className="flex items-center justify-center rounded-3xl px-6 py-8"
        style={{ background: "var(--app-card-bg)", border: "1px solid var(--app-border)", minHeight: 140 }}
      >
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--t-primary)", textAlign: "center" }}>
          {card.word}
        </div>
      </div>

      {/* prompt */}
      <div style={{ fontSize: 13.5, color: "var(--t-muted)", textAlign: "center" }}>
        Выберите правильное определение
      </div>

      {/* options */}
      <div className="flex flex-col gap-2 flex-1">
        {card.quiz_options?.map((opt, i) => (
          <button
            key={i}
            onClick={() => handleSelect(opt)}
            className="w-full text-left px-4 py-3.5 rounded-2xl transition-all"
            style={{ ...getOptionStyle(opt), fontSize: 14, lineHeight: 1.5, cursor: submitted ? "default" : "pointer" }}
          >
            <span style={{ fontWeight: 500, marginRight: 8, opacity: 0.5 }}>{["А", "Б", "В"][i]}.</span>
            {opt}
            {submitted && opt === card.short_definition && (
              <CheckCircle2 size={16} className="inline ml-2" style={{ color: "#22C55E", verticalAlign: "middle" }} />
            )}
            {submitted && opt === selected && opt !== card.short_definition && (
              <XCircle size={16} className="inline ml-2" style={{ color: "#EF4444", verticalAlign: "middle" }} />
            )}
          </button>
        ))}
      </div>

      {/* submit */}
      {!submitted && selected && (
        <button
          onClick={handleSubmit}
          className="w-full flex items-center justify-center gap-2 rounded-2xl transition-all"
          style={{ height: 52, background: "var(--app-accent)", color: "#fff", fontWeight: 700, fontSize: 15 }}
        >
          Проверить
        </button>
      )}
    </div>
  );
}

// ── Done screen ────────────────────────────────────────────────────────────────

function DoneScreen({ total, correct, onBack }: { total: number; correct: number; onBack: () => void }) {
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const emoji = pct >= 80 ? "🎉" : pct >= 50 ? "👍" : "💪";
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-4 text-center">
      <div style={{ fontSize: 72 }}>{emoji}</div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--t-primary)" }}>
          Занятие завершено!
        </div>
        <div className="mt-2" style={{ fontSize: 15, color: "var(--t-muted)" }}>
          {pct >= 80 ? "Отличная работа!" : pct >= 50 ? "Хороший результат, продолжайте!" : "Не сдавайтесь, практика помогает!"}
        </div>
      </div>

      {total > 0 && (
        <div
          className="flex gap-6 px-8 py-4 rounded-2xl"
          style={{ background: "var(--app-card-bg)", border: "1px solid var(--app-border)" }}
        >
          <div className="flex flex-col items-center">
            <div style={{ fontSize: 28, fontWeight: 800, color: "#22C55E" }}>{correct}</div>
            <div style={{ fontSize: 12, color: "var(--t-muted)" }}>правильно</div>
          </div>
          <div style={{ width: 1, background: "var(--app-border)" }} />
          <div className="flex flex-col items-center">
            <div style={{ fontSize: 28, fontWeight: 800, color: "#EF4444" }}>{total - correct}</div>
            <div style={{ fontSize: 12, color: "var(--t-muted)" }}>ошибок</div>
          </div>
          <div style={{ width: 1, background: "var(--app-border)" }} />
          <div className="flex flex-col items-center">
            <div style={{ fontSize: 28, fontWeight: 800, color: "var(--app-accent)" }}>{pct}%</div>
            <div style={{ fontSize: 12, color: "var(--t-muted)" }}>точность</div>
          </div>
        </div>
      )}

      <button
        onClick={onBack}
        className="px-8 py-3 rounded-2xl font-semibold"
        style={{ background: "var(--app-accent)", color: "#fff", fontSize: 15 }}
      >
        На главную
      </button>
    </div>
  );
}

// ── Main session page ──────────────────────────────────────────────────────────

export default function FlashcardsSessionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get("category");
  const queryClient = useQueryClient();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [reviewTotal, setReviewTotal] = useState(0);

  const url = categoryParam
    ? `/api/v2/flashcards/today?category_id=${categoryParam}`
    : "/api/v2/flashcards/today";

  const { data: cards, isLoading } = useQuery({
    queryKey: ["flashcards-session", categoryParam],
    queryFn: () => api.get<SessionCard[]>(url),
  });

  const seenMutation = useMutation({
    mutationFn: (id: number) => api.post(`/api/v2/flashcards/${id}/seen`, {}),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, quality }: { id: number; quality: string }) =>
      api.post(`/api/v2/flashcards/${id}/review`, { quality }),
  });

  const skipMutation = useMutation({
    mutationFn: (id: number) => api.post(`/api/v2/flashcards/${id}/skip`, {}),
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["flashcards-stats"] });
    queryClient.invalidateQueries({ queryKey: ["flashcards-categories"] });
  }, [queryClient]);

  const advance = useCallback(() => {
    if (!cards) return;
    if (currentIndex + 1 >= cards.length) {
      invalidate();
      setDone(true);
    } else {
      setCurrentIndex(i => i + 1);
    }
  }, [cards, currentIndex, invalidate]);

  const handleSeen = useCallback(() => {
    if (!cards) return;
    const card = cards[currentIndex];
    seenMutation.mutate(card.id);
    advance();
  }, [cards, currentIndex, seenMutation, advance]);

  const handleAnswer = useCallback((isCorrect: boolean) => {
    if (!cards) return;
    const card = cards[currentIndex];
    reviewMutation.mutate({ id: card.id, quality: isCorrect ? "correct" : "wrong" });
    setReviewTotal(t => t + 1);
    if (isCorrect) setCorrect(c => c + 1);
    advance();
  }, [cards, currentIndex, reviewMutation, advance]);

  const handleSkip = useCallback(() => {
    if (!cards) return;
    const card = cards[currentIndex];
    skipMutation.mutate(card.id);
    advance();
  }, [cards, currentIndex, skipMutation, advance]);

  const card = cards?.[currentIndex];
  const total = cards?.length ?? 0;
  const progress = total > 0 ? ((currentIndex) / total) * 100 : 0;

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Занятие" back={{ onClick: () => router.push("/flashcards") }} />
        <div className="flex-1 flex items-center justify-center">
          <div style={{ color: "var(--t-muted)" }}>Загрузка...</div>
        </div>
      </div>
    );
  }

  if (done || !cards || cards.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Занятие" back={{ onClick: () => router.push("/flashcards") }} />
        <div className="flex-1 overflow-hidden">
          <DoneScreen
            total={reviewTotal}
            correct={correct}
            onBack={() => router.push("/flashcards")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Занятие"
        back={{ onClick: () => router.push("/flashcards") }}
        subtitle={`${currentIndex + 1} из ${total}`}
      />

      {/* progress bar */}
      <div className="h-1 shrink-0" style={{ background: "var(--app-border)" }}>
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${progress}%`, background: "var(--app-accent)" }}
        />
      </div>

      {/* card area */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-6 py-5 max-w-lg mx-auto min-h-full">
          {card && card.mode === "learn" ? (
            <LearnCard card={card} onSeen={handleSeen} onSkip={handleSkip} />
          ) : card ? (
            <ReviewCard card={card} onAnswer={handleAnswer} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
