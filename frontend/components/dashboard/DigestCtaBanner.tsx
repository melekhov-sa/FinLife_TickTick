"use client";

import Link from "next/link";
import { Sparkles, ChevronRight } from "lucide-react";
import { useUnviewedLatestDigest } from "@/hooks/useDigests";

function parseWeekNumber(periodKey: string): number | null {
  // Format: "2026-W16"
  const m = periodKey.match(/W(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

export function DigestCtaBanner() {
  const { data: digest, isPending } = useUnviewedLatestDigest();

  if (isPending || !digest) return null;

  const weekNum = parseWeekNumber(digest.period_key);
  const href = `/digest/${digest.period_type}/${digest.period_key}`;
  const subtitle = weekNum
    ? `Неделя ${weekNum} \u00b7 Посмотри как прошла неделя`
    : "Посмотри как прошла неделя";

  return (
    <Link
      href={href}
      className="digest-cta-banner relative block rounded-xl overflow-hidden mb-3 transition-transform duration-200 hover:scale-[1.02] focus-visible:scale-[1.02]"
      style={{
        background: "linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)",
        animation:
          "digest-slide-down 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards, digest-banner-glow 3s ease-in-out 0.5s infinite",
        boxShadow:
          "0 0 12px rgba(99,102,241,0.3), 0 2px 16px rgba(139,92,246,0.2)",
      }}
    >
      {/* Shimmer overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)",
          backgroundSize: "200% 100%",
          animation: "digest-shimmer 3s linear infinite",
        }}
      />

      {/* Content */}
      <div className="relative flex items-center gap-3 px-4 py-3.5">
        {/* Pulsing Sparkles icon */}
        <div className="shrink-0">
          <Sparkles
            className="digest-sparkles-icon w-5 h-5 text-white"
            style={{ animation: "digest-glow-pulse 2s ease-in-out infinite" }}
          />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p
            className="font-semibold leading-tight"
            style={{
              color: "rgba(255,255,255,0.97)",
              fontSize: "var(--fs-body, 15px)",
            }}
          >
            Еженедельный дайджест готов
          </p>
          <p
            className="mt-0.5 leading-tight truncate"
            style={{
              color: "rgba(255,255,255,0.72)",
              fontSize: "var(--fs-sm, 13px)",
            }}
          >
            {subtitle}
          </p>
        </div>

        {/* Arrow */}
        <ChevronRight
          className="shrink-0 w-5 h-5"
          style={{ color: "rgba(255,255,255,0.8)" }}
        />
      </div>
    </Link>
  );
}
