import { cn } from "@/lib/utils";

type Variant = "text" | "title" | "circle" | "rect";

export interface SkeletonProps {
  variant?: Variant;
  width?: string | number;
  height?: string | number;
  className?: string;
}

const variantClasses: Record<Variant, string> = {
  text: "h-[14px] rounded-sm",
  title: "h-[22px] rounded",
  circle: "rounded-full",
  rect: "rounded-lg",
};

export function Skeleton({ variant = "text", width, height, className }: SkeletonProps) {
  const style: React.CSSProperties = {};
  if (width !== undefined) style.width = typeof width === "number" ? `${width}px` : width;
  if (height !== undefined) style.height = typeof height === "number" ? `${height}px` : height;
  if (variant === "circle" && width !== undefined && height === undefined) {
    style.height = style.width;
  }

  return (
    <span
      aria-hidden
      style={style}
      className={cn(
        "block animate-pulse bg-slate-200 dark:bg-white/5",
        variantClasses[variant],
        variant === "text" && width === undefined && "w-full",
        variant === "title" && width === undefined && "w-2/3",
        className,
      )}
    />
  );
}
