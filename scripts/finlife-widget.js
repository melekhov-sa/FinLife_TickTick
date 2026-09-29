// FinLife / Centricore — виджет для iOS через приложение Scriptable
//
// Один скрипт на все виджеты. Какой именно виджет показывать — задаётся
// в поле "Parameter" при настройке виджета на домашнем экране:
//   cashback — лучшие кэшбеки по категориям
//   today    — фокус дня (задачи)
//
// ── РЕЖИМ ТЕСТА ─────────────────────────────────────────────────────────────
// Пока MOCK = true, скрипт рисует зашитые примеры и НИКУДА НЕ ХОДИТ — это
// нужно, чтобы проверить внешний вид без деплоя и без токена.
// Когда бэкенд будет готов: MOCK = false и вставить TOKEN.

const MOCK = true;
const BASE = "https://centricore.ru";
const TOKEN = ""; // взять в приложении: Настройки → Виджет на iPhone

// ── Тестовые данные ─────────────────────────────────────────────────────────

const MOCK_DATA = {
  cashback: {
    title: "Кэшбек · Сентябрь",
    url: `${BASE}/cashback`,
    empty: "Ставок на этот месяц нет",
    rows: [
      { left: "Кафе и рестораны", right: "10%", note: "Т-Банк", tone: "accent" },
      { left: "Супермаркеты", right: "5%", note: "Альфа-Банк", tone: "accent" },
      { left: "АЗС", right: "5%", note: "Сбер", tone: "normal" },
      { left: "Аптеки", right: "3%", note: "Альфа-Банк", tone: "accent" },
      { left: "Такси", right: "3%", note: "Т-Банк", tone: "normal" },
      { left: "Доставка еды", right: "2%", note: "ВТБ", tone: "normal" },
    ],
  },
  today: {
    title: "Фокус дня · осталось 5",
    url: `${BASE}/plan`,
    empty: "На сегодня всё закрыто",
    rows: [
      { left: "🔧 Записать машину на ТО", right: "просрочено", tone: "warn" },
      { left: "📞 Позвонить в банк", right: "14:30", tone: "normal" },
      { left: "🏋 Тренировка", right: "19:00", tone: "normal" },
      { left: "💊 Купить витамины", right: "", tone: "normal" },
      { left: "📚 Английский, 20 мин", right: "", tone: "normal" },
    ],
  },
};

// ── Палитра (светлая/тёмная — по системной теме) ────────────────────────────

const dark = Device.isUsingDarkAppearance();

const C = dark
  ? {
      bg: new Color("#16131A"),
      text: new Color("#F2EFEA"),
      muted: new Color("#A8A29B"),
      faint: new Color("#7A746E"),
      accent: new Color("#A78BFA"),
      warn: new Color("#E88B8B"),
    }
  : {
      bg: new Color("#FFFDFB"),
      text: new Color("#1E1B16"),
      muted: new Color("#6B6560"),
      faint: new Color("#9A938C"),
      accent: new Color("#7C3AED"),
      warn: new Color("#D25E5E"),
    };

function toneColor(tone) {
  if (tone === "accent") return C.accent;
  if (tone === "warn") return C.warn;
  return C.text;
}

// ── Загрузка данных ─────────────────────────────────────────────────────────

const CACHE = FileManager.local();
const CACHE_DIR = CACHE.joinPath(CACHE.cacheDirectory(), "finlife-widget");

function cachePath(kind) {
  if (!CACHE.fileExists(CACHE_DIR)) CACHE.createDirectory(CACHE_DIR, true);
  return CACHE.joinPath(CACHE_DIR, `${kind}.json`);
}

async function loadData(kind) {
  if (MOCK) return MOCK_DATA[kind] || MOCK_DATA.cashback;

  try {
    const req = new Request(`${BASE}/api/v2/widget/${kind}?token=${TOKEN}`);
    req.timeoutInterval = 15;
    const data = await req.loadJSON();
    // Кэшируем последний успешный ответ, чтобы без сети показать вчерашнее,
    // а не пустой виджет.
    CACHE.writeString(cachePath(kind), JSON.stringify(data));
    return data;
  } catch (e) {
    const p = cachePath(kind);
    if (CACHE.fileExists(p)) {
      const stale = JSON.parse(CACHE.readString(p));
      stale.stale = true;
      return stale;
    }
    return { title: "FinLife", rows: [], empty: "Нет связи с сервером", url: BASE };
  }
}

// ── Отрисовка ───────────────────────────────────────────────────────────────

const LIMITS = { small: 3, medium: 6, large: 10, extraLarge: 10 };

function buildWidget(data, family) {
  const limit = LIMITS[family] || 6;
  const compact = family === "small";

  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.setPadding(12, 14, 12, 14);
  if (data.url) w.url = data.url;
  // Данные меняются редко (кэшбеки — раз в месяц), чаще опрашивать незачем.
  w.refreshAfterDate = new Date(Date.now() + 60 * 60 * 1000);

  const title = w.addText(data.stale ? `${data.title} ·` : data.title);
  title.font = Font.semiboldSystemFont(compact ? 11 : 12);
  title.textColor = C.faint;
  title.lineLimit = 1;
  w.addSpacer(compact ? 6 : 8);

  const rows = (data.rows || []).slice(0, limit);

  if (rows.length === 0) {
    const e = w.addText(data.empty || "Пусто");
    e.font = Font.systemFont(compact ? 12 : 13);
    e.textColor = C.muted;
    w.addSpacer();
    return w;
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const line = w.addStack();
    line.layoutHorizontally();
    line.centerAlignContent();

    const left = line.addText(r.left || "");
    left.font = Font.systemFont(compact ? 12 : 13);
    left.textColor = C.text;
    left.lineLimit = 1;
    left.minimumScaleFactor = 0.85;

    line.addSpacer();

    if (r.right) {
      const right = line.addText(r.right);
      right.font =
        r.tone === "accent"
          ? Font.boldSystemFont(compact ? 12 : 13)
          : Font.mediumSystemFont(compact ? 12 : 13);
      right.textColor = toneColor(r.tone);
      right.lineLimit = 1;
    }

    // Название карты помещается только на средних и больших виджетах.
    if (r.note && !compact) {
      line.addSpacer(6);
      const note = line.addText(r.note);
      note.font = Font.systemFont(11);
      note.textColor = C.faint;
      note.lineLimit = 1;
    }

    if (i < rows.length - 1) w.addSpacer(compact ? 4 : 5);
  }

  w.addSpacer();
  return w;
}

// ── Точка входа ─────────────────────────────────────────────────────────────

const kind = (args.widgetParameter || "cashback").trim();
const data = await loadData(kind);
const family = config.widgetFamily || "medium";
const widget = buildWidget(data, family);

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  // Запуск внутри приложения Scriptable — показать предпросмотр.
  if (family === "small") await widget.presentSmall();
  else if (family === "large") await widget.presentLarge();
  else await widget.presentMedium();
}
Script.complete();
