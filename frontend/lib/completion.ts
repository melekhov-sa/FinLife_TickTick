import { api } from "@/lib/api";

export type CompletableKind = "task" | "habit" | "task_occ";

export function isCompletable(kind: string): kind is CompletableKind {
  return kind === "task" || kind === "habit" || kind === "task_occ";
}

// Мгновенное выполнение/откат задачи (как в TickTick) — прямые вызовы, чтобы
// сохранить анимацию галочки и точно управлять инвалидацией.
export async function completeTaskLike(kind: "task" | "task_occ", id: number) {
  return api.post(kind === "task_occ" ? `/api/v2/task-occurrences/${id}/complete` : `/api/v2/tasks/${id}/complete`);
}
export async function uncompleteTaskLike(kind: "task" | "task_occ", id: number) {
  return api.post(kind === "task_occ" ? `/api/v2/task-occurrences/${id}/uncomplete` : `/api/v2/tasks/${id}/uncomplete`);
}
