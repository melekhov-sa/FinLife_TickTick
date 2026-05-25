export interface TaskCompletionContext {
  is_early: boolean;
  days_early: number;
  days_overdue: number;
}

export interface HabitCompletionContext {
  streak: number;
  is_milestone: boolean;
}

export interface CompletionEvent {
  type: "task" | "habit";
  xp_gained: number;
  task_ctx?: TaskCompletionContext;
  habit_ctx?: HabitCompletionContext;
}

type Listener = (event: CompletionEvent) => void;
const listeners = new Set<Listener>();

export function emitCompletion(event: CompletionEvent): void {
  listeners.forEach((l) => l(event));
}

export function subscribeToCompletions(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
