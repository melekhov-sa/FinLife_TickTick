export type CompletableKind = "task" | "habit" | "task_occ";

export function isCompletable(kind: string): kind is CompletableKind {
  return kind === "task" || kind === "habit" || kind === "task_occ";
}
