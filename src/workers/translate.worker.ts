/**
 * Tagalog-English Translator (tool 64): runs Opus-MT with transformers.js. The models and
 * the ONNX runtime are served from this site (/vendor/translate, /vendor/transformers);
 * remote model downloads are switched off, so no request ever leaves Krea.
 */
import { env, pipeline } from "@huggingface/transformers";
import { MODEL_FOR, type Direction, type TranslateReply, type TranslateRequest } from "@/tools/text/translate";

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = "/vendor/translate/";
// Kept by the service worker's vendor cache; transformers.js's own Cache API copy would double it.
env.useBrowserCache = false;
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = "/vendor/transformers/";
  // Krea is not cross-origin isolated, so WebAssembly threads are unavailable.
  env.backends.onnx.wasm.numThreads = 1;
}

/** The part of the translation pipeline used here (the library's own types are too broad for the compiler). */
type Translator = (text: string, options?: { max_new_tokens?: number }) => Promise<{ translation_text: string }[]>;
type ProgressEvent = { status: string; file?: string; loaded?: number; total?: number };
const createPipeline = pipeline as unknown as (task: "translation", model: string, options: { dtype: string; device: string; progress_callback: (event: ProgressEvent) => void }) => Promise<Translator>;

const post = (message: TranslateReply) => (self as unknown as Worker).postMessage(message);
const loaded = new Map<Direction, Promise<Translator>>();

function load(direction: Direction, id: number): Promise<Translator> {
  let ready = loaded.get(direction);
  if (!ready) {
    const files = new Map<string, { loaded: number; total: number }>();
    ready = createPipeline("translation", MODEL_FOR[direction], {
      dtype: "q8",
      device: "wasm",
      progress_callback: (event) => {
        if (event.status !== "progress" || !event.file) return;
        files.set(event.file, { loaded: event.loaded ?? 0, total: event.total ?? 0 });
        const sum = [...files.values()].reduce((acc, file) => ({ loaded: acc.loaded + file.loaded, total: acc.total + file.total }), { loaded: 0, total: 0 });
        post({ type: "loading", id, loaded: sum.loaded, total: sum.total });
      },
    });
    // A failed load (offline, missing files) can be retried later.
    ready.catch(() => loaded.delete(direction));
    loaded.set(direction, ready);
  }
  return ready;
}

self.onmessage = async (event: MessageEvent<TranslateRequest>) => {
  const { id, direction, pieces } = event.data;
  try {
    const translator = await load(direction, id);
    for (const [index, piece] of pieces.entries()) {
      const output = await translator(piece, { max_new_tokens: 512 });
      post({ type: "piece", id, index, text: output[0]?.translation_text ?? "" });
    }
    post({ type: "done", id });
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    const missing = /404|not found|could not locate|failed to fetch|Unauthorized access/i.test(text);
    post({
      type: "error",
      id,
      message: missing
        ? "Hindi ma-load ang translation model. It is not installed on this site yet, or you are offline before the first download."
        : `Hindi natapos ang pagsasalin: ${text}`,
    });
  }
};
