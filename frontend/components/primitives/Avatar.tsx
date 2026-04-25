"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg" | "xl";

export interface AvatarProps {
  src?: string | null;
  emoji?: string;
  name?: string;
  size?: Size;
  className?: string;
}

const sizeClasses: Record<Size, string> = {
  sm: "w-6 h-6 text-[11px]",
  md: "w-8 h-8 text-[13px]",
  lg: "w-10 h-10 text-[15px]",
  xl: "w-14 h-14 text-[20px]",
};

const sizePixels: Record<Size, number> = {
  sm: 24,
  md: 32,
  lg: 40,
  xl: 56,
};

function getLetter(name?: string): string {
  if (!name) return "?";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed[0].toUpperCase();
}

export function Avatar({ src, emoji, name, size = "md", className }: AvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = src && !imgFailed;

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full overflow-hidden shrink-0 select-none",
        "bg-slate-100 text-slate-700 font-semibold",
        "dark:bg-white/[0.08] dark:text-slate-200",
        sizeClasses[size],
        className,
      )}
      aria-label={name}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src!}
          alt={name ?? ""}
          width={sizePixels[size]}
          height={sizePixels[size]}
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : emoji ? (
        <span aria-hidden className="leading-none">
          {emoji}
        </span>
      ) : (
        <span aria-hidden>{getLetter(name)}</span>
      )}
    </span>
  );
}
