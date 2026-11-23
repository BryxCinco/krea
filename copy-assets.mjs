/**
 * Prepares every third-party runtime file Krea serves itself, so the browser
 * never talks to a CDN. Runs automatically before `dev` and `build` (see
 * package.json). All targets are git-ignored.
 *
 * 1. Copies pdf.js, qpdf and Tesseract files from node_modules into public/.
 * 2. Mirrors the background-removal model (IMG.LY) into public/vendor/imgly.
 *    It is not on npm for the library version we use, so it is downloaded once
 *    at build time from the publisher's CDN, verified against the SHA-256 hash
 *    each chunk is named after, and cached in .cache/ for later builds.
 *    Visitors then load it from this site, never from the CDN.
 * 3. Mirrors the Tagalog-English translation models (Opus-MT, converted to
 *    ONNX for Krea) into public/vendor/translate from a GitHub Release of the
 *    krea repo, verified against the SHA-256 hashes listed below and cached in
 *    .cache/. The ONNX runtime they need is copied from node_modules.
 * 4. Writes public/offline-manifest.json: the heavy files the
 *    "Make offline-ready" button pre-caches.
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const copy = (from, to) => cpSync(`node_modules/${from}`, `public/${to}`, { recursive: true });

// ---------- 1. Engines from node_modules ----------

// pdf.js: its own workers plus the data files it loads on demand.
for (const dir of ["cmaps", "standard_fonts", "wasm"]) copy(`pdfjs-dist/${dir}`, `pdfjs/${dir}`);
for (const file of ["pdf.worker.min.mjs", "pdf.renderer.min.mjs"]) copy(`pdfjs-dist/build/${file}`, `pdfjs/${file}`);

// qpdf (WebAssembly): PDF encryption and decryption.
mkdirSync("public/vendor/qpdf", { recursive: true });
copy("@neslinesli93/qpdf-wasm/dist/qpdf.wasm", "vendor/qpdf/qpdf.wasm");

// ZXing-C++ (WebAssembly): the QR and barcode scanner's fallback when the browser has no BarcodeDetector.
mkdirSync("public/vendor/zxing", { recursive: true });
copy("zxing-wasm/dist/reader/zxing_reader.wasm", "vendor/zxing/zxing_reader.wasm");

// Tesseract OCR: worker, the LSTM cores (it picks one by CPU features; the
// .wasm.js files embed the WebAssembly, so nothing else is needed) and language data.
mkdirSync("public/tesseract/core", { recursive: true });
mkdirSync("public/tesseract/lang", { recursive: true });
copy("tesseract.js/dist/worker.min.js", "tesseract/worker.min.js");
const tesseractCores = ["", "-simd", "-relaxedsimd"].map((variant) => `tesseract-core${variant}-lstm.wasm.js`);
for (const core of tesseractCores) copy(`tesseract.js-core/${core}`, `tesseract/core/${core}`);
for (const language of ["eng", "fil"]) {
  copy(`@tesseract.js-data/${language}/4.0.0_best_int/${language}.traineddata.gz`, `tesseract/lang/${language}.traineddata.gz`);
}

// ---------- 2. Background-removal model mirror ----------

const IMGLY_VERSION = JSON.parse(readFileSync("node_modules/@imgly/background-removal/package.json", "utf8")).version;
const IMGLY_SOURCE = `https://staticimgly.com/@imgly/background-removal-data/${IMGLY_VERSION}/dist/`;
const IMGLY_TARGET = "public/vendor/imgly";
const IMGLY_CACHE = `.cache/imgly-${IMGLY_VERSION}`;

/**
 * Resources mirrored. "isnet" (176 MB, full precision) is skipped: Krea only
 * offers the quantized and fp16 models. The "jsep" runtime is only used for
 * WebGPU, which Krea does not enable (device "cpu").
 */
const IMGLY_KEEP = [
  "/models/isnet_quint8",
  "/models/isnet_fp16",
  "/onnxruntime-web/ort-wasm-simd-threaded.wasm",
  "/onnxruntime-web/ort-wasm-simd-threaded.mjs",
];
/** Pre-cached by "Make offline-ready". The 88 MB fp16 model caches on first use instead. */
const IMGLY_OFFLINE = IMGLY_KEEP.filter((key) => key !== "/models/isnet_fp16");

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function download(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt === 3) throw new Error(`Could not download ${url}: ${error.message}`);
    }
  }
}

async function mirrorImgly() {
  mkdirSync(IMGLY_CACHE, { recursive: true });
  mkdirSync(IMGLY_TARGET, { recursive: true });

  const manifestCache = join(IMGLY_CACHE, "resources.json");
  if (!existsSync(manifestCache)) writeFileSync(manifestCache, await download(`${IMGLY_SOURCE}resources.json`));
  const all = JSON.parse(readFileSync(manifestCache, "utf8"));

  const kept = {};
  const chunks = [];
  for (const key of IMGLY_KEEP) {
    if (!all[key]) throw new Error(`Model resource ${key} is missing from resources.json`);
    kept[key] = all[key];
    chunks.push(...all[key].chunks.map((chunk) => ({ name: chunk.name, offline: IMGLY_OFFLINE.includes(key) })));
  }

  let fetched = 0;
  for (const { name } of chunks) {
    const cached = join(IMGLY_CACHE, name);
    if (!existsSync(cached) || sha256(readFileSync(cached)) !== name) {
      const data = await download(IMGLY_SOURCE + name);
      if (sha256(data) !== name) throw new Error(`Hash mismatch for model chunk ${name}`);
      writeFileSync(cached, data);
      fetched++;
    }
    cpSync(cached, join(IMGLY_TARGET, name));
  }
  // Only list what we serve, so the library never asks for a file that is not here.
  writeFileSync(join(IMGLY_TARGET, "resources.json"), JSON.stringify(kept));
  if (fetched) console.log(`Background-removal model: downloaded ${fetched} chunk(s) and verified their hashes.`);
  return chunks;
}

let imglyChunks = [];
try {
  imglyChunks = await mirrorImgly();
} catch (error) {
  // Do not break the build: Background Remover and ID Photo Maker will report
  // that the model is unavailable, and everything else keeps working.
  console.warn(`WARNING: background-removal model not mirrored (${error.message}).`);
}

// ---------- 3. Translation models (Tagalog-English Translator) ----------

// ONNX runtime for transformers.js, served from this site instead of a CDN.
mkdirSync("public/vendor/transformers", { recursive: true });
for (const file of ["ort-wasm-simd-threaded.jsep.wasm", "ort-wasm-simd-threaded.jsep.mjs"]) copy(`@huggingface/transformers/dist/${file}`, `vendor/transformers/${file}`);

/**
 * Helsinki-NLP opus-mt-en-tl and opus-mt-tl-en (Apache-2.0), exported to ONNX with the
 * transformers.js 2.17.2 conversion script, the shared embedding pre-transposed so the
 * output layer quantizes, then quantized to 8 bits. Release assets use "__" for "/".
 * See TRANSLATE-MODELS.md for how they were made.
 */
const TRANSLATE_RELEASE = "translate-models-v1";
const TRANSLATE_SOURCE = `https://github.com/BryxCinco/krea/releases/download/${TRANSLATE_RELEASE}/`;
const TRANSLATE_TARGET = "public/vendor/translate";
const TRANSLATE_CACHE = `.cache/${TRANSLATE_RELEASE}`;
const TRANSLATE_FILES = [
  { name: "opus-mt-en-tl__config.json", sha256: "000dde80471e866bdd057396cd3eea4b350c1aacc55ca3f15ba8b028716e9032", bytes: 1410 },
  { name: "opus-mt-en-tl__generation_config.json", sha256: "523ec3b6bba088325797bb44e92a5b3fd05d9d31f32042ed59625b8db2bbf9ff", bytes: 304 },
  { name: "opus-mt-en-tl__onnx__decoder_model_merged_quantized.onnx", sha256: "043b078d7aa53a978e56d3723dd22ca461b1d8f9d4bcfabaefaf5354b0d12753", bytes: 85453436 },
  { name: "opus-mt-en-tl__onnx__encoder_model_quantized.onnx", sha256: "9a470760bd7fcfb0eb6f433748f527284a5c2c8aae46c3f812a0e9f7cdbea216", bytes: 48855905 },
  { name: "opus-mt-en-tl__tokenizer.json", sha256: "fd56eec8081cbae820b1a398c4bac529cb2738b0cf178989afafa316743e2f45", bytes: 5798375 },
  { name: "opus-mt-en-tl__tokenizer_config.json", sha256: "5088b9660a5519525d1aa30ce9ae52db900e581c5a84b0f7045c20a0360d6947", bytes: 292 },
  { name: "opus-mt-tl-en__config.json", sha256: "c17cff85798756443d7704bb8844c16626bd3ae618b918b83fb09973d42ae305", bytes: 1444 },
  { name: "opus-mt-tl-en__generation_config.json", sha256: "9b76c63a4020f18f1796efb01d20b89dcdf4e79e1b40b2f91f2106fe3aba866f", bytes: 304 },
  { name: "opus-mt-tl-en__onnx__decoder_model_merged_quantized.onnx", sha256: "c2724388bfadff553a1b2b9b9f1b2669b5d9c91929f34c085b3fede123726761", bytes: 85273536 },
  { name: "opus-mt-tl-en__onnx__encoder_model_quantized.onnx", sha256: "66634cb9f86f07e47be8cc14213d57de9abd65aa542e3d33b7a47a30fe3c2856", bytes: 48766305 },
  { name: "opus-mt-tl-en__tokenizer.json", sha256: "627c12a7da285760fa41e362a87aecf128311aa5601d2ad2d261333a360fe1e2", bytes: 5779596 },
  { name: "opus-mt-tl-en__tokenizer_config.json", sha256: "0c08cd9bc13c3f26c47bba833b837fe4aafce9b19bfec05a73265b6e99e9d244", bytes: 294 },
];

async function mirrorTranslate() {
  mkdirSync(TRANSLATE_CACHE, { recursive: true });
  let fetched = 0;
  for (const file of TRANSLATE_FILES) {
    const cached = join(TRANSLATE_CACHE, file.name);
    if (!existsSync(cached) || sha256(readFileSync(cached)) !== file.sha256) {
      const data = await download(TRANSLATE_SOURCE + file.name);
      if (sha256(data) !== file.sha256) throw new Error(`Hash mismatch for ${file.name}`);
      writeFileSync(cached, data);
      fetched++;
    }
    const target = join(TRANSLATE_TARGET, ...file.name.split("__"));
    mkdirSync(join(target, ".."), { recursive: true });
    cpSync(cached, target);
  }
  if (fetched) console.log(`Translation models: downloaded ${fetched} file(s) and verified their hashes.`);
}

try {
  await mirrorTranslate();
} catch (error) {
  // Do not break the build: the Tagalog-English Translator says the models are unavailable.
  console.warn(`WARNING: translation models not mirrored (${error.message}). Upload the ${TRANSLATE_RELEASE} release assets (TRANSLATE-MODELS.md).`);
}

// ---------- 4. Offline manifest ----------

const size = (path) => statSync(join("public", path)).size;
const walk = (dir) =>
  readdirSync(join("public", dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [relative("public", join("public", dir, entry.name))],
  );
const entry = (path, group) => ({ url: `/${path.replaceAll("\\", "/")}`, size: size(path), group });

const files = [
  ...walk("pdfjs").map((path) => entry(path, "PDF engines")),
  entry("vendor/qpdf/qpdf.wasm", "PDF engines"),
  entry("vendor/zxing/zxing_reader.wasm", "Barcode scanner"),
  entry("tesseract/worker.min.js", "OCR"),
  ...tesseractCores.map((core) => entry(`tesseract/core/${core}`, "OCR")),
  ...["eng", "fil"].map((language) => entry(`tesseract/lang/${language}.traineddata.gz`, "OCR")),
];
if (imglyChunks.length) {
  files.push(entry("vendor/imgly/resources.json", "Background remover"));
  for (const chunk of imglyChunks.filter((item) => item.offline)) files.push(entry(`vendor/imgly/${chunk.name}`, "Background remover"));
}
writeFileSync("public/offline-manifest.json", JSON.stringify({ version: IMGLY_VERSION, files }));
const total = files.reduce((sum, file) => sum + file.size, 0);
console.log(`Offline manifest: ${files.length} files, ${(total / 1e6).toFixed(1)} MB.`);
