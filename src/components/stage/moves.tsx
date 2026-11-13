"use client";

import { motion } from "framer-motion";
import { ToolIcon } from "@/components/ui/icon";
import type { Move } from "@/tools/types";

/** The Moves offered for the files on the Stage, as chips that spring in one after another. */
export function Moves({
  moves,
  activeSlug,
  onPick,
}: {
  moves: Move[];
  activeSlug: string | null;
  onPick: (slug: string) => void;
}) {
  return (
    <div role="group" aria-label="Moves for these files" className="flex flex-wrap gap-2">
      {moves.map(({ tool, batch }, index) => {
        const active = tool.slug === activeSlug;
        return (
          <motion.button
            key={tool.slug}
            type="button"
            aria-pressed={active}
            onClick={() => onPick(tool.slug)}
            initial={{ opacity: 0, y: 14, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 24, delay: index * 0.045 }}
            whileTap={{ scale: 0.95 }}
            className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm transition-colors ${
              active ? "border-accent bg-lime font-semibold text-on-lime" : "border-line bg-panel text-fg hover:border-accent"
            }`}
          >
            <ToolIcon name={tool.icon} />
            {tool.verb}
            {batch && tool.input === "each" && (
              <span className={`font-mono text-[11px] ${active ? "text-on-lime/70" : "text-muted"}`}>batch</span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
