"use client";

/**
 * Signatures the user chose to keep in this browser (localStorage only, never sent anywhere).
 * Shared by the Signature Maker (saves them) and Sign PDF (offers them). Every
 * write notifies subscribers so both stay in sync, also across tabs.
 */
import { useSyncExternalStore } from "react";

export interface SavedSignature {
  id: string;
  /** Transparent PNG data URL. */
  dataUrl: string;
  savedAt: number;
}

const KEY = "krea.signatures";
const EVENT = "krea:signatures";
export const MAX_SAVED = 6;
const MAX_BYTES = 400_000;

const EMPTY: SavedSignature[] = [];
let cachedRaw: string | null = null;
let cached: SavedSignature[] = EMPTY;

function read(): SavedSignature[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cached = Array.isArray(parsed)
      ? parsed.filter((entry): entry is SavedSignature => typeof entry?.id === "string" && typeof entry?.dataUrl === "string" && entry.dataUrl.startsWith("data:image/png"))
      : EMPTY;
  } catch {
    cached = EMPTY;
  }
  return cached;
}

function write(list: SavedSignature[]): boolean {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
    else localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(EVENT));
    return true;
  } catch {
    return false;
  }
}

export type SaveOutcome = "saved" | "full" | "too-big" | "blocked";

export function saveSignature(dataUrl: string): SaveOutcome {
  if (dataUrl.length > MAX_BYTES) return "too-big";
  const list = read();
  if (list.length >= MAX_SAVED) return "full";
  const entry: SavedSignature = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, dataUrl, savedAt: Date.now() };
  return write([entry, ...list]) ? "saved" : "blocked";
}

export function deleteSignature(id: string): void {
  write(read().filter((entry) => entry.id !== id));
}

export function deleteAllSignatures(): void {
  write([]);
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Saved signatures, newest first. Empty on the server and during hydration. */
export function useSavedSignatures(): SavedSignature[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
