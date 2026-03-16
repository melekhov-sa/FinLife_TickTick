"use client";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
      <h2
        className="text-lg font-semibold"
        style={{ color: "var(--t-primary)" }}
      >
        Что-то пошло не так
      </h2>
      <pre
        className="text-xs max-w-xl w-full overflow-auto p-4 rounded-xl border"
        style={{
          color: "var(--t-secondary)",
          background: "rgba(255,255,255,0.03)",
          borderColor: "rgba(255,255,255,0.08)",
        }}
      >
        {error.message}
        {"\n\n"}
        {error.stack}
      </pre>
      <button
        onClick={reset}
        className="px-4 py-2 text-sm font-medium rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
      >
        Попробовать снова
      </button>
    </div>
  );
}
