import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function pluralizeYears(n: number): string {
  const last2 = Math.abs(n) % 100;
  const last1 = Math.abs(n) % 10;
  if (last2 >= 11 && last2 <= 19) return "лет";
  if (last1 === 1) return "год";
  if (last1 >= 2 && last1 <= 4) return "года";
  return "лет";
}
