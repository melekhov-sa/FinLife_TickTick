"use client";

import type { ExpiringSub, ExpiringDoc } from "@/types/api";
import { Badge } from "@/components/primitives/Badge";
import { FileBadge2 } from "lucide-react";

interface Props {
  subs: ExpiringSub[];
  docs?: ExpiringDoc[];
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("ru-RU", {
    day: "numeric", month: "numeric", year: "numeric",
  });
}

export function ExpiringSubsCard({ subs, docs = [] }: Props) {
  // Истёкшее — в одну строку-сводку; впереди только ближайшие 7 дней (подписки)
  const expiredCount =
    subs.filter((s) => s.days_left < 0).length + docs.filter((d) => d.days_left < 0).length;
  const upcomingSubs = subs.filter((s) => s.days_left >= 0 && s.days_left <= 7);
  const upcomingDocs = docs.filter((d) => d.days_left >= 0);
  const hasAnything = upcomingSubs.length > 0 || upcomingDocs.length > 0 || expiredCount > 0;

  return (
    <div className="bg-white dark:bg-white/[0.05] rounded-[14px] border border-slate-200 dark:border-white/[0.09] shadow-sm p-4">
      <h2 className="text-[14px] font-semibold mb-3" style={{ letterSpacing: "-0.01em", color: "var(--t-primary)" }}>
        Скоро заканчивается
      </h2>

      {!hasAnything ? (
        <p className="text-[13px] py-1" style={{ color: "var(--t-faint)" }}>Всё в порядке</p>
      ) : (
        <div className="space-y-0.5">
          {expiredCount > 0 && (
            <a
              href="/trackers?tab=subscriptions"
              className="flex items-center justify-between gap-2 py-2 border-b border-white/[0.04] group"
            >
              <span className="text-[13px] font-medium" style={{ color: "var(--c-danger-ink)" }}>
                ⚠️ Истекло: {expiredCount}
              </span>
              <span className="text-[11px] group-hover:text-[var(--app-accent)]" style={{ color: "var(--t-faint)" }}>
                открыть →
              </span>
            </a>
          )}
          {upcomingDocs.map((d) => (
            <div
              key={`doc-${d.id}`}
              className="flex items-start justify-between gap-3 py-2 border-b border-white/[0.04] last:border-0"
            >
              <div className="min-w-0 flex items-center gap-1.5">
                <FileBadge2 size={13} className="shrink-0 text-[var(--app-accent)]/70" />
                <div className="min-w-0">
                  <p className="t-main font-semibold truncate leading-snug" style={{ color: "var(--t-primary)" }}>
                    {d.title}
                    {" "}
                    <span className="text-xs font-normal" style={{ color: "var(--t-muted)" }}>
                      до {formatDate(d.expiry_date)}
                    </span>
                  </p>
                  {d.doc_type && (
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--t-faint)" }}>{d.doc_type}</p>
                  )}
                </div>
              </div>
              <Badge
                variant={d.days_left < 0 ? "danger" : d.days_left <= 14 ? "danger" : d.days_left <= 30 ? "warning" : "neutral"}
                size="sm"
                className="tabular-nums shrink-0"
              >
                {d.days_left < 0 ? "истёк" : d.days_left === 0 ? "сегодня" : `${d.days_left} дн.`}
              </Badge>
            </div>
          ))}

          {upcomingSubs.map((s) => (
            <div
              key={`sub-${s.member_id}`}
              className="flex items-start justify-between gap-3 py-2 border-b border-white/[0.04] last:border-0"
            >
              <div className="min-w-0">
                <p className="t-main font-semibold truncate leading-snug" style={{ color: "var(--t-primary)" }}>
                  {s.subscription_title}
                  {" "}
                  <span className="text-xs font-normal" style={{ color: "var(--t-muted)" }}>до {formatDate(s.paid_until)}</span>
                </p>
                <p className="t-secondary mt-0.5 truncate" style={{ color: "var(--t-muted)" }}>{s.contact_name}</p>
              </div>
              <Badge
                variant={s.days_left <= 3 ? "danger" : s.days_left <= 14 ? "warning" : "neutral"}
                size="sm"
                className="tabular-nums shrink-0"
              >
                {s.days_left === 0 ? "сегодня" : `${s.days_left} дн.`}
              </Badge>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 pt-2.5 border-t border-white/[0.05] flex gap-3">
        <a href="/trackers?tab=subscriptions" className="text-xs font-medium hover:text-[var(--app-accent)] transition-colors" style={{ color: "var(--t-muted)" }}>
          Подписки →
        </a>
        <a href="/trackers?tab=documents" className="text-xs font-medium hover:text-[var(--app-accent)] transition-colors" style={{ color: "var(--t-muted)" }}>
          Документы →
        </a>
      </div>
    </div>
  );
}
