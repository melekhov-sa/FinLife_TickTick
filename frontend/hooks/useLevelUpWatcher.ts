"use client";

import { useEffect, useRef, useState } from "react";
import { useDashboard } from "./useDashboard";
import { useMe } from "./useMe";

const STORAGE_KEY_PREFIX = "finlife_last_level_";

function getStorageKey(userId: number): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

function readStoredLevel(key: string): number | null {
  // Guard against SSR — localStorage is browser-only
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) ? null : parsed;
  } catch {
    return null;
  }
}

function writeStoredLevel(key: string, level: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, String(level));
  } catch {
    // storage quota / private mode — ignore silently
  }
}

/**
 * Watches the dashboard level value and returns the level number to celebrate
 * when a level-up is detected (new level > last known level from localStorage).
 *
 * Returns { celebrateLevel, dismiss }:
 *   - celebrateLevel: number | null — non-null when overlay should be shown
 *   - dismiss: () => void — call after user dismisses the overlay
 */
export function useLevelUpWatcher(): {
  celebrateLevel: number | null;
  dismiss: () => void;
} {
  const { data: me } = useMe();
  const { data: dashboard } = useDashboard();

  // Whether baseline has been established for this session
  const baselineSetRef = useRef(false);
  // Track userId for which baseline was established (handles logout/re-login)
  const baselineUserRef = useRef<number | null>(null);

  // Pending level-up detected by the effect — applied async to satisfy lint rule
  const pendingLevelRef = useRef<number | null>(null);
  const [celebrateLevel, setCelebrateLevel] = useState<number | null>(null);

  useEffect(() => {
    // Wait until both me and dashboard are loaded
    if (!me || !dashboard?.level) return;

    const userId = me.id;
    const currentLevel = dashboard.level.level;
    const storageKey = getStorageKey(userId);

    // If user changed (different account) — reset baseline tracking
    if (baselineUserRef.current !== userId) {
      baselineSetRef.current = false;
      baselineUserRef.current = userId;
    }

    const storedLevel = readStoredLevel(storageKey);

    if (storedLevel === null) {
      // First ever load for this user — establish baseline silently, no overlay
      writeStoredLevel(storageKey, currentLevel);
      baselineSetRef.current = true;
      return;
    }

    if (!baselineSetRef.current) {
      // Baseline already in localStorage from a previous session — mark as set
      baselineSetRef.current = true;
    }

    // Only trigger level-up if level increased (never on decrease or same)
    if (currentLevel > storedLevel) {
      // Update stored level BEFORE showing overlay to prevent duplicate triggers
      // on rapid refetches
      writeStoredLevel(storageKey, currentLevel);
      // Schedule the state update outside the effect body to satisfy lint rule
      pendingLevelRef.current = currentLevel;
    }
  }, [me, dashboard?.level]);

  // Apply pending level-up asynchronously (avoids "setState in effect" lint error)
  useEffect(() => {
    if (pendingLevelRef.current === null) return;
    const level = pendingLevelRef.current;
    pendingLevelRef.current = null;
    const id = setTimeout(() => {
      setCelebrateLevel(level);
    }, 0);
    return () => clearTimeout(id);
  });

  const dismiss = () => {
    setCelebrateLevel(null);
  };

  return { celebrateLevel, dismiss };
}
