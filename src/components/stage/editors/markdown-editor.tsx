"use client";

import { Bold, Code, FileCode2, FileDown, FolderOpen, Heading2, Italic, Link, List, ListOrdered, Minus, Printer, Quote, Table, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { downloadBlob } from "@/lib/download";
import { printDocument } from "@/lib/print";
import { useSession } from "@/lib/session";
import { usePersistentState } from "@/lib/use-persistent-state";
import { fileSafe, MARKDOWN_SAMPLE, markdownDocument, markdownTitle } from "@/tools/text/markdown";
import { DocPreview } from "./doc-preview";
import { ConfirmButton } from "./form";
import { EditorShell } from "./editor-shell";

type Edit = { before: string; after: string; placeholder: string; block?: boolean };

/** Toolbar actions. Each wraps the selection, or inserts a placeholder when nothing is selected. */
const ACTIONS: { id: string; label: string; shortcut?: string; icon: typeof Bold; edit: Edit }[] = [
  { id: "bold", label: "Bold", shortcut: "Ctrl+B", icon: Bold, edit: { before: "**", after: "**", placeholder: "bold text" } },
  { id: "italic", label: "Italic", shortcut: "Ctrl+I", icon: Italic, edit: { before: "*", after: "*", placeholder: "italic text" } },
  { id: "heading", label: "Heading", icon: Heading2, edit: { before: "## ", after: "", placeholder: "Heading", block: true } },
  { id: "link", label: "Link", shortcut: "Ctrl+K", icon: Link, edit: { before: "[", after: "](https://)", placeholder: "link text" } },
  { id: "list", label: "Bulleted list", icon: List, edit: { before: "- ", after: "", placeholder: "List item", block: true } },
  { id: "ordered", label: "Numbered list", icon: ListOrdered, edit: { before: "1. ", after: "", placeholder: "List item", block: true } },
  { id: "quote", label: "Quote", icon: Quote, edit: { before: "> ", after: "", placeholder: "Quote", block: true } },
  { id: "code", label: "Code", shortcut: "Ctrl+E", icon: Code, edit: { before: "`", after: "`", placeholder: "code" } },
  { id: "table", label: "Table", icon: Table, edit: { before: "| Column | Column |\n| --- | --- |\n| ", after: " | |", placeholder: "Cell", block: true } },
  { id: "rule", label: "Divider", icon: Minus, edit: { before: "\n---\n", after: "", placeholder: "", block: true } },
];

const SHORTCUTS: Record<string, string> = { b: "bold", i: "italic", k: "link", e: "code" };

export default function MarkdownEditor() {
  const { value: source, setValue: setSource, saved, clear } = usePersistentState("krea.markdown", () => MARKDOWN_SAMPLE, (stored) =>
    typeof stored === "string" ? stored : null,
  );
  const { setNotice } = useSession();
  const [html, setHtml] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const renderer = useRef<{ parse: (markdown: string) => string } | null>(null);

  // Render Markdown to sanitized HTML. marked and DOMPurify load only on this page.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!renderer.current) {
        const [{ marked }, { default: DOMPurify }] = await Promise.all([import("marked"), import("dompurify")]);
        renderer.current = { parse: (markdown) => DOMPurify.sanitize(marked.parse(markdown, { gfm: true, async: false }) as string) };
      }
      if (!cancelled) setHtml(renderer.current.parse(source));
    })();
    return () => {
      cancelled = true;
    };
  }, [source]);

  /** Apply a toolbar edit to the current selection, then restore focus and selection. */
  const apply = (edit: Edit) => {
    const area = textarea.current;
    if (!area) return;
    const { selectionStart: start, selectionEnd: end, value } = area;
    const selected = value.slice(start, end) || edit.placeholder;
    // Block edits start on their own line.
    const needsBreak = edit.block && start > 0 && value[start - 1] !== "\n" ? "\n" : "";
    const insert = needsBreak + edit.before + selected + edit.after;
    // Commit the new text synchronously so the selection can be restored right away,
    // before the next keystroke arrives.
    flushSync(() => setSource(value.slice(0, start) + insert + value.slice(end)));
    area.focus();
    const selectionStart = start + needsBreak.length + edit.before.length;
    area.setSelectionRange(selectionStart, selectionStart + selected.length);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const action = ACTIONS.find((entry) => entry.id === SHORTCUTS[event.key.toLowerCase()]);
    if (!action) return;
    // Stop here so Ctrl+K formats a link instead of opening the command palette.
    event.preventDefault();
    event.stopPropagation();
    apply(action.edit);
  };

  const title = markdownTitle(source);
  const documentHtml = markdownDocument(title, html);
  const words = source.trim() ? source.trim().split(/\s+/).length : 0;

  const openFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setNotice("That file is over 5 MB. Markdown files are usually much smaller; pumili ng ibang file.");
      return;
    }
    setSource(await file.text());
    setNotice(`Opened ${file.name}.`);
  };

  const form = (
    <div className="flex flex-col rounded-xl border border-line bg-panel">
      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-0.5 border-b border-line p-1.5">
        {ACTIONS.map(({ id, label, shortcut, icon: Icon, edit }) => (
          <button
            key={id}
            type="button"
            aria-label={shortcut ? `${label} (${shortcut})` : label}
            title={shortcut ? `${label} (${shortcut})` : label}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => apply(edit)}
            className="flex size-10 items-center justify-center rounded text-muted hover:bg-raised hover:text-accent"
          >
            <Icon aria-hidden className="size-4" strokeWidth={1.75} />
          </button>
        ))}
      </div>
      <label htmlFor="markdown-source" className="sr-only">
        Markdown source
      </label>
      <textarea
        id="markdown-source"
        ref={textarea}
        value={source}
        onChange={(event) => setSource(event.target.value)}
        onKeyDown={onKeyDown}
        spellCheck
        className="min-h-[55dvh] w-full resize-y rounded-b-xl bg-ink p-4 font-mono text-sm leading-relaxed text-fg focus-visible:outline-offset-[-2px] lg:min-h-[65vh]"
      />
      <p className="border-t border-line px-4 py-2 font-mono text-xs text-muted">
        {words} {words === 1 ? "word" : "words"} · {source.length} characters
      </p>
    </div>
  );

  const actions = (
    <>
      <Button variant="primary" onClick={() => printDocument(documentHtml)} title="Opens the print dialog: choose Save as PDF">
        <Printer aria-hidden className="size-4" strokeWidth={2} />
        Save as PDF
      </Button>
      <Button onClick={() => downloadBlob(new Blob([documentHtml], { type: "text/html" }), `${fileSafe(title)}.html`)}>
        <FileCode2 aria-hidden className="size-4" strokeWidth={1.75} />
        HTML
      </Button>
      <Button onClick={() => downloadBlob(new Blob([source], { type: "text/markdown" }), `${fileSafe(title)}.md`)}>
        <FileDown aria-hidden className="size-4" strokeWidth={1.75} />
        .md
      </Button>
      <Button onClick={() => fileInput.current?.click()}>
        <FolderOpen aria-hidden className="size-4" strokeWidth={1.75} />
        Open
      </Button>
      <ConfirmButton
        label={
          <>
            <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
            Clear
          </>
        }
        confirmLabel="Clear everything?"
        onConfirm={() => clear("")}
      />
      <input
        ref={fileInput}
        type="file"
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          openFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </>
  );

  return (
    <EditorShell
      label="Markdown editor"
      form={form}
      preview={<DocPreview html={documentHtml} title="Markdown preview" />}
      actions={actions}
      saved={saved}
    />
  );
}
