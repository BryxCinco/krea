"use client";

import { Copy, Download, FolderOpen, Trash2, Undo2 } from "lucide-react";
import { useDeferredValue, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { downloadBlob } from "@/lib/download";
import { useSession } from "@/lib/session";
import { onTabListKeyDown } from "@/lib/use-focus-trap";
import { useTextOp } from "@/lib/use-text-op";
import {
  CASE_MODES,
  formatDuration,
  READING_WPM,
  SORT_MODES,
  SPEAKING_WPM,
  type CaseMode,
  type SortMode,
  type TextOp,
  type TextStats,
} from "@/tools/text/text-toolkit";
import { Group, TextInput } from "./form";
import { EditorShell } from "./editor-shell";

type Tab = "count" | "case" | "lines" | "replace";

const TABS: { id: Tab; label: string }[] = [
  { id: "count", label: "Count" },
  { id: "case", label: "Case" },
  { id: "lines", label: "Lines" },
  { id: "replace", label: "Find & Replace" },
];

const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** A text box that lays out a megabyte of text is slow, so the result box shows the first part of a very long result. */
const PREVIEW_LIMIT = 200_000;

function Check({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (value: boolean) => void; hint?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="flex min-h-10 cursor-pointer items-center gap-3 text-sm text-fg">
        <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-lime" />
        {label}
      </label>
      {hint && <p className="ml-7 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-ink p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 font-mono text-xl text-fg">{value}</dd>
    </div>
  );
}

function StatsView({ stats }: { stats: TextStats }) {
  const n = (value: number) => value.toLocaleString("en-US");
  return (
    <>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Words" value={n(stats.words)} />
        <Stat label="Characters" value={n(stats.characters)} />
        <Stat label="No spaces" value={n(stats.charactersNoSpaces)} />
        <Stat label="Sentences" value={n(stats.sentences)} />
        <Stat label="Paragraphs" value={n(stats.paragraphs)} />
        <Stat label="Lines" value={n(stats.lines)} />
        <Stat label="Reading time" value={formatDuration(stats.readingMinutes)} />
        <Stat label="Speaking time" value={formatDuration(stats.speakingMinutes)} />
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        Reading time assumes {READING_WPM} words a minute and speaking time {SPEAKING_WPM}; real speed varies. A sentence ends at . ! ? or …, so abbreviations such as &quot;Dr.&quot; can add extra sentences.
      </p>
    </>
  );
}

export default function TextToolkitEditor() {
  // Nothing here is saved. The text lives in memory until the tab is closed.
  const [text, setText] = useState("");
  const [tab, setTab] = useState<Tab>("count");
  const [mode, setMode] = useState<CaseMode>("title");
  const [linesAction, setLinesAction] = useState<"dedupe" | "sort">("dedupe");
  const [sortMode, setSortMode] = useState<SortMode>("az");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [trim, setTrim] = useState(true);
  const [removeEmpty, setRemoveEmpty] = useState(true);
  const [find, setFind] = useState("");
  const [replacement, setReplacement] = useState("");
  const [regex, setRegex] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [previous, setPrevious] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { setNotice } = useSession();
  const panelId = useId();

  // Typing stays instant; the heavy work follows the deferred copy.
  const deferred = useDeferredValue(text);
  const request = useMemo<TextOp | null>(() => {
    switch (tab) {
      case "count":
        return { op: "count", text: deferred };
      case "case":
        return { op: "case", text: deferred, mode };
      case "lines":
        return linesAction === "dedupe"
          ? { op: "dedupe", text: deferred, options: { caseSensitive, trim, removeEmpty } }
          : { op: "sort", text: deferred, mode: sortMode, options: { caseSensitive, removeEmpty } };
      case "replace":
        return find ? { op: "replace", text: deferred, find, replacement, options: { regex, caseSensitive, wholeWord } } : null;
    }
  }, [tab, deferred, mode, linesAction, sortMode, caseSensitive, trim, removeEmpty, find, replacement, regex, wholeWord]);
  const state = useTextOp(request);

  // What the result panel shows, and the text that Copy / Download / Use as input act on.
  let output = "";
  let summary = "";
  let error = "";
  let stats: TextStats | null = null;
  const staleOp = state.status === "done" && request !== null && state.result.op !== request.op;
  const working = state.status === "working" || staleOp || (request !== null && state.status === "idle") || deferred !== text;
  if (state.status === "error") error = state.message;
  if (state.status === "done") {
    const { result } = state;
    if (result.op === "count" && tab === "count") stats = result.stats;
    else if (result.op === "case" && tab === "case") output = result.text;
    else if ((result.op === "dedupe" && tab === "lines" && linesAction === "dedupe") || (result.op === "sort" && tab === "lines" && linesAction === "sort")) {
      output = result.lines.text;
      summary =
        result.op === "dedupe"
          ? `Removed ${result.lines.removed.toLocaleString("en-US")} of ${result.lines.total.toLocaleString("en-US")} lines.`
          : `Sorted ${result.lines.total.toLocaleString("en-US")} lines${result.lines.removed ? `, dropped ${result.lines.removed.toLocaleString("en-US")} blank` : ""}.`;
    } else if (result.op === "replace" && tab === "replace") {
      output = result.replaced.text;
      if (result.replaced.error) error = `Invalid pattern: ${result.replaced.error}`;
      else summary = `${result.replaced.count.toLocaleString("en-US")} ${result.replaced.count === 1 ? "match" : "matches"} replaced.`;
    }
  }
  if (tab === "replace" && !find) summary = "Type what to find.";
  const hasOutput = tab !== "count" && !error && !(tab === "replace" && !find);
  const shownOutput = hasOutput ? output : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tab === "count" ? text : shownOutput);
      setNotice("Copied.");
    } catch {
      setNotice("Hindi ma-copy: the browser blocked clipboard access. Select the text and copy it by hand.");
    }
  };

  const openFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setNotice("That file is over 20 MB. Too big for a text box; pumili ng mas maliit na file.");
      return;
    }
    setText(await file.text());
    setPrevious(null);
    setNotice(`Opened ${file.name}.`);
  };

  const form = (
    <>
      <Group
        title="Your text"
        actions={
          <span className="font-mono text-xs text-muted">
            {text.length.toLocaleString("en-US")} {text.length === 1 ? "character" : "characters"}
          </span>
        }
      >
        <div>
          <label htmlFor="toolkit-text" className="sr-only">
            Your text
          </label>
          <textarea
            id="toolkit-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            spellCheck={false}
            placeholder="I-type o i-paste ang text dito."
            className="min-h-48 w-full resize-y rounded-md border border-line bg-ink p-3 font-mono text-sm leading-relaxed text-fg placeholder:text-muted/70 hover:border-muted lg:min-h-64"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-line px-3 text-sm text-fg hover:border-accent">
            <FolderOpen aria-hidden className="size-4" strokeWidth={1.75} />
            Open file
          </button>
          {previous !== null && (
            <button
              type="button"
              onClick={() => {
                setText(previous);
                setPrevious(null);
              }}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-line px-3 text-sm text-fg hover:border-accent"
            >
              <Undo2 aria-hidden className="size-4" strokeWidth={1.75} />
              Undo
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setText("");
              setPrevious(null);
            }}
            disabled={!text}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-line px-3 text-sm text-fg hover:border-signal hover:text-signal disabled:opacity-40"
          >
            <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
            Clear
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".txt,.md,.csv,.log,.json,text/plain,text/csv,text/markdown"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              openFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
      </Group>

      <div role="tablist" aria-label="Text tools" onKeyDown={onTabListKeyDown} className="grid grid-cols-2 gap-1 rounded-md border border-line bg-panel p-1 sm:grid-cols-4">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`${panelId}-tab-${entry.id}`}
            aria-selected={tab === entry.id}
            aria-controls={`${panelId}-panel`}
            tabIndex={tab === entry.id ? 0 : -1}
            onClick={() => setTab(entry.id)}
            className={`min-h-10 rounded px-2 text-sm transition-colors ${tab === entry.id ? "bg-raised font-semibold text-accent" : "text-muted hover:text-fg"}`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${panelId}-panel`} aria-labelledby={`${panelId}-tab-${tab}`} className="flex flex-col gap-5">
        {tab === "count" && <p className="text-sm text-muted">Live counts appear in the Result panel as you type.</p>}

        {tab === "case" && (
          <Group title="Change case">
            <div role="radiogroup" aria-label="Case style" className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {CASE_MODES.map((entry) => (
                <button
                  key={entry.value}
                  type="button"
                  role="radio"
                  aria-checked={mode === entry.value}
                  onClick={() => setMode(entry.value)}
                  className={`flex min-h-14 flex-col items-start justify-center rounded-md border px-3 text-left ${mode === entry.value ? "border-accent bg-raised text-accent" : "border-line text-fg hover:border-muted"}`}
                >
                  <span className="text-sm">{entry.label}</span>
                  <span className="font-mono text-[11px] text-muted">{entry.example}</span>
                </button>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-muted">camelCase, snake_case and kebab-case work line by line, so a list of names stays a list.</p>
          </Group>
        )}

        {tab === "lines" && (
          <Group title="Lines">
            <div role="radiogroup" aria-label="What to do with the lines" className="grid grid-cols-2 gap-1 rounded-md border border-line bg-ink p-1">
              {(
                [
                  ["dedupe", "Remove duplicates"],
                  ["sort", "Sort lines"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={linesAction === value}
                  onClick={() => setLinesAction(value)}
                  className={`min-h-10 rounded px-2 text-sm ${linesAction === value ? "bg-raised font-semibold text-accent" : "text-muted hover:text-fg"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {linesAction === "sort" && (
              <div>
                <label htmlFor="toolkit-sort" className="mb-1.5 block text-sm text-fg">
                  Order
                </label>
                <select
                  id="toolkit-sort"
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as SortMode)}
                  className="min-h-10 w-full rounded-md border border-line bg-ink px-3 text-sm text-fg hover:border-muted"
                >
                  {SORT_MODES.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <Check label="Case sensitive" checked={caseSensitive} onChange={setCaseSensitive} hint={linesAction === "dedupe" ? "Off: Apple and apple count as the same line." : "Off: Apple and apple sort together."} />
            {linesAction === "dedupe" && <Check label="Trim spaces around lines" checked={trim} onChange={setTrim} hint="Compares and keeps lines without leading or trailing spaces." />}
            <Check label="Remove empty lines" checked={removeEmpty} onChange={setRemoveEmpty} />
          </Group>
        )}

        {tab === "replace" && (
          <Group title="Find & Replace">
            <TextInput label="Find" value={find} onChange={setFind} placeholder={regex ? "e.g. (\\d+)-(\\d+)" : "Text to find"} />
            <TextInput label="Replace with" value={replacement} onChange={setReplacement} placeholder={regex ? "e.g. $2/$1" : "Leave empty to delete the matches"} hint={regex ? "Use $1, $2 for groups and $& for the whole match." : undefined} />
            <Check label="Regex" checked={regex} onChange={setRegex} hint="JavaScript regular expressions." />
            <Check label="Case sensitive" checked={caseSensitive} onChange={setCaseSensitive} />
            <Check label="Whole word only" checked={wholeWord} onChange={setWholeWord} />
          </Group>
        )}
      </div>
    </>
  );

  const preview = (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-xs uppercase tracking-widest text-muted">Result</h2>
        <p aria-live="polite" className="font-mono text-xs text-muted">
          {working ? "Working…" : summary}
        </p>
      </div>
      {error && (
        <p role="alert" className="mb-3 rounded-md border border-signal/60 p-3 text-sm text-signal">
          {error}
        </p>
      )}
      {tab === "count" ? (
        stats ? (
          <StatsView stats={stats} />
        ) : (
          <p className="text-sm text-muted">{working ? "Counting…" : "Wala pang text. Type or paste something on the left."}</p>
        )
      ) : (
        <>
        <textarea
          readOnly
          value={shownOutput.length > PREVIEW_LIMIT ? shownOutput.slice(0, PREVIEW_LIMIT) : shownOutput}
          aria-label="Result text"
          placeholder={tab === "replace" && !find ? "Type what to find, and the replaced text appears here." : "The result appears here."}
          className="min-h-64 w-full resize-y rounded-md border border-line bg-ink p-3 font-mono text-sm leading-relaxed text-fg placeholder:text-muted/70 lg:min-h-96"
        />
        {shownOutput.length > PREVIEW_LIMIT && (
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Showing the first {PREVIEW_LIMIT.toLocaleString("en-US")} of {shownOutput.length.toLocaleString("en-US")} characters, to keep the page fast. Copy, TXT and Use as input use the full result.
          </p>
        )}
        </>
      )}
    </div>
  );

  const actions = (
    <>
      <Button variant="primary" onClick={copy} disabled={tab === "count" ? !text : !shownOutput}>
        <Copy aria-hidden className="size-4" strokeWidth={2} />
        Copy {tab === "count" ? "text" : "result"}
      </Button>
      <Button onClick={() => downloadBlob(new Blob([tab === "count" ? text : shownOutput], { type: "text/plain;charset=utf-8" }), "krea-text.txt")} disabled={tab === "count" ? !text : !shownOutput}>
        <Download aria-hidden className="size-4" strokeWidth={1.75} />
        TXT
      </Button>
      {tab !== "count" && (
        <Button
          onClick={() => {
            setPrevious(text);
            setText(shownOutput);
          }}
          disabled={!shownOutput || working}
          title="Put the result in the text box so you can keep working on it"
        >
          Use as input
        </Button>
      )}
    </>
  );

  return <EditorShell label="Text toolkit" form={form} preview={preview} actions={actions} previewLabel="Result" />;
}
