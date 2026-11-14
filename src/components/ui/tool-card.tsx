"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { PointerEvent } from "react";
import { ToolIcon } from "./icon";
import type { IconKey } from "@/tools/types";

export interface ToolCardData {
  slug: string;
  name: string;
  description: string;
  icon: IconKey;
  categoryLabel: string;
}

/** How a card relates to the files on the Stage. */
export type CardFit = "neutral" | "match" | "dim";

/** Maximum tilt in degrees. Small on purpose: a hint of depth, not a gimmick. */
const TILT = 5;

/**
 * A tool card. The whole card is one link. It tilts slightly toward the
 * pointer and an accent light follows it (CSS in styles/kinetic.css reads the
 * custom properties written here). No React state changes while moving.
 */
export function ToolCard({ tool, index, fit }: { tool: ToolCardData; index: number; fit: CardFit }) {
  const onMove = (event: PointerEvent<HTMLAnchorElement>) => {
    const card = event.currentTarget;
    const box = card.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;
    card.style.setProperty("--mx", `${x * 100}%`);
    card.style.setProperty("--my", `${y * 100}%`);
    card.style.setProperty("--ry", `${(x - 0.5) * 2 * TILT}deg`);
    card.style.setProperty("--rx", `${(0.5 - y) * 2 * TILT}deg`);
    card.dataset.lit = "true";
  };
  const onLeave = (event: PointerEvent<HTMLAnchorElement>) => {
    const card = event.currentTarget;
    card.style.setProperty("--rx", "0deg");
    card.style.setProperty("--ry", "0deg");
    card.dataset.lit = "false";
  };

  return (
    <Link
      href={`/tools/${tool.slug}`}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      onPointerCancel={onLeave}
      style={{ "--i": Math.min(index, 14) } as React.CSSProperties}
      className={`tool-card group flex h-full gap-4 overflow-hidden rounded-2xl border p-4 sm:flex-col sm:p-5 ${
        fit === "match" ? "border-accent bg-panel" : fit === "dim" ? "border-dashed border-line bg-ink hover:border-accent" : "border-line bg-panel hover:border-accent"
      }`}
    >
      {/* Dimmed cards fade only the icon; all text keeps full AA contrast. */}
      <span
        className={`flex size-12 shrink-0 items-center justify-center rounded-xl transition-colors ${
          fit === "match"
            ? "bg-lime text-on-lime"
            : fit === "dim"
              ? "bg-raised text-muted opacity-50 group-hover:opacity-100"
              : "bg-raised text-accent group-hover:bg-lime group-hover:text-on-lime"
        }`}
      >
        <ToolIcon name={tool.icon} className="size-6" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex flex-wrap items-baseline gap-x-2 font-mono text-[11px] uppercase tracking-widest text-muted">
          {tool.categoryLabel}
          {fit === "match" && <span className="text-accent">Works with your file</span>}
          {fit === "dim" && <span>Not for this file</span>}
        </span>
        <span className="mt-1 text-lg font-semibold leading-tight text-fg">{tool.name}</span>
        <span className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">{tool.description}</span>
        <span className="mt-auto flex items-center gap-1 pt-3 text-sm font-medium text-accent">
          {fit === "match" ? "Open with your file" : "Open"}
          <ArrowUpRight aria-hidden className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" strokeWidth={1.75} />
        </span>
      </span>
    </Link>
  );
}

/** Loading placeholder with the same footprint as a card. */
export function ToolCardSkeleton() {
  return (
    <div aria-hidden className="flex h-full gap-4 rounded-2xl border border-line bg-panel p-4 sm:flex-col sm:p-5">
      <span className="skeleton size-12 shrink-0 rounded-xl" />
      <span className="flex flex-1 flex-col gap-2">
        <span className="skeleton h-3 w-16 rounded" />
        <span className="skeleton h-5 w-40 max-w-full rounded" />
        <span className="skeleton h-4 w-full rounded" />
        <span className="skeleton h-4 w-2/3 rounded" />
      </span>
    </div>
  );
}
