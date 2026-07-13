/**
 * Бюджетный месяц операции: по умолчанию месяц берётся из даты операции,
 * но можно переопределить (зарплата 31 января «по смыслу» — февральская).
 * Значение — ISO-дата первого числа целевого месяца ("2026-02-01").
 */

const MONTH_NAMES_RU = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];

const MONTH_SHORT_RU = [
  "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
];

/** YYYY-MM-01 месяца даты dateStr, сдвинутого на shift месяцев. */
export function shiftMonth(dateStr: string | null | undefined, shift: number): string {
  const parsed = dateStr ? new Date(dateStr) : new Date();
  const base = isNaN(parsed.getTime()) ? new Date() : parsed;
  const m = new Date(base.getFullYear(), base.getMonth() + shift, 1);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-01`;
}

/** "2026-02-01" → "февраль 2026". */
export function budgetMonthLabel(ym: string): string {
  const mi = Number(ym.slice(5, 7)) - 1;
  return `${MONTH_NAMES_RU[mi] ?? ym} ${ym.slice(0, 4)}`;
}

/** "2026-02-01" → "фев" (для бейджа в списке). */
export function budgetMonthShort(ym: string): string {
  return MONTH_SHORT_RU[Number(ym.slice(5, 7)) - 1] ?? ym;
}

/** Отличается ли бюджетный месяц от месяца даты операции. */
export function budgetMonthDiffers(
  budgetMonth: string | null | undefined,
  occurredAt: string,
): boolean {
  if (!budgetMonth) return false;
  return budgetMonth.slice(0, 7) !== occurredAt.slice(0, 7);
}

/** Опции селекта «Месяц бюджета» вокруг даты операции. */
export function budgetMonthOptions(
  occurredAt: string | null | undefined,
  current: string | null | undefined,
): { value: string; label: string }[] {
  const prev = shiftMonth(occurredAt, -1);
  const next = shiftMonth(occurredAt, 1);
  const opts = [
    { value: "", label: "По дате операции" },
    { value: next, label: `Следующий — ${budgetMonthLabel(next)}` },
    { value: prev, label: `Предыдущий — ${budgetMonthLabel(prev)}` },
  ];
  if (current && !opts.some((o) => o.value === current)) {
    opts.push({ value: current, label: budgetMonthLabel(current) });
  }
  return opts;
}
