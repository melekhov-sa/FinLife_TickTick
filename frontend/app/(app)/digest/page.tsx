"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, RefreshCw, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/primitives/PageHeader";
import { useDigests, useDigestBackfill } from "@/hooks/useDigests";
import type { DigestListItem } from "@/types/api";
import { clsx } from "clsx";
import { Button } from "@/components/primitives/Button";
import { Card } from "@/components/primitives/Card";
import { Skeleton } from "@/components/primitives/Skeleton";
import { EmptyState } from "@/components/primitives/EmptyState";

function DigestListCard({ digest, onClick }: { digest: DigestListItem; onClick: () => void }) {
  const pct = Math.round(digest.habits_completion_rate * 100);
  const isNew = !digest.viewed_at;

  return (
    <Card
      onClick={onClick}
      padding="md"
      className={clsx(
        "transition-opacity hover:opacity-80",
        isNew && "border-indigo-400 dark:border-indigo-500/40 bg-gradient-to-br from-indigo-500/[0.07] to-violet-500/[0.05]"
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <Sparkles
          className={clsx("w-4 h-4 shrink-0", isNew ? "text-indigo-400" : "text-slate-300 dark:text-white/30")}
        />
        <span
          className="text-[14px] font-semibold"
          style={{ color: "var(--t-primary)" }}
        >
          Неделя {digest.period_key}
        </span>
        {isNew && (
          <span className="ml-auto text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300">
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
    </Card>
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
      <PageHeader
        title="Итоги"
        subtitle="Еженедельные дайджесты"
        actions={
          <Button
            variant="ghost"
            size="sm"
            disabled={backfilling}
            loading={backfilling}
            leftIcon={<RefreshCw size={14} className={clsx(backfilling && "animate-spin")} />}
            onClick={handleBackfill}
            className="text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
          >
            Восстановить
          </Button>
        }
      />

      <main className="flex-1 p-3 md:p-6">
        <div className="w-full space-y-3">
          {isPending && (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} variant="rect" height={96} className="rounded-2xl" />
              ))}
            </div>
          )}

          {isError && (
            <EmptyState
              icon={<AlertCircle size={24} />}
              title="Не удалось загрузить дайджесты"
              size="md"
            />
          )}

          {digests && digests.length === 0 && (
            <EmptyState
              icon={<Sparkles size={24} />}
              title="Дайджестов пока нет"
              description='Нажмите «Восстановить», чтобы сгенерировать итоги за прошлые недели'
              size="lg"
            />
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
