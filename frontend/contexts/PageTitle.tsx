"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface PageTitleMeta {
  title: string;
  eyebrow?: string;
}

interface PageTitleContextValue {
  meta: PageTitleMeta | null;
  setMeta: (meta: PageTitleMeta | null) => void;
}

const PageTitleContext = createContext<PageTitleContextValue>({
  meta: null,
  setMeta: () => {},
});

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<PageTitleMeta | null>(null);
  return (
    <PageTitleContext.Provider value={{ meta, setMeta }}>
      {children}
    </PageTitleContext.Provider>
  );
}

/** Read the current page title/eyebrow (used in AppTopbar). */
export function usePageTitleMeta(): PageTitleMeta | null {
  return useContext(PageTitleContext).meta;
}

/** Set title+eyebrow from a page component. Clears on unmount. */
export function useSetPageTitle(meta: PageTitleMeta) {
  const { setMeta } = useContext(PageTitleContext);
  const metaRef = useRef(meta);
  metaRef.current = meta;

  useEffect(() => {
    setMeta(metaRef.current);
    return () => setMeta(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.title, meta.eyebrow]);
}
