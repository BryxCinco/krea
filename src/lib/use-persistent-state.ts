"use client";

import { useEffect, useRef, useState } from "react";

/**
 * State that is saved to localStorage (debounced) and restored on load.
 * Only used by the document editors, whose data the user expects to find
 * again. Must be used in client-only components (the editors are loaded with
 * ssr: false), because the initial value is read from storage synchronously.
 *
 * `restore` validates or migrates what was stored; return null to discard it.
 */
export function usePersistentState<T>(key: string, initial: () => T, restore: (stored: unknown) => T | null = (stored) => stored as T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) return restore(JSON.parse(raw)) ?? initial();
    } catch {
      // Corrupt or blocked storage: start fresh.
    }
    return initial();
  });
  const [saved, setSaved] = useState<"saved" | "pending" | "error">("saved");
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        setSaved("saved");
      } catch {
        // Quota exceeded (e.g. a very large logo) or storage blocked.
        setSaved("error");
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      setSaved("pending");
    };
  }, [key, value]);

  const clear = (next: T) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing to remove.
    }
    setValue(next);
  };

  return { value, setValue, saved, clear } as const;
}
