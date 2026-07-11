/**
 * Template перемонтируется при каждой навигации — контент страницы
 * мягко «поднимается» (animate-rise, fill backwards: transform не
 * остаётся, position:fixed внутри страниц не ломается).
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col flex-1 min-h-0 animate-rise">{children}</div>;
}
