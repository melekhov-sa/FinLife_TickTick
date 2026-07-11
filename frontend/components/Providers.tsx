"use client";

import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { ToastProvider } from "@/components/primitives/Toast";

// SSR-безопасная заглушка хранилища (на сервере окна нет)
const noopStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            // держим кэш сутки — иначе персист бесполезен (GC съест раньше)
            gcTime: 24 * 60 * 60 * 1000,
            retry: (failureCount, error) => {
              if (error instanceof Error && error.message.includes("401")) return false;
              if (error instanceof Error && error.message.includes("404")) return false;
              return failureCount < 2;
            },
          },
        },
      })
  );

  // Персист кэша запросов: холодный старт мгновенно рисует последние данные,
  // свежее подтягивается фоном. buster бампать при смене схем данных.
  const [persister] = useState(() =>
    createSyncStoragePersister({
      storage: typeof window !== "undefined" ? window.localStorage : noopStorage,
      key: "finlife-query-cache",
      throttleTime: 2000,
    })
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: 24 * 60 * 60 * 1000,
          buster: "v1",
        }}
      >
        <ToastProvider>{children}</ToastProvider>
      </PersistQueryClientProvider>
    </ThemeProvider>
  );
}
