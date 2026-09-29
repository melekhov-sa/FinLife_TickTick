// FinLife — загрузчик виджета. Запусти один раз (и потом для обновлений).
// Скачивает основной скрипт из репозитория и сохраняет его как "FinLife".
const url = "https://raw.githubusercontent.com/melekhov-sa/FinLife_TickTick/main/scripts/finlife-widget.js";
const code = await new Request(url).loadString();
let fm = FileManager.local();
try { const ic = FileManager.iCloud(); ic.documentsDirectory(); fm = ic; } catch (e) {}
fm.writeString(fm.joinPath(fm.documentsDirectory(), "FinLife.js"), code);
const a = new Alert();
a.title = "Готово";
a.message = "Скрипт FinLife сохранён — он появился в списке Scriptable.";
a.addAction("OK");
await a.present();
