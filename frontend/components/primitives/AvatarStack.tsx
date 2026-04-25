"use client";

import { cn } from "@/lib/utils";
import { Avatar } from "./Avatar";

export interface AvatarSpec {
  src?: string;
  emoji?: string;
  name?: string;
}

export interface AvatarStackProps {
  avatars: AvatarSpec[];
  max?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function AvatarStack({ avatars, max = 3, size = "md", className }: AvatarStackProps) {
  const overlap = size === "sm" ? "-ml-2" : size === "lg" ? "-ml-4" : "-ml-3";
  const sizeCls =
    size === "sm"
      ? "w-6 h-6 text-[10px]"
      : size === "lg"
      ? "w-12 h-12 text-[16px]"
      : "w-9 h-9 text-[13px]";

  const overflow = avatars.length - (max - 1);
  const visible = avatars.length > max ? avatars.slice(0, max - 1) : avatars;
  const showOverflow = avatars.length > max;

  return (
    <div className={cn("inline-flex items-center", className)}>
      {visible.map((a, i) => (
        <div
          key={i}
          className={cn(
            i === 0 ? "" : overlap,
            "ring-2 ring-white dark:ring-[#0f1115] rounded-full",
          )}
        >
          <Avatar {...a} size={size} />
        </div>
      ))}
      {showOverflow && (
        <div
          className={cn(
            overlap,
            "ring-2 ring-white dark:ring-[#0f1115] rounded-full",
          )}
        >
          <div
            className={cn(
              "rounded-full bg-slate-200 dark:bg-white/[0.1] text-slate-700 dark:text-[#fff] font-semibold flex items-center justify-center",
              sizeCls,
            )}
          >
            +{overflow}
          </div>
        </div>
      )}
    </div>
  );
}
