"use client";

import { createContext, useContext } from "react";

export const ScaleContext = createContext<number>(1);

export function useWidgetScale(): number {
  return useContext(ScaleContext);
}
