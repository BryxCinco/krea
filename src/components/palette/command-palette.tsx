"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CornerDownLeft, LayoutList, Link2, Monitor, Moon, Search, Sun, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ToolIcon } from "@/components/ui/icon";
import { useSession } from "@/lib/session";
import { applyTheme } from "@/lib/theme";
import { OPEN_CHAINS_EVENT } from "@/components/ui/app-header";
import { categories, tools } from "@/tools/registry";

/** Fired by the header button to open the palette. */
export const OPEN_PALETTE_EVENT = "krea:open-palette";

interface Command {
  id: string;
  label: string;
  detail: string;
  /** Extra text matched by search but not shown. */
  keywords: string;
  icon: ReactNode;
  run: () => void;
}

/** Command Palette: Ctrl+K (or Cmd+K), or "/" when not typing, jumps straight to any tool. */
export function CommandPalette() {
  const router = useRouter();
  const { wipe } = useSession();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  const show = () => {
    restoreFocus.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setActive(0);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    restoreFocus.current?.focus();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if ((event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey)) || (event.key === "/" && !typing)) {
        event.preventDefault();
        show();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, show);
    };
  }, []);

  const commands = useMemo<Command[]>(
    () => [
      ...tools.map((tool) => ({
        id: tool.slug,
        label: tool.name,
        detail: (categories.find((entry) => entry.id === tool.category)?.label ?? tool.category).toUpperCase(),
        keywords: `${tool.verb} ${tool.description}`,
        icon: <ToolIcon name={tool.icon} />,
        run: () => router.push(`/tools/${tool.slug}`),
      })),
      {
        id: "all-tools",
        label: "All Tools",
        detail: "PAGE",
        keywords: "browse list directory",
        icon: <LayoutList aria-hidden className="size-4" strokeWidth={1.75} />,
        run: () => router.push("/tools"),
      },
      {
        id: "chains",
        label: "Render Chains",
        detail: "PANEL",
        keywords: "chain pipeline preset gov portal 2x2 email",
        icon: <Link2 aria-hidden className="size-4" strokeWidth={1.75} />,
        run: () => (location.pathname === "/" ? window.dispatchEvent(new Event(OPEN_CHAINS_EVENT)) : router.push("/#chains")),
      },
      ...(
        [
          ["dark", "Dark", Moon],
          ["light", "Light", Sun],
          ["system", "System", Monitor],
        ] as const
      ).map(([choice, label, Icon]) => ({
        id: `theme-${choice}`,
        label: `Theme: ${label}`,
        detail: "THEME",
        keywords: "theme mode appearance color dark light system",
        icon: <Icon aria-hidden className="size-4" strokeWidth={1.75} />,
        run: () => applyTheme(choice),
      })),
      {
        id: "wipe",
        label: "Wipe session",
        detail: "ACTION",
        keywords: "clear delete remove files privacy",
        icon: <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />,
        run: wipe,
      },
    ],
    [router, wipe],
  );

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return commands.filter((command) => {
      const haystack = `${command.label} ${command.keywords}`.toLowerCase();
      return words.every((word) => haystack.includes(word));
    });
  }, [commands, query]);

  const choose = (command: Command | undefined) => {
    if (!command) return;
    close();
    command.run();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      close();
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(results[active]);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = (active + (event.key === "ArrowDown" ? 1 : -1) + results.length) % Math.max(1, results.length);
      setActive(next);
      listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Tab") {
      // The input is the only tab stop; options are reached with the arrow keys.
      event.preventDefault();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-3 pt-[12dvh]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="absolute inset-0 bg-scrim"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 500, damping: 34 }}
            className="relative w-full max-w-xl overflow-hidden rounded-xl border border-line bg-panel shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search aria-hidden className="size-5 shrink-0 text-muted" strokeWidth={1.75} />
              <input
                autoFocus
                type="text"
                role="combobox"
                aria-expanded="true"
                aria-controls="palette-list"
                aria-activedescendant={results[active] ? `palette-${results[active].id}` : undefined}
                aria-label="Search tools"
                placeholder="Ano'ng kailangan mo? Type a tool name"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                className="h-14 w-full bg-transparent text-base text-fg outline-none placeholder:text-muted"
              />
              <kbd className="hidden shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-xs text-muted sm:block">Esc</kbd>
            </div>
            <ul ref={listRef} id="palette-list" role="listbox" aria-label="Tools" className="max-h-[52dvh] overflow-y-auto p-2">
              {results.map((command, index) => (
                <li
                  key={command.id}
                  id={`palette-${command.id}`}
                  role="option"
                  aria-selected={index === active}
                  onPointerMove={() => setActive(index)}
                  onClick={() => choose(command)}
                  className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-3 ${
                    index === active ? "bg-raised text-accent" : "text-fg"
                  }`}
                >
                  {command.icon}
                  <span className="flex-1 truncate">{command.label}</span>
                  <span className="font-mono text-[11px] text-muted">{command.detail}</span>
                  {index === active && <CornerDownLeft aria-hidden className="size-4 text-muted" strokeWidth={1.75} />}
                </li>
              ))}
              {results.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-muted">Walang nahanap for &quot;{query}&quot;.</li>
              )}
            </ul>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
