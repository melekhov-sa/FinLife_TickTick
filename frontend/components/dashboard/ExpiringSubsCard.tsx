"use client";

import { useState } from "react";
import type { ExpiringSub, ExpiringDoc } from "@/types/api";
import { Badge } from "@/components/primitives/Badge";
import { AlarmClock, FileBadge2, RotateCw } from "lucide-react";
import { RenewSubSheet } from "@/components/dashboard/RenewSubSheet";

interface Props {
  subs: ExpiringSub[];
  docs?: ExpiringDoc[];
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("ru-RU", {
    day: "numeric", month: "numeric", year: "numeric",
  });
}

/** Ключ строки: своя часть подписки приходит с member_id = null. */
function subKey(s: ExpiringSub): string {
  return `sub-${s.subscription_id}-${s.member_id ?? "self"}`;
}

/* Просроченных может быть много (у списка общих подписок — десяток и
   больше). Разворачивать их все значит отдать им весь экран, поэтому
   показываем первые несколько, остальные — по кнопке. Сворачивать в один
   счётчик, как было раньше, нельзя: по счётчику не продлить. */
const EXPIRED_PREVIEW = 3;

export function ExpiringSubsCard({ subs, docs = [] }: Props) {
  const [renewing, setRenewing] = useState<ExpiringSub | null>(null);
  const [showAllExpired, setShowAllExpired] = useState(false);

  // Просроченные подписки показываем поимённо и с кнопкой: раньше они
  // сворачивались в счётчик «Истекло: N», по которому нельзя было ничего
  // сделать — приходилось идти на страницу подписок и править дату руками.
  const expiredSubs = subs.filter((s) => s.days_left < 0);
  const upcomingSubs = subs.filter((s) => s.days_left >= 0 && s.days_left <= 7);
  const expiredDocsCount = docs.filter((d) => d.days_left < 0).length;
  const upcomingDocs = docs.filter((d) => d.days_left >= 0);
  const hasAnything =
    upcomingSubs.length > 0 || upcomingDocs.length > 0 ||
    expiredSubs.length > 0 || expiredDocsCount > 0;

  return (
    <div className="dash-card p-4">
      <h2 className="text-[14px] font-semibold mb-3 flex items-center gap-1.5" style={{ letterSpacing: "-0.01em", color: "var(--t-primary)" }}>
        <AlarmClock size={14} strokeWidth={2} style={{ color: "var(--t-muted)" }} />
        Скоро заканчивается
      </h2>

      {!hasAnything ? (
        <p className="text-[13px] py-1" style={{ color: "var(--t-faint)" }}>Всё в порядке</p>
      ) : (
        <div className="space-y-0.5">
          {(showAllExpired ? expiredSubs : expiredSubs.slice(0, EXPIRED_PREVIEW)).map((s) => (
            <SubRow key={subKey(s)} sub={s} onRenew={() => setRenewing(s)} />
          ))}
          {expiredSubs.length > EXPIRED_PREVIEW && (
            <button
              type="button"
              onClick={() => setShowAllExpired((v) => !v)}
              className="w-full text-left py-2 text-[12px] font-medium transition-opacity hover:opacity-70"
              style={{ color: "var(--app-accent)" }}
            >
              {showAllExpired
                ? "Свернуть"
                : `Ещё ${expiredSubs.length - EXPIRED_PREVIEW} просроченных`}
            </button>
          )}
          {expiredDocsCount > 0 && (
            <a
              href="/trackers?tab=documents"
              className="flex items-center justify-between gap-2 py-2 border-b border-slate-100 dark:border-white/[0.04] group"
            >
              <span className="text-[13px] font-medium" style={{ color: "var(--c-danger-ink)" }}>
                ⚠️ Истекло документов: {expiredDocsCount}
              </span>
              <span className="text-[11px] group-hover:text-[var(--app-accent)]" style={{ color: "var(--t-faint)" }}>
                открыть →
              </span>
            </a>
          )}
          {upcomingDocs.map((d) => (
            <div
              key={`doc-${d.id}`}
              className="flex items-start justify-between gap-3 py-2 border-b border-slate-100 dark:border-white/[0.04] last:border-0"
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
            <SubRow key={subKey(s)} sub={s} onRenew={() => setRenewing(s)} />
          ))}
        </div>
      )}

      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-white/[0.05] flex gap-3">
        <a href="/trackers?tab=subscriptions" className="text-xs font-medium hover:text-[var(--app-accent)] transition-colors" style={{ color: "var(--t-muted)" }}>
          Подписки →
        </a>
        <a href="/trackers?tab=documents" className="text-xs font-medium hover:text-[var(--app-accent)] transition-colors" style={{ color: "var(--t-muted)" }}>
          Документы →
        </a>
      </div>

      <RenewSubSheet sub={renewing} onClose={() => setRenewing(null)} />
    </div>
  );
}

/* Название, бейдж и кнопка в одну строку не влезают на телефон: бейдж
   «110 дн. назад» и кнопка съедали около 180pt из ~337pt доступных, и
   название обрезалось прямо посреди даты. Поэтому дата переехала во
   вторую строку к контакту, а бейдж ужат до «−110 дн.»: минус отличает
   просрочку от «через 5 дн.» не хуже слова «назад». */
function SubRow({ sub, onRenew }: { sub: ExpiringSub; onRenew: () => void }) {
  const expired = sub.days_left < 0;
  return (
    <div className="flex items-center gap-2 py-2 border-b border-slate-100 dark:border-white/[0.04] last:border-0">
      <div className="min-w-0 flex-1">
        <p className="t-main font-semibold truncate leading-snug" style={{ color: "var(--t-primary)" }}>
          {sub.subscription_title}
        </p>
        <p className="t-secondary mt-0.5 truncate" style={{ color: "var(--t-muted)" }}>
          {sub.contact_name} · до {formatDate(sub.paid_until)}
        </p>
      </div>

      <Badge
        variant={expired || sub.days_left <= 3 ? "danger" : sub.days_left <= 14 ? "warning" : "neutral"}
        size="sm"
        className="tabular-nums shrink-0"
      >
        {expired
          ? `−${-sub.days_left} дн.`
          : sub.days_left === 0
          ? "сегодня"
          : `${sub.days_left} дн.`}
      </Badge>

      <button
        type="button"
        onClick={onRenew}
        aria-label={`Продлить: ${sub.subscription_title}`}
        className="tap-grow shrink-0 inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-opacity hover:opacity-80"
        style={{ background: "var(--app-accent-weak)", color: "var(--app-accent)" }}
        title="Продлить подписку"
      >
        <RotateCw size={12} />
        Продлить
      </button>
    </div>
  );
}
