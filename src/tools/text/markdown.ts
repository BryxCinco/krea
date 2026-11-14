/** Tool 21: Markdown Editor. Live preview, toolbar and shortcuts, HTML and PDF export, autosave. */
import { htmlDocument } from "./doc-utils";
import { editorTool } from "./editor-tool";

export const markdown = editorTool({
  id: 21,
  slug: "markdown-editor",
  name: "Markdown Editor",
  verb: "Write Markdown",
  description: "Write Markdown with a live preview, toolbar and shortcuts. Export to HTML or PDF. Saves as you type, on this device only.",
  seoTitle: "Markdown Editor: live preview, export HTML and PDF, offline",
  seoDescription:
    "A private Markdown editor in your browser with live preview, formatting toolbar and keyboard shortcuts. Export to HTML or PDF. Autosaves on your device only.",
  howTo: [
    "Type Markdown on the left, or open a .md file from your device. The preview updates as you type.",
    "Use the toolbar or shortcuts: Ctrl+B bold, Ctrl+I italic, Ctrl+K link.",
    "Download Markdown or HTML, or save a PDF from the print dialog.",
  ],
  faqs: [
    { q: "Where is my writing saved?", a: "In this browser's local storage on your device, so it is still here when you come back. Nothing is uploaded. Clear it any time with Clear." },
    { q: "Which Markdown features work?", a: "Headings, bold, italic, links, images by URL, lists, task lists, quotes, code blocks, tables and horizontal rules (GitHub-flavoured Markdown)." },
    { q: "How do I make a PDF?", a: "Press Save as PDF. Your browser's print dialog opens; choose Save as PDF as the printer. The text stays selectable." },
  ],
  icon: "markdown",
});

export const MARKDOWN_SAMPLE = `# Hello, Krea

Isulat dito ang notes mo. **Bold**, *italic*, and \`code\` all work.

## A short list

- Everything stays on this device
- The preview updates as you type
- [x] Works offline

> Tip: Ctrl+B for bold, Ctrl+I for italic, Ctrl+K for a link.

| Tool | What it does |
| --- | --- |
| Markdown | Notes and docs |
| Invoice | Billing clients |
`;

const DOC_CSS = `
.md { max-width: 760px; margin: 0 auto; font-size: 15px; }
.md h1, .md h2, .md h3 { line-height: 1.25; margin: 1.4em 0 0.5em; }
.md h1 { font-size: 2em; margin-top: 0; }
.md h2 { font-size: 1.5em; border-bottom: 1px solid #e4e4e7; padding-bottom: 0.2em; }
.md p, .md ul, .md ol, .md blockquote, .md pre, .md table { margin: 0 0 1em; }
.md a { color: #2d5a00; }
.md code { font-family: ui-monospace, Consolas, monospace; font-size: 0.9em; background: #f2f2f0; padding: 0.1em 0.35em; border-radius: 4px; }
.md pre { background: #f2f2f0; padding: 12px 14px; border-radius: 8px; overflow-x: auto; }
.md pre code { background: none; padding: 0; }
.md blockquote { border-left: 4px solid #c6d9a0; margin-left: 0; padding: 0.2em 1em; color: #46474d; }
.md table { border-collapse: collapse; width: 100%; }
.md th, .md td { border: 1px solid #d4d4d8; padding: 6px 10px; text-align: left; }
.md th { background: #f2f2f0; }
.md img { max-width: 100%; }
.md hr { border: 0; border-top: 1px solid #e4e4e7; margin: 2em 0; }
.md input[type="checkbox"] { margin-right: 0.4em; }
@media print { .md { max-width: none; } .md pre, .md table, .md img { break-inside: avoid; } }
`;

/** Standalone HTML file for export and printing. `safeHtml` must already be sanitized. */
export function markdownDocument(title: string, safeHtml: string): string {
  return htmlDocument({ title, css: DOC_CSS, body: `<article class="md">${safeHtml}</article>` });
}

/** Title for exports: the first heading, else "document". */
export function markdownTitle(source: string): string {
  const heading = /^#{1,6}\s+(.+)$/m.exec(source)?.[1]?.trim();
  return heading ? heading.replace(/[*_`[\]]/g, "").slice(0, 80) : "document";
}

/** File-name-safe version of a title. */
export function fileSafe(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "document";
}
