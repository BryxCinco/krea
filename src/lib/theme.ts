/**
 * Theme: Dark (default), Light or System. The choice is stored in localStorage;
 * the resolved theme is written to <html data-theme> so CSS variables switch.
 */
export type ThemeChoice = "dark" | "light" | "system";

export const THEME_KEY = "krea.theme";
export const THEME_EVENT = "krea:theme";

/** Browser chrome colour per theme (matches --ink in globals.css). */
const CHROME = { dark: "#0a0b08", light: "#f5f2e9" };

/**
 * Runs inline in <head> before the first paint, so the page never flashes the
 * wrong theme. Keep it dependency-free: it is injected as a string.
 */
export const themeScript = `(function(){try{var c=localStorage.getItem("${THEME_KEY}")||"dark";var t=c==="system"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):c;var d=document.documentElement;d.dataset.theme=t;d.dataset.themeChoice=c;}catch(e){}})()`;

export function readChoice(): ThemeChoice {
  return (document.documentElement.dataset.themeChoice as ThemeChoice | undefined) ?? "dark";
}

/** Apply a choice to the document (and remember it when `persist` is set). */
export function applyTheme(choice: ThemeChoice, persist = true): void {
  const resolved =
    choice === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : choice;
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themeChoice = choice;
  // Keep the browser UI / PWA title bar in step with the page.
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute("content", CHROME[resolved]));
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, choice);
    } catch {
      // Private mode: the theme still applies for this visit.
    }
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}
