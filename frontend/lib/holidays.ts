/** Russian federal holidays — mirrors app/application/holidays.py */
const RU_HOLIDAYS: Record<string, { name: string; icon: string; theme: string }> = {
  "01-01": { name: "Новый год",                 icon: "🎄", theme: "winter"   },
  "01-02": { name: "Новогодние каникулы",        icon: "🎄", theme: "winter"   },
  "01-03": { name: "Новогодние каникулы",        icon: "🎄", theme: "winter"   },
  "01-04": { name: "Новогодние каникулы",        icon: "🎄", theme: "winter"   },
  "01-05": { name: "Новогодние каникулы",        icon: "🎄", theme: "winter"   },
  "01-06": { name: "Новогодние каникулы",        icon: "🎄", theme: "winter"   },
  "01-07": { name: "Рождество Христово",         icon: "✨", theme: "christmas"},
  "01-08": { name: "Новогодние каникулы",        icon: "🎄", theme: "winter"   },
  "02-23": { name: "День защитника Отечества",   icon: "🎖️", theme: "military" },
  "03-08": { name: "Международный женский день", icon: "🌷", theme: "rose"     },
  "05-01": { name: "Праздник весны и труда",     icon: "🌱", theme: "spring"   },
  "05-09": { name: "День Победы",                icon: "🎗️", theme: "victory"  },
  "06-12": { name: "День России",                icon: "🇷🇺", theme: "tricolor" },
  "11-04": { name: "День народного единства",    icon: "🤝", theme: "unity"    },
};

export function getHolidayRU(dateISO: string): { name: string; icon: string; theme: string } | null {
  return RU_HOLIDAYS[dateISO.slice(5)] ?? null; // "YYYY-MM-DD" → "MM-DD"
}
