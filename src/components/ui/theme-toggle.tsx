"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { applyTheme, readChoice, THEME_EVENT, type ThemeChoice } from "@/lib/theme";

const ORDER: ThemeChoice[] = ["dark", "light", "system"];
const LABELS: Record<ThemeChoice, string> = { dark: "Dark", light: "Light", system: "System" };
const ICONS = { dark: Moon, light: Sun, system: Monitor };

function subscribe(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
}

/** Current theme choice, read from <html> (which the inline script set before paint). */
export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, readChoice, () => "dark");
}

/** Header button that cycles Dark -> Light -> System. */
export function ThemeToggle({ showLabel = false }: { showLabel?: boolean }) {
  const choice = useThemeChoice();
  const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length];
  const Icon = ICONS[choice];

  // Sync the browser chrome colour on load, and follow the OS while on "System".
  useEffect(() => {
    applyTheme(readChoice(), false);
    const media = matchMedia("(prefers-color-scheme: light)");
    const onSystemChange = () => readChoice() === "system" && applyTheme("system", false);
    media.addEventListener("change", onSystemChange);
    return () => media.removeEventListener("change", onSystemChange);
  }, []);

  return (
    <button
      type="button"
      onClick={() => applyTheme(next)}
      aria-label={`Theme: ${LABELS[choice]}. Switch to ${LABELS[next]}`}
      title={`Theme: ${LABELS[choice]}`}
      className="flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-md border border-line px-2 text-sm text-muted transition-colors hover:border-accent hover:text-fg"
    >
      {/* The icon depends on a client-only value, so let the client's version win on hydration. */}
      <span suppressHydrationWarning className="contents">
        <Icon aria-hidden className="size-4" strokeWidth={1.75} />
        {showLabel && <span>{LABELS[choice]}</span>}
      </span>
    </button>
  );
}
