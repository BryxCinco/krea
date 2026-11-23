/**
 * Tool 64: Tagalog-English Translator. Translates between English and Tagalog
 * (Filipino) with Opus-MT models running in the browser (transformers.js in
 * src/workers/translate.worker.ts). The models are served from this site
 * (public/vendor/translate, see TRANSLATE-MODELS.md); text never leaves the device.
 * UI: components/stage/editors/translate-editor.tsx. Nothing is saved.
 */
import { editorTool } from "./editor-tool";

export const translate = editorTool({
  id: 64,
  slug: "tagalog-english-translator",
  name: "Tagalog-English Translator",
  verb: "Translate",
  description: "Translate English to Tagalog and Tagalog to English right in your browser. Private: your text is never uploaded.",
  seoTitle: "English to Tagalog and Tagalog to English Translator, private and offline",
  seoDescription:
    "Translate English to Tagalog (Filipino) and Tagalog to English with an AI model that runs on your own device. No upload, no account, works offline after the first use. Best for short, simple sentences.",
  howTo: [
    "Pick English to Tagalog or Tagalog to English. Swap with the arrows.",
    "Type or paste your text, then press Translate. The first time, the model (about 140 MB) downloads once and stays on your device.",
    "Copy the translation, and check it before you send or print it.",
  ],
  faqs: [
    { q: "Is my text sent to Google or a server?", a: "No. The translation model runs inside your browser, so letters, chats and documents stay on your device. After the first download it works offline too." },
    { q: "How good is the translation?", a: "Good for short, simple sentences, like a basic guide. It can miss meaning in long paragraphs, idioms, slang and Taglish, and it does not choose po and opo for you. Always read it over, and do not use it for legal, medical or official documents without a person checking." },
    { q: "Why does it download something the first time?", a: "The translator is an AI model of about 140 MB for each direction. It downloads once from this site, is kept by your browser, and later translations start in seconds." },
    { q: "Can it translate Taglish?", a: "Only partly. The model learned from mostly pure Tagalog and English, so mixed sentences come out uneven. Splitting them into separate Tagalog and English parts helps." },
    { q: "How long can the text be?", a: "Up to 5,000 characters at a time. Long text is translated sentence by sentence, keeping your line breaks." },
  ],
  icon: "translate",
});

export type Direction = "en-tl" | "tl-en";

export const MODEL_FOR: Record<Direction, string> = { "en-tl": "opus-mt-en-tl", "tl-en": "opus-mt-tl-en" };
export const LANGUAGE: Record<Direction, { from: string; to: string }> = {
  "en-tl": { from: "English", to: "Tagalog" },
  "tl-en": { from: "Tagalog", to: "English" },
};
export const MAX_CHARS = 5000;
/** Marian models handle up to 512 tokens; sentences longer than this are split further. */
const MAX_PIECE = 350;
/** Titles and short forms whose period does not end a sentence (English and Filipino). */
const ABBREVIATION = /(?:^|\s)(?:Mr|Mrs|Ms|Dr|Atty|Engr|Arch|Hon|Prof|Rev|Fr|Sr|Jr|St|Sto|Sta|Gng|Bb|G|Gen|Col|Capt|Brgy|Ave|Blvd|vs|etc|e\.g|i\.e|No)\.$/i;

/**
 * Text as lines of pieces: each line keeps its place (blank lines too) and is split into
 * sentences, and very long sentences at commas or spaces, so each piece translates well.
 */
export function splitForTranslation(text: string): string[][] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return [];
      const parts = trimmed.match(/[^.!?…]+(?:[.!?…]+["')\]]*|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [trimmed];
      // "Mr. Cruz" and "Sta. Mesa" are one sentence: rejoin after a title or short form.
      const sentences: string[] = [];
      for (const part of parts) {
        const last = sentences.at(-1);
        if (last && ABBREVIATION.test(last)) sentences[sentences.length - 1] = `${last} ${part}`;
        else sentences.push(part);
      }
      return sentences.flatMap((sentence) => (sentence.length <= MAX_PIECE ? [sentence] : splitLong(sentence)));
    });
}

function splitLong(sentence: string): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const part of sentence.split(/(?<=[,;:])\s+|\s+/)) {
    if (current && (current + " " + part).length > MAX_PIECE) {
      pieces.push(current);
      current = part;
    } else current = current ? `${current} ${part}` : part;
  }
  if (current) pieces.push(current);
  return pieces;
}

/** Put translated pieces back into the original line layout. */
export function joinTranslation(lines: string[][]): string {
  return lines.map((pieces) => pieces.join(" ")).join("\n");
}

/** Messages between the editor and the translate worker. */
export type TranslateRequest = { type: "translate"; id: number; direction: Direction; pieces: string[] };
export type TranslateReply =
  | { type: "loading"; id: number; loaded: number; total: number }
  | { type: "piece"; id: number; index: number; text: string }
  | { type: "done"; id: number }
  | { type: "error"; id: number; message: string };
