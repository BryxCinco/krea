"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Play, SlidersHorizontal, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ToolIcon } from "@/components/ui/icon";
import type { OptionValues, Tool } from "@/tools/types";
import { Fields } from "./fields";

export interface InspectorProps {
  tool: Tool;
  values: OptionValues;
  pageCount?: number;
  running: boolean;
  /** Why the Move cannot run yet, or null when it can. */
  blocked: string | null;
  /** Non-blocking heads-up, e.g. a very large output. */
  warning?: string | null;
  runLabel: string;
  onChange: (patch: OptionValues) => void;
  onRun: () => void;
  onCancel: () => void;
}

function RunButton({ running, blocked, runLabel, onRun, onCancel, className = "" }: InspectorProps & { className?: string }) {
  return running ? (
    <Button variant="signal" className={`min-h-12 ${className}`} onClick={onCancel}>
      <Square aria-hidden className="size-4" strokeWidth={2} />
      Cancel
    </Button>
  ) : (
    <Button variant="primary" className={`min-h-12 ${className}`} disabled={Boolean(blocked)} onClick={onRun}>
      <Play aria-hidden className="size-4" strokeWidth={2} />
      {runLabel}
    </Button>
  );
}

/**
 * Settings for the active Move.
 * Desktop: a fixed panel on the right.
 * Mobile: a thumb-reachable action bar pinned to the bottom, with the settings in a bottom sheet.
 */
export function Inspector(props: InspectorProps) {
  const { tool, values, pageCount, blocked, warning, onChange } = props;
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setSheetOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  const heading = (
    <div className="flex items-center gap-2">
      <ToolIcon name={tool.icon} className="size-5 text-accent" />
      <h2 className="text-lg font-semibold text-fg">{tool.name}</h2>
    </div>
  );
  const fields = <Fields tool={tool} values={values} pageCount={pageCount} onChange={onChange} />;
  const blockedNote = (blocked || warning) && (
    <p role="status" className="text-sm leading-relaxed text-signal">
      {blocked ?? warning}
    </p>
  );

  return (
    <>
      {/* Desktop panel */}
      <aside aria-label={`${tool.name} settings`} className="hidden w-[340px] shrink-0 border-l border-line bg-panel lg:block">
        <div className="sticky top-(--header-h) flex max-h-[calc(100dvh-var(--header-h))] flex-col gap-5 overflow-y-auto p-5">
          {heading}
          <p className="-mt-3 text-sm leading-relaxed text-muted">{tool.description}</p>
          {fields}
          {blockedNote}
          <RunButton {...props} className="w-full" />
        </div>
      </aside>

      {/* Mobile action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 px-3 pt-3 backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        {blockedNote && <div className="mb-2">{blockedNote}</div>}
        <div className="flex gap-2">
          <Button className="min-h-12" aria-haspopup="dialog" onClick={() => setSheetOpen(true)}>
            <SlidersHorizontal aria-hidden className="size-4" strokeWidth={1.75} />
            Settings
          </Button>
          <RunButton {...props} className="flex-1" />
        </div>
      </div>

      {/* Mobile bottom sheet */}
      <AnimatePresence>
        {sheetOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSheetOpen(false)}
              className="absolute inset-0 bg-scrim"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={`${tool.name} settings`}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
              className="absolute inset-x-0 bottom-0 flex max-h-[82dvh] flex-col rounded-t-2xl border-t border-line bg-panel"
            >
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                {heading}
                <Button variant="ghost" icon aria-label="Close settings" autoFocus onClick={() => setSheetOpen(false)}>
                  <X aria-hidden className="size-5" strokeWidth={1.75} />
                </Button>
              </div>
              <div className="overflow-y-auto p-4">{fields}</div>
              <div className="border-t border-line px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <Button variant="primary" className="min-h-12 w-full" onClick={() => setSheetOpen(false)}>
                  Done
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
