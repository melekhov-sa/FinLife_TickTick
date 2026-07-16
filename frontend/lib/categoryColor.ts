/**
 * Цвета финансовых категорий.
 * У категории может быть свой цвет (#RRGGBB); если не задан —
 * детерминированный цвет из гармоничной палитры по category_id.
 */

export const CATEGORY_PALETTE = [
  "#F59E0B", // янтарь
  "#3B82F6", // синий
  "#10B981", // изумруд
  "#EC4899", // розовый
  "#8B5CF6", // фиолетовый
  "#F97316", // оранжевый
  "#06B6D4", // циан
  "#84CC16", // лайм
  "#E11D48", // малиновый
  "#6366F1", // индиго
  "#14B8A6", // бирюза
  "#A855F7", // пурпур
] as const;

export function getCategoryColor(
  categoryId: number | null | undefined,
  color?: string | null,
): string {
  if (color) return color;
  if (categoryId == null) return "var(--t-faint)";
  return CATEGORY_PALETTE[categoryId % CATEGORY_PALETTE.length];
}

/** Карта id → цвет из списка категорий (для списков операций/бюджета). */
export function buildCategoryColorMap(
  cats: { category_id: number; color?: string | null }[] | undefined,
): Record<number, string> {
  const map: Record<number, string> = {};
  for (const c of cats ?? []) map[c.category_id] = getCategoryColor(c.category_id, c.color);
  return map;
}
