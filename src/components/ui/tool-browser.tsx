"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useSession } from "@/lib/session";
import { categories, movesFor, tools } from "@/tools/registry";
import type { ToolCategory } from "@/tools/types";
import { ToolCard, type CardFit } from "./tool-card";
import { onTabListKeyDown } from "@/lib/use-focus-trap";

type Tab = "all" | ToolCategory;

/**
 * Browse tools: category tabs, live search and the card grid.
 * When files are on the Stage, cards for tools that can open them light up and
 * the rest dim, so browsing and the file-first flow work together.
 */
export function ToolBrowser() {
  const { files } = useSession();
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");

  const compatible = useMemo(
    () => new Set(movesFor(files.map((file) => file.mime)).map((move) => move.tool.slug)),
    [files],
  );
  const tabs = useMemo(
    () => [
      { id: "all" as Tab, label: "All", count: tools.length },
      ...categories
        .map((category) => ({
          id: category.id as Tab,
          label: category.label,
          count: tools.filter((tool) => tool.category === category.id).length,
        })),
    ],
    [],
  );

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const visible = tools.filter((tool) => {
    if (tab !== "all" && tool.category !== tab) return false;
    const haystack = `${tool.name} ${tool.verb} ${tool.description}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });

  return (
    <div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" onKeyDown={onTabListKeyDown} aria-label="Tool categories" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
          {tabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={tab === entry.id}
              aria-controls="tool-grid-panel"
              onClick={() => setTab(entry.id)}
              className={`flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm transition-colors ${
                tab === entry.id ? "border-accent bg-lime font-semibold text-on-lime" : "border-line text-fg hover:border-accent"
              }`}
            >
              {entry.label}
              <span className={`font-mono text-[11px] ${tab === entry.id ? "text-on-lime/70" : "text-muted"}`}>
                {String(entry.count).padStart(2, "0")}
              </span>
            </button>
          ))}
        </div>
        <label className="relative block lg:w-72">
          <span className="sr-only">Filter tools</span>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" strokeWidth={1.75} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter tools"
            className="min-h-11 w-full rounded-full border border-line bg-panel pl-9 pr-4 text-sm text-fg placeholder:text-muted hover:border-muted"
          />
        </label>
      </div>

      {files.length > 0 && (
        <p className="mt-4 text-sm leading-relaxed text-muted" aria-live="polite">
          {compatible.size > 0
            ? `Naka-highlight ang ${compatible.size} tools that can open what is on the Stage.`
            : "Walang tool na pwede sa lahat ng files sa Stage nang sabay."}
        </p>
      )}

      {/* Re-keyed on the filter so the staggered entry replays when the set changes. */}
      <div id="tool-grid-panel" role="tabpanel" aria-label="Tools">
      <ul id="tool-grid" key={`${tab}|${words.join(" ")}`} className="mt-5 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((tool, index) => {
          let fit: CardFit = "neutral";
          if (files.length > 0) fit = compatible.has(tool.slug) ? "match" : "dim";
          return (
            <li key={tool.slug}>
              <ToolCard
                index={index}
                fit={fit}
                tool={{
                  slug: tool.slug,
                  name: tool.name,
                  description: tool.description,
                  icon: tool.icon,
                  categoryLabel: categories.find((category) => category.id === tool.category)?.label ?? "",
                }}
              />
            </li>
          );
        })}
      </ul>
      </div>
      {visible.length === 0 && <p className="py-10 text-center text-muted">Walang nahanap for &quot;{query}&quot;. Try another word.</p>}
    </div>
  );
}
