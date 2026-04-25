"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useUnviewedLatestDigest, useDigestMarkViewed } from "@/hooks/useDigests";
import { Badge } from "@/components/primitives/Badge";

export function DigestCard() {
  const { data: digest, isPending } = useUnviewedLatestDigest();
  const { mutate: markViewed } = useDigestMarkViewed();

  if (isPending || !digest) return null;

  const pct = Math.round(digest.habits_completion_rate * 100);
  const href = `/digest/${digest.period_type}/${digest.period_key}`;

  return (
    <Link
      href={href}
      onClick={() => markViewed(digest.id)}
      className="block rounded-2xl border p-4 transition-opacity hover:opacity-90"
      style={{
        background: "linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.12) 100%)",
        borderColor: "rgba(99,102,241,0.3)",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
        <span className="text-[13px] font-semibold" style={{ color: "var(--t-primary)" }}>
          Итоги недели {digest.period_key}
        </span>
        <Badge variant="info" size="sm" className="ml-auto">Новый</Badge>
      </div>
      <div className="flex gap-4 text-[12px]" style={{ color: "var(--t-secondary)" }}>
        <span>{digest.tasks_completed} задач</span>
        <span>{pct}% привычек</span>
        <span>+{digest.xp_gained} XP</span>
      </div>
    </Link>
  );
}
