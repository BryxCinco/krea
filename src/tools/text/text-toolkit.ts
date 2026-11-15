/**
 * Tool 29: Text Toolkit. Pure text functions (no DOM), so they run inside a Web Worker:
 * counting, case conversion, duplicate removal, sorting and find & replace.
 * Large inputs (1 MB and more) must not freeze the page, which is why the editor
 * calls these through src/workers/text.worker.ts.
 */
import { editorTool } from "./editor-tool";

export const textToolkit = editorTool({
  id: 29,
  slug: "text-toolkit",
  name: "Text Toolkit",
  verb: "Text tools",
  description: "Count words, change case, remove duplicate lines, sort lines, and find & replace.",
  seoTitle: "Text Toolkit: word counter, case converter, sort lines, find and replace",
  seoDescription:
    "Free text tools in your browser: word and character counter, UPPER/lower/Title/camelCase/snake_case converter, remove duplicate lines, sort lines and find & replace with regex. Nothing is uploaded.",
  howTo: [
    "Type, paste or open a text file in the box.",
    "Pick a tab: Count, Case, Lines or Find & Replace.",
    "Copy the result, download it as TXT, or press Use as input to keep working on it.",
  ],
  faqs: [
    { q: "Is my text uploaded?", a: "No. Everything happens in your browser, and Krea does not save your text unless you copy or download it." },
    { q: "How are words and reading time counted?", a: "A word is any run of characters between spaces or line breaks. Reading time assumes 200 words a minute and speaking time 130, which are averages: real speed varies." },
    { q: "Can it handle very long text?", a: "Yes. The work runs in a background thread, so the page stays responsive with a megabyte or more of text. Find & Replace with a very complex regex is stopped after a few seconds instead of freezing the tab." },
    { q: "How does Find & Replace work with regex?", a: "Turn on Regex to use JavaScript regular expressions. In the replacement you can use $1, $2 for groups and $& for the whole match. With Regex off, the text is matched literally." },
    { q: "Which words does Title Case keep lowercase?", a: "Short joining words such as a, an, the, and, of, in, ng, sa and at stay lowercase unless they are the first or last word. It is a common style rule, not the only one, so check headlines before you publish." },
  ],
  icon: "text",
});

// ---------------------------------------------------------------- counting

export interface TextStats {
  characters: number;
  charactersNoSpaces: number;
  words: number;
  sentences: number;
  paragraphs: number;
  lines: number;
  readingMinutes: number;
  speakingMinutes: number;
}

export const READING_WPM = 200;
export const SPEAKING_WPM = 130;

export function countText(text: string): TextStats {
  let characters = 0;
  let noSpaces = 0;
  let words = 0;
  let inWord = false;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // Count code points: the low half of a surrogate pair is not a separate character.
    if (code >= 0xdc00 && code <= 0xdfff) continue;
    characters++;
    const space = code === 32 || (code >= 9 && code <= 13) || code === 0xa0 || code === 0x2028 || code === 0x2029 || code === 0x3000 || (code >= 0x2000 && code <= 0x200a);
    if (space) {
      inWord = false;
    } else {
      noSpaces++;
      if (!inWord) words++;
      inWord = true;
    }
  }
  const trimmed = text.trim();
  let sentences = 0;
  if (trimmed) {
    const matches = trimmed.match(/[.!?…]+(?=\s|$|["')\]])/g);
    sentences = matches ? matches.length : 0;
    // Text that does not end with punctuation still has a last sentence.
    if (!/[.!?…]["')\]]*$/.test(trimmed)) sentences++;
  }
  let paragraphs = 0;
  if (trimmed) paragraphs = trimmed.split(/\n\s*\n/).filter((part) => part.trim()).length;
  let lines = 0;
  if (text) {
    lines = 1;
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) lines++;
  }
  return {
    characters,
    charactersNoSpaces: noSpaces,
    words,
    sentences,
    paragraphs,
    lines,
    readingMinutes: words / READING_WPM,
    speakingMinutes: words / SPEAKING_WPM,
  };
}

/** "2 min 30 sec", "45 sec", "under a second" for the stats panel. */
export function formatDuration(minutes: number): string {
  const seconds = Math.round(minutes * 60);
  if (seconds < 1) return "under a second";
  if (seconds < 60) return `${seconds} sec`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m} min ${s} sec` : `${m} min`;
}

// ---------------------------------------------------------------- case

export type CaseMode = "upper" | "lower" | "title" | "sentence" | "camel" | "pascal" | "snake" | "kebab" | "constant";

export const CASE_MODES: { value: CaseMode; label: string; example: string }[] = [
  { value: "upper", label: "UPPER CASE", example: "HELLO WORLD" },
  { value: "lower", label: "lower case", example: "hello world" },
  { value: "title", label: "Title Case", example: "Hello World" },
  { value: "sentence", label: "Sentence case", example: "Hello world." },
  { value: "camel", label: "camelCase", example: "helloWorld" },
  { value: "pascal", label: "PascalCase", example: "HelloWorld" },
  { value: "snake", label: "snake_case", example: "hello_world" },
  { value: "kebab", label: "kebab-case", example: "hello-world" },
  { value: "constant", label: "CONSTANT_CASE", example: "HELLO_WORLD" },
];

const MINOR_WORDS = new Set(["a", "an", "the", "and", "but", "or", "nor", "for", "so", "yet", "of", "in", "on", "at", "to", "by", "as", "up", "vs", "ng", "sa", "at", "na", "ang", "mga"]);

const capitalize = (word: string) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word);

function titleCase(line: string): string {
  const parts = line.split(/(\s+)/);
  const wordIndexes = parts.map((part, i) => (/\S/.test(part) ? i : -1)).filter((i) => i >= 0);
  const first = wordIndexes[0];
  const last = wordIndexes[wordIndexes.length - 1];
  return parts
    .map((part, i) => {
      if (!/\S/.test(part)) return part;
      const lower = part.toLowerCase();
      const bare = lower.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      if (i !== first && i !== last && MINOR_WORDS.has(bare)) return lower;
      // Capitalise the first letter, keeping any leading punctuation or quote.
      return lower.replace(/\p{L}/u, (letter) => letter.toUpperCase());
    })
    .join("");
}

/** Words inside an identifier or phrase: "helloWorld", "hello_world" and "Hello World" all give [hello, world]. */
function splitWords(line: string): string[] {
  return (
    line
      .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2")
      .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, "$1 $2")
      .match(/[\p{L}\p{N}]+/gu) ?? []
  ).map((word) => word.toLowerCase());
}

export function convertCase(text: string, mode: CaseMode): string {
  switch (mode) {
    case "upper":
      return text.toUpperCase();
    case "lower":
      return text.toLowerCase();
    case "title":
      return text.split("\n").map(titleCase).join("\n");
    case "sentence":
      return text.toLowerCase().replace(/(^|[.!?…]["')\]]*\s+|\n\s*)(\p{L})/gu, (_match, lead: string, letter: string) => lead + letter.toUpperCase());
    default:
      // Identifier styles work on one line at a time, so a list of names stays a list.
      return text
        .split("\n")
        .map((line) => {
          const words = splitWords(line);
          if (!words.length) return "";
          if (mode === "camel") return words[0] + words.slice(1).map(capitalize).join("");
          if (mode === "pascal") return words.map(capitalize).join("");
          if (mode === "snake") return words.join("_");
          if (mode === "kebab") return words.join("-");
          return words.join("_").toUpperCase();
        })
        .join("\n");
  }
}

// ---------------------------------------------------------------- lines

export interface DedupeOptions {
  caseSensitive: boolean;
  trim: boolean;
  removeEmpty: boolean;
}

export interface LinesResult {
  text: string;
  /** Lines that were dropped (duplicates or blanks). */
  removed: number;
  total: number;
}

export function dedupeLines(text: string, options: DedupeOptions): LinesResult {
  const lines = text.split("\n");
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const line of lines) {
    let key = options.trim ? line.trim() : line;
    if (!options.caseSensitive) key = key.toLowerCase();
    if (options.removeEmpty && key.trim() === "") continue;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(options.trim ? line.trim() : line);
  }
  return { text: kept.join("\n"), removed: lines.length - kept.length, total: lines.length };
}

export type SortMode = "az" | "za" | "natural" | "short" | "long" | "reverse" | "random";

export const SORT_MODES: { value: SortMode; label: string }[] = [
  { value: "az", label: "A to Z" },
  { value: "za", label: "Z to A" },
  { value: "natural", label: "Natural (item 2 before item 10)" },
  { value: "short", label: "Shortest first" },
  { value: "long", label: "Longest first" },
  { value: "reverse", label: "Reverse the order" },
  { value: "random", label: "Shuffle" },
];

export function sortLines(text: string, mode: SortMode, options: { caseSensitive: boolean; removeEmpty: boolean }): LinesResult {
  let lines = text.split("\n");
  const total = lines.length;
  if (options.removeEmpty) lines = lines.filter((line) => line.trim() !== "");
  const base = options.caseSensitive ? "variant" : "base";
  const collator = new Intl.Collator(undefined, { sensitivity: base, numeric: mode === "natural" });
  switch (mode) {
    case "az":
    case "natural":
      lines.sort(collator.compare);
      break;
    case "za":
      lines.sort((a, b) => collator.compare(b, a));
      break;
    case "short":
      lines.sort((a, b) => a.length - b.length || collator.compare(a, b));
      break;
    case "long":
      lines.sort((a, b) => b.length - a.length || collator.compare(a, b));
      break;
    case "reverse":
      lines.reverse();
      break;
    case "random": {
      // Fisher-Yates with crypto randomness, so the shuffle is unbiased.
      const random = new Uint32Array(lines.length);
      crypto.getRandomValues(random);
      for (let i = lines.length - 1; i > 0; i--) {
        const j = random[i] % (i + 1);
        [lines[i], lines[j]] = [lines[j], lines[i]];
      }
      break;
    }
  }
  return { text: lines.join("\n"), removed: total - lines.length, total };
}

// ---------------------------------------------------------------- find & replace

export interface ReplaceOptions {
  regex: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
}

export interface ReplaceResult {
  text: string;
  count: number;
  /** Set when the pattern is not a valid regular expression. */
  error?: string;
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function findReplace(text: string, find: string, replacement: string, options: ReplaceOptions): ReplaceResult {
  if (!find) return { text, count: 0 };
  let source = options.regex ? find : escapeRegex(find);
  if (options.wholeWord) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`;
  let pattern: RegExp;
  try {
    pattern = new RegExp(source, `g${options.caseSensitive ? "" : "i"}mu`);
  } catch (error) {
    return { text, count: 0, error: error instanceof Error ? error.message.replace(/^Invalid regular expression: /, "") : "Invalid pattern" };
  }
  let count = 0;
  // Plain mode treats the replacement literally (no $1 expansion).
  const output = options.regex
    ? text.replace(pattern, (...args) => {
        count++;
        return expandReplacement(replacement, args);
      })
    : text.replace(pattern, () => {
        count++;
        return replacement;
      });
  return { text: output, count };
}

/** Expand $1..$9, $& and $$ the way String.replace would, from a replace callback's arguments. */
function expandReplacement(template: string, args: unknown[]): string {
  const hasNamed = typeof args[args.length - 1] === "object";
  const groups = args.slice(1, hasNamed ? -3 : -2) as (string | undefined)[];
  const match = String(args[0]);
  return template.replace(/\$(\$|&|\d{1,2})/g, (_token, key: string) => {
    if (key === "$") return "$";
    if (key === "&") return match;
    const group = groups[Number(key) - 1];
    return group ?? "";
  });
}

// ---------------------------------------------------------------- worker protocol

export type TextOp =
  | { op: "count"; text: string }
  | { op: "case"; text: string; mode: CaseMode }
  | { op: "dedupe"; text: string; options: DedupeOptions }
  | { op: "sort"; text: string; mode: SortMode; options: { caseSensitive: boolean; removeEmpty: boolean } }
  | { op: "replace"; text: string; find: string; replacement: string; options: ReplaceOptions };

export type TextOpResult =
  | { op: "count"; stats: TextStats }
  | { op: "case"; text: string }
  | { op: "dedupe" | "sort"; lines: LinesResult }
  | { op: "replace"; replaced: ReplaceResult };

export function runTextOp(request: TextOp): TextOpResult {
  switch (request.op) {
    case "count":
      return { op: "count", stats: countText(request.text) };
    case "case":
      return { op: "case", text: convertCase(request.text, request.mode) };
    case "dedupe":
      return { op: "dedupe", lines: dedupeLines(request.text, request.options) };
    case "sort":
      return { op: "sort", lines: sortLines(request.text, request.mode, request.options) };
    case "replace":
      return { op: "replace", replaced: findReplace(request.text, request.find, request.replacement, request.options) };
  }
}
