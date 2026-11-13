"use client";

/** Page selection for PDFs: tap page numbers, or type ranges like "1-3, 7". Both stay in sync. */

/** Past this many pages a button grid stops being useful; typing ranges is faster. */
const MAX_BUTTONS = 120;

/** Lenient parse for the UI: ignores anything invalid instead of throwing. */
function parsePages(input: string, pageCount: number): Set<number> {
  const pages = new Set<number>();
  for (const part of input.split(",")) {
    const match = /^\s*(\d+)?\s*(-)?\s*(\d+)?\s*$/.exec(part);
    if (!match || (!match[1] && !match[3])) continue;
    const start = match[1] ? Number(match[1]) : 1;
    const end = match[2] ? (match[3] ? Number(match[3]) : pageCount) : start;
    for (let page = Math.max(1, start); page <= Math.min(pageCount, end); page++) pages.add(page);
  }
  return pages;
}

/** {1,2,3,7} -> "1-3, 7" */
function toRanges(pages: Set<number>): string {
  const sorted = [...pages].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let end = i;
    while (sorted[end + 1] === sorted[end] + 1) end++;
    parts.push(end === i ? `${sorted[i]}` : `${sorted[i]}-${sorted[end]}`);
    i = end;
  }
  return parts.join(", ");
}

interface PagePickerProps {
  id: string;
  value: string;
  pageCount?: number;
  hintId?: string;
  onChange: (value: string) => void;
}

export function PagePicker({ id, value, pageCount, hintId, onChange }: PagePickerProps) {
  const selected = pageCount ? parsePages(value, pageCount) : new Set<number>();

  const toggle = (page: number) => {
    const next = new Set(selected);
    if (next.has(page)) next.delete(page);
    else next.add(page);
    onChange(toRanges(next));
  };

  return (
    <div>
      <input
        id={id}
        type="text"
        inputMode="text"
        value={value}
        placeholder="e.g. 1-3, 7"
        aria-describedby={hintId}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-10 w-full rounded-md border border-line bg-ink px-3 font-mono text-sm text-fg placeholder:text-muted/70 hover:border-muted"
      />
      {pageCount !== undefined && (
        <p className="mt-1.5 font-mono text-xs text-muted">
          {selected.size} of {pageCount} pages selected
        </p>
      )}
      {pageCount !== undefined && pageCount <= MAX_BUTTONS && (
        <div role="group" aria-label="Pages" className="mt-2 grid max-h-44 grid-cols-6 gap-1 overflow-y-auto pr-1">
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              type="button"
              aria-pressed={selected.has(page)}
              aria-label={`Page ${page}`}
              onClick={() => toggle(page)}
              className={`min-h-9 rounded border font-mono text-xs transition-colors ${
                selected.has(page) ? "border-lime bg-lime text-ink" : "border-line text-muted hover:border-lime hover:text-fg"
              }`}
            >
              {page}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
