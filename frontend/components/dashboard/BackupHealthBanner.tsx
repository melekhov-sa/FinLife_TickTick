"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import type { BackupStatus } from "@/types/api";

/**
 * Полоса-предупреждение о бэкапе. Когда всё хорошо — не рендерится вовсе.
 *
 * Зачем: выгрузка бэкапов однажды сломалась и прожила так месяцами. Скрипт
 * честно писал об этом в лог, но логи никто не читает. Дашборд читают каждый
 * день — пусть поломка попадается на глаза сама.
 */
export function BackupHealthBanner() {
  const { data } = useQuery<BackupStatus>({
    queryKey: ["backup-status"],
    queryFn: () => api.get<BackupStatus>("/api/v2/system/backup-status"),
    // Не админ получит 403 — это нормально, просто молчим и не повторяем.
    retry: false,
    staleTime: 30 * 60 * 1000,
  });

  if (!data || data.healthy) return null;

  return (
    <div
      className="flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 border"
      style={{
        background: "rgba(245, 158, 11, 0.08)",
        borderColor: "rgba(245, 158, 11, 0.35)",
      }}
    >
      <AlertTriangle size={16} className="shrink-0 mt-0.5" style={{ color: "#d97706" }} />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold" style={{ color: "var(--t-primary)" }}>
          Бэкап: {data.problem ?? "что-то не так"}
        </p>
        <p className="text-[12px] mt-0.5" style={{ color: "var(--t-muted)" }}>
          {data.last_run_at
            ? `Последний запуск: ${new Date(data.last_run_at).toLocaleString("ru-RU", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : "Проверь cron и настройки Яндекс.Диска на сервере."}
        </p>
      </div>
    </div>
  );
}
