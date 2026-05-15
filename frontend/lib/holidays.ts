/** Russian federal holidays — mirrors app/application/holidays.py */
const RU_HOLIDAYS: Record<string, { name: string; icon: string }> = {
  "01-01": { name: "Новый год",                 icon: "🎄" },
  "01-02": { name: "Новогодние каникулы",        icon: "🎄" },
  "01-03": { name: "Новогодние каникулы",        icon: "🎄" },
  "01-04": { name: "Новогодние каникулы",        icon: "🎄" },
  "01-05": { name: "Новогодние каникулы",        icon: "🎄" },
  "01-06": { name: "Новогодние каникулы",        icon: "🎄" },
  "01-07": { name: "Рождество Христово",         icon: "✨" },
  "01-08": { name: "Новогодние каникулы",        icon: "🎄" },
  "02-23": { name: "День защитника Отечества",   icon: "🎖️" },
  "03-08": { name: "Международный женский день", icon: "🌷" },
  "05-01": { name: "Праздник весны и труда",     icon: "🌱" },
  "05-09": { name: "День Победы",                icon: "🎗️" },
  "06-12": { name: "День России",                icon: "🇷🇺" },
  "11-04": { name: "День народного единства",    icon: "🤝" },
};

export function getHolidayRU(dateISO: string): { name: string; icon: string } | null {
  return RU_HOLIDAYS[dateISO.slice(5)] ?? null; // "YYYY-MM-DD" → "MM-DD"
}
