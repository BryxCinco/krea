/**
 * Tool 56: Compare PDFs. Finds what changed between two versions of a document
 * (a contract, a lease, a thesis draft): reads the text of both (PDF text
 * layer, or TXT) and diffs it by words or by lines with Myers' algorithm
 * (src/lib/diff.ts). The report lists every change with its page and a little
 * context, in the style of a word diff: [-removed-] {+added+}.
 */
import { decodeText } from "@/lib/pdf-text";
import { PDF_MIME, TEXT_MIME } from "@/lib/file-type";
import { openPdf } from "@/lib/pdf-render";
import { KreaError, type Tool, type WorkFile } from "../types";

/** A word or line with the page it is on (1-based). */
interface Token {
  text: string;
  page: number;
}

const CONTEXT_WORDS = 6;
const MAX_TOKENS = 400_000;

async function readTokens(file: WorkFile, mode: string, signal: AbortSignal | undefined, onPage: (done: number, total: number) => void): Promise<{ tokens: Token[]; pages: number; empty: boolean }> {
  const lines: Token[] = [];
  let pages = 1;
  if (file.type === PDF_MIME) {
    const { pageLines } = await import("@/lib/pdf-extract");
    const { pdf, close } = await openPdf(file);
    try {
      pages = pdf.numPages;
      for (let i = 0; i < pdf.numPages; i++) {
        if (signal?.aborted) throw new KreaError("failed", "Cancelled.");
        onPage(i, pdf.numPages);
        for (const line of await pageLines(pdf, i)) lines.push({ text: line.text, page: i + 1 });
      }
    } finally {
      await close();
    }
  } else {
    const text = decodeText(await file.blob.arrayBuffer(), file.name);
    for (const line of text.split("\n")) if (line.trim()) lines.push({ text: line.replace(/\s+/g, " ").trim(), page: 1 });
  }
  if (mode === "lines") return { tokens: lines, pages, empty: !lines.length };
  // Words: re-join words split across lines with a hyphen, so a re-wrapped paragraph is not a change.
  const words: Token[] = [];
  for (const line of lines) {
    line.text.split(" ").forEach((word, j) => {
      const last = words.at(-1);
      // Only the first word of a line can continue a word hyphenated at the end of the line before.
      if (j === 0 && last && /[a-z]-$/i.test(last.text) && /^[a-z]/.test(word) && last.page === line.page) {
        last.text = last.text.slice(0, -1) + word;
      } else words.push({ text: word, page: line.page });
    });
  }
  if (words.length > MAX_TOKENS) throw new KreaError("too-large", `"${file.name}" has over ${MAX_TOKENS.toLocaleString()} words, too long to compare in the browser. Compare a range of pages instead.`);
  return { tokens: words, pages, empty: !words.length };
}

export const comparePdf: Tool = {
  id: 56,
  slug: "compare-pdf",
  name: "Compare PDFs",
  verb: "Compare",
  category: "pdf",
  description: "See what changed between two versions of a PDF or text file: every word added or removed, with its page.",
  accepts: [PDF_MIME, TEXT_MIME],
  output: "text",
  seoTitle: "Compare two PDFs: find the differences in text, offline",
  seoDescription:
    "Compare two versions of a contract, lease or draft and list every word or line that was added, removed or changed, with page numbers. Works in your browser. No upload.",
  howTo: [
    "Drop two PDFs (or TXT files) on the Stage. The first is the old version, the second the new one; drag to swap.",
    "Choose to compare by words (ignores re-wrapped lines) or by lines.",
    "Compare, then read the list of changes or download it as a TXT report.",
  ],
  faqs: [
    { q: "Are my documents uploaded?", a: "No. Both files are read and compared inside your browser, which matters for contracts and other private papers." },
    { q: "Which file is the old one?", a: "The first file on the Stage is treated as the old version and the second as the new one. Drag them to change the order." },
    { q: "Does it compare pictures, signatures or formatting?", a: "No. It compares the text only. Changes to fonts, colours, images or layout are not reported." },
    { q: "Can it compare scanned PDFs?", a: "Not directly: scans have no text. Run each one through OCR: Image and PDF to Text first, then compare the two TXT files." },
    { q: "Words or lines: which should I pick?", a: "Words, for most documents: it ignores text that only moved to another line and pinpoints the changed words. Lines suits lists, code and data where each line stands alone." },
  ],
  icon: "compare",
  worker: "pdfjs",
  input: "all",
  minFiles: 2,
  fields: [
    {
      key: "mode",
      label: "Compare by",
      type: "select",
      default: "words",
      options: [
        { value: "words", label: "Words (ignores line wrapping)" },
        { value: "lines", label: "Lines" },
      ],
    },
    { key: "ignoreCase", label: "Ignore upper and lower case", type: "toggle", default: false },
  ],

  async run(inputs, options, ctx) {
    if (inputs.length !== 2) throw new KreaError("unsupported", `Compare needs exactly two files: the old and the new version. ${inputs.length} are on the Stage.`);
    const [older, newer] = inputs;
    const mode = String(options.mode);
    const a = await readTokens(older, mode, ctx.signal, (i, n) => ctx.progress((0.4 * i) / n, `Reading "${older.name}"`));
    const b = await readTokens(newer, mode, ctx.signal, (i, n) => ctx.progress(0.4 + (0.4 * i) / n, `Reading "${newer.name}"`));
    for (const [file, read] of [[older, a], [newer, b]] as const) {
      if (read.empty) throw new KreaError("failed", `Walang text ang "${file.name}": it looks like a scan. Run it through OCR first, then compare the TXT files.`);
    }
    ctx.progress(0.85, "Comparing");
    const key = (token: Token) => (options.ignoreCase ? token.text.toLowerCase() : token.text);
    const { diffTokens } = await import("@/lib/diff");
    const ops = diffTokens(a.tokens.map(key), b.tokens.map(key));
    if (!ops) throw new KreaError("failed", "Masyadong magkaiba ang dalawang file to list the changes. Check that they are two versions of the same document.");

    // Group consecutive edits into changes.
    type Change = { start: number; end: number };
    const changes: Change[] = [];
    ops.forEach((op, i) => {
      if (op.type === "same") return;
      const last = changes.at(-1);
      if (last && last.end === i) last.end = i + 1;
      else changes.push({ start: i, end: i + 1 });
    });
    let removed = 0;
    let added = 0;
    for (const op of ops) {
      if (op.type === "del") removed++;
      else if (op.type === "add") added++;
    }

    const unit = mode === "lines" ? "line" : "word";
    const plural = (count: number) => `${count} ${unit}${count === 1 ? "" : "s"}`;
    const header = [`Compared "${older.name}" (old) with "${newer.name}" (new), by ${unit}s${options.ignoreCase ? ", ignoring case" : ""}.`];
    if (!changes.length) {
      const text = `${header[0]}\n\nWalang pinagkaiba: the text is identical.`;
      return {
        files: [{ name: "comparison.txt", type: TEXT_MIME, blob: new Blob([text], { type: "text/plain;charset=utf-8" }) }],
        view: { type: "text", text, label: "Comparison" },
        note: "Walang pinagkaiba: the text of both files is the same.",
      };
    }
    header.push(
      `${changes.length} ${changes.length === 1 ? "change" : "changes"}: ${plural(removed)} removed, ${plural(added)} added.`,
      mode === "lines" ? 'Removed lines start with "- ", added lines with "+ ".' : "Removed text is shown as [-text-], added text as {+text+}.",
    );

    const tokenOf = (op: (typeof ops)[number]) => (op.type === "add" ? b.tokens[op.index] : a.tokens[op.index]);
    const pageOf = (change: Change) => {
      // Page in the new version where the change sits (the next kept or added token), else the old page.
      for (let i = change.start; i < ops.length; i++) if (ops[i].type !== "del") return `page ${ops[i].type === "add" ? b.tokens[ops[i].index].page : b.tokens[ops[i].other!].page}`;
      return `old page ${tokenOf(ops[change.start]).page}`;
    };

    const blocks = changes.map((change, n) => {
      const slice = ops.slice(change.start, change.end);
      const removedText = slice.filter((op) => op.type === "del").map((op) => a.tokens[op.index].text);
      const addedText = slice.filter((op) => op.type === "add").map((op) => b.tokens[op.index].text);
      const title = `#${n + 1} · ${pageOf(change)}`;
      if (mode === "lines") {
        return [title, ...removedText.map((line) => `- ${line}`), ...addedText.map((line) => `+ ${line}`)].join("\n");
      }
      // Context reads as the new version: neighbouring changes show their added words, not a gap.
      const newText = (op: (typeof ops)[number]) => (op.type === "add" ? b.tokens[op.index].text : a.tokens[op.index].text);
      const before = ops.slice(Math.max(0, change.start - CONTEXT_WORDS), change.start).filter((op) => op.type !== "del").map(newText);
      const after = ops.slice(change.end, change.end + CONTEXT_WORDS).filter((op) => op.type !== "del").map(newText);
      const middle = [removedText.length ? `[-${removedText.join(" ")}-]` : "", addedText.length ? `{+${addedText.join(" ")}+}` : ""].filter(Boolean).join(" ");
      return `${title}\n${change.start > CONTEXT_WORDS ? "… " : ""}${[...before, middle, ...after].join(" ")}${change.end + CONTEXT_WORDS < ops.length ? " …" : ""}`;
    });

    const text = `${header.join("\n")}\n\n${blocks.join("\n\n")}\n`;
    const stem = (name: string) => name.replace(/\.[^.]+$/, "").slice(0, 40);
    return {
      files: [{ name: `compare-${stem(older.name)}-vs-${stem(newer.name)}.txt`, type: TEXT_MIME, blob: new Blob([text], { type: "text/plain;charset=utf-8" }) }],
      view: { type: "text", text, label: "Changes" },
      note: `${changes.length} ${changes.length === 1 ? "change" : "changes"}: ${plural(removed)} removed, ${plural(added)} added.`,
    };
  },
};
