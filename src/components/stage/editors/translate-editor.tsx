"use client";

import { ArrowLeftRight, Copy, Info, Languages, Square } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";
import { joinTranslation, LANGUAGE, MAX_CHARS, splitForTranslation, type Direction, type TranslateReply } from "@/tools/text/translate";
import { EditorShell } from "./editor-shell";

const areaClass = "min-h-56 w-full resize-y rounded-md border border-line bg-ink px-3 py-2 text-base leading-relaxed text-fg placeholder:text-muted/70 hover:border-muted";
const mb = (bytes: number) => `${Math.round(bytes / 1e6)} MB`;

export default function TranslateEditor() {
  // Text stays in this tab only: nothing is saved, nothing leaves the device.
  const [direction, setDirection] = useState<Direction>("en-tl");
  const [source, setSource] = useState("");
  const [result, setResult] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" | "loading" | "working" | "error"; text: string }>({ kind: "idle", text: "" });
  const worker = useRef<Worker | null>(null);
  const jobId = useRef(0);
  const sourceId = useId();
  const resultId = useId();
  const { setNotice } = useSession();
  const language = LANGUAGE[direction];
  const busy = status.kind === "loading" || status.kind === "working";
  const tooLong = source.length > MAX_CHARS;

  useEffect(() => () => worker.current?.terminate(), []);

  const stop = () => {
    // The model cannot be interrupted mid-sentence, so the worker is restarted (the model reloads from the browser cache).
    worker.current?.terminate();
    worker.current = null;
    jobId.current++;
    setStatus({ kind: "idle", text: "Itinigil." });
  };

  const run = () => {
    const text = source.trim();
    if (!text || tooLong) return;
    const lines = splitForTranslation(source);
    const pieces = lines.flat();
    const output = lines.map((line) => line.map(() => ""));
    const where = lines.flatMap((line, row) => line.map((_, col) => [row, col] as const));
    const id = ++jobId.current;
    worker.current ??= new Worker(new URL("../../../workers/translate.worker.ts", import.meta.url), { type: "module" });
    const current = worker.current;
    let done = 0;
    setResult("");
    setStatus({ kind: "working", text: `Translating 0 of ${pieces.length}` });
    current.onmessage = (event: MessageEvent<TranslateReply>) => {
      const message = event.data;
      if (message.id !== jobId.current) return;
      if (message.type === "loading") {
        setStatus({ kind: "loading", text: message.total ? `Downloading the ${language.from} to ${language.to} model: ${mb(message.loaded)} of ${mb(message.total)}` : "Loading the model…" });
      } else if (message.type === "piece") {
        const [row, col] = where[message.index];
        output[row][col] = message.text;
        done++;
        setResult(joinTranslation(output));
        setStatus({ kind: "working", text: `Translating ${done} of ${pieces.length}` });
      } else if (message.type === "done") {
        setStatus({ kind: "idle", text: "" });
      } else {
        setStatus({ kind: "error", text: message.message });
      }
    };
    current.onerror = () => setStatus({ kind: "error", text: "Hindi ma-start ang translator sa browser na ito. Try an up-to-date Chrome, Edge, Firefox or Safari." });
    current.postMessage({ type: "translate", id, direction, pieces });
  };

  const swap = () => {
    if (busy) return;
    setDirection((value) => (value === "en-tl" ? "tl-en" : "en-tl"));
    // The translation becomes the new source, so you can translate back to check it.
    if (result.trim()) {
      setSource(result);
      setResult("");
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result);
      setNotice("Na-copy ang salin.");
    } catch {
      setNotice("Hindi ma-copy. Select the translation and copy it by hand.");
    }
  };

  const form = (
    <>
      <div className="flex items-center gap-2">
        <span className="flex-1 rounded-md border border-line bg-ink px-3 py-2 text-center text-sm font-semibold text-fg">{language.from}</span>
        <Button icon aria-label={`Swap: translate ${language.to} to ${language.from}`} onClick={swap} disabled={busy}>
          <ArrowLeftRight aria-hidden className="size-4" strokeWidth={1.75} />
        </Button>
        <span className="flex-1 rounded-md border border-line bg-ink px-3 py-2 text-center text-sm font-semibold text-accent">{language.to}</span>
      </div>
      <div>
        <label htmlFor={sourceId} className="mb-1.5 flex justify-between text-sm text-fg">
          {language.from} text
          <span className={`font-mono text-xs ${tooLong ? "text-signal" : "text-muted"}`}>
            {source.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
          </span>
        </label>
        <textarea
          id={sourceId}
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder={direction === "en-tl" ? "Type or paste English text…" : "I-type o i-paste ang Tagalog…"}
          className={areaClass}
          spellCheck
          lang={direction === "en-tl" ? "en" : "tl"}
        />
        {tooLong && (
          <p role="alert" className="mt-2 text-sm text-signal">
            Masyadong mahaba: translate up to {MAX_CHARS.toLocaleString()} characters at a time.
          </p>
        )}
      </div>
      <p className="text-xs leading-relaxed text-muted">
        Hindi sine-save at walang ina-upload. The first time, the model (about 140 MB) downloads once from this site and stays in your browser, so later it also works offline.
      </p>
      <section className="rounded-xl border border-signal/60 bg-panel p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Info aria-hidden className="size-4 text-signal" strokeWidth={1.75} />
          Gabay lang ito, hindi perpekto
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Machine translation is best for short, simple sentences. It can miss meaning in long text, idioms, slang and Taglish, and it does not add po and opo for you. Basahin muna bago ipadala, and have a person check anything legal, medical or official.
        </p>
      </section>
    </>
  );

  const preview = (
    <div className="rounded-xl border border-line bg-panel p-4">
      <label htmlFor={resultId} className="mb-1.5 block text-sm text-fg">
        {language.to} translation
      </label>
      <textarea id={resultId} value={result} readOnly placeholder="Lalabas dito ang salin." className={areaClass} lang={direction === "en-tl" ? "tl" : "en"} aria-busy={busy} />
      <p role="status" aria-live="polite" className={`mt-2 min-h-5 font-mono text-xs ${status.kind === "error" ? "text-signal" : "text-muted"}`}>
        {status.text}
      </p>
    </div>
  );

  const actions = (
    <>
      {busy ? (
        <Button onClick={stop}>
          <Square aria-hidden className="size-4" strokeWidth={1.75} />
          Stop
        </Button>
      ) : (
        <Button variant="primary" onClick={run} disabled={!source.trim() || tooLong}>
          <Languages aria-hidden className="size-4" strokeWidth={2} />
          Translate
        </Button>
      )}
      <Button onClick={copy} disabled={!result.trim() || busy}>
        <Copy aria-hidden className="size-4" strokeWidth={1.75} />
        Copy translation
      </Button>
    </>
  );

  return <EditorShell label="Tagalog-English translator" form={form} preview={preview} actions={actions} previewLabel="Translation" />;
}
