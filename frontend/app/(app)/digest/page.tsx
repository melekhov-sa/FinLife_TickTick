"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, RefreshCw } from "lucide-react";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { useDigests, useDigestBackfill } from "@/hooks/useDigests";
import type { DigestListItem } from "@/types/api";
import { clsx } from "clsx";
import { Skeleton } from "@/components/primitives/Skeleton";

function DigestListCard({ digest, onClick }: { digest: DigestListItem; onClick: () => void }) {
  const pct = Math.round(digest.habits_completion_rate * 100);
  const isNew = !digest.viewed_at;

  return (
    <button
      onClick={onClick}
      className={clsx(
        "w-full text-left rounded-2xl border p-4 transition-opacity hover:opacity-80",
        isNew ? "border-indigo-500/40" : "border-white/[0.07]"
      )}
      style={{
        background: isNew
          ? "linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(139,92,246,0.08) 100%)"
          : "rgba(255,255,255,0.02)",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Sparkles
          className={clsx("w-4 h-4 shrink-0", isNew ? "text-indigo-400" : "text-white/30")}
        />
        <span
          className="text-[14px] font-semibold"
          style={{ color: "var(--t-primary)" }}
        >
          Неделя {digest.period_key}
        </span>
        {isNew && (
          <span
            className="ml-auto text-[11px] font-medium px-1.5 py-0.5 rounded-full"
            style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }}
          >
            Новый
          </span>
        )}
      </div>
      <div className="flex gap-4 text-[13px]" style={{ color: "var(--t-secondary)" }}>
        <span>{digest.tasks_completed} задач</span>
        <span>{pct}% привычек</span>
        <span>+{digest.xp_gained} XP</span>
      </div>
      {digest.ai_comment && (
        <p
          className="mt-2 text-[12px] line-clamp-2"
          style={{ color: "var(--t-muted)" }}
        >
          {digest.ai_comment}
        </p>
      )}
    </button>
  );
}

export default function DigestListPage() {
  const router = useRouter();
  const [backfilling, setBackfilling] = useState(false);
  const { data: digests, isPending, isError } = useDigests("week", 20);
  const { mutateAsync: backfill } = useDigestBackfill();

  async function handleBackfill() {
    setBackfilling(true);
    try {
      await backfill(8);
    } finally {
      setBackfilling(false);
    }
  }

  return (
    <>
      <AppTopbar
        title="Итоги"
        subtitle="Еженедельные дайджесты"
        actions={
          <button
            onClick={handleBackfill}
            disabled={backfilling}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-opacity hover:opacity-75 disabled:opacity-40"
            style={{ background: "rgba(99,102,241,0.15)", color: "#a5b4fc" }}
          >
            <RefreshCw className={clsx("w-3.5 h-3.5", backfilling && "animate-spin")} />
            Восстановить
          </button>
        }
      />

      <main className="flex-1 overflow-auto p-3 md:p-6">
        <div className="w-full space-y-3">
          {isPending && (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} variant="rect" height={96} className="rounded-2xl" />
              ))}
            </div>
          )}

          {isError && (
            <p className="text-center py-12 text-[14px]" style={{ color: "var(--t-muted)" }}>
              Не удалось загрузить дайджесты
            </p>
          )}

          {digests && digests.length === 0 && (
            <div className="text-center py-16">
              <Sparkles className="w-10 h-10 mx-auto mb-4 text-white/20" />
              <p className="text-[15px] font-medium mb-1" style={{ color: "var(--t-primary)" }}>
                Дайджестов пока нет
              </p>
              <p className="text-[13px]" style={{ color: "var(--t-muted)" }}>
                Нажмите «Восстановить», чтобы сгенерировать итоги за прошлые недели
              </p>
            </div>
          )}

          {digests?.map((digest) => (
            <DigestListCard
              key={digest.id}
              digest={digest}
              onClick={() => router.push(`/digest/${digest.period_type}/${digest.period_key}`)}
            />
          ))}
        </div>
      </main>
    </>
  );
}
