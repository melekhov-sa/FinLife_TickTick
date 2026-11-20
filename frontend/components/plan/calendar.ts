/**
 * Календарная арифметика для месячного вида «Плана».
 *
 * Вынесено из app/(app)/plan/page.tsx: там было 1667 строк, и правка
 * легко уезжала не в тот блок — несколько багов этой осени родились
 * именно так. Здесь чистые функции без состояния.
 */

/** Returns Date object for the first day of a given month. */
export function monthStartOf(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Returns ISO string YYYY-MM-DD for a local Date (first of month). */
export function monthToISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

/** Returns the Monday of the week containing the first of the month (for calendar start). */
export function calendarGridStart(monthStart: Date): Date {
  const first = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
  const dow = first.getDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(first);
  monday.setDate(first.getDate() + diff);
  return monday;
}

/** Returns the Sunday of the week containing the last of the month. */
export function calendarGridEnd(monthStart: Date): Date {
  const last = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const dow = last.getDay(); // 0=Sun
  const diff = dow === 0 ? 0 : 7 - dow;
  const sunday = new Date(last);
  sunday.setDate(last.getDate() + diff);
  return sunday;
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
}
