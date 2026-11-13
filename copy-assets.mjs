/**
 * Copies third-party runtime files from node_modules into public/, so Krea
 * serves them itself and never depends on a CDN at runtime. Runs automatically
 * before `dev` and `build` (see package.json). The targets are git-ignored.
 */
import { cpSync, mkdirSync } from "node:fs";

const copy = (from, to) => cpSync(`node_modules/${from}`, `public/${to}`, { recursive: true });

// pdf.js: its own workers plus the data files it loads on demand.
for (const dir of ["cmaps", "standard_fonts", "wasm"]) copy(`pdfjs-dist/${dir}`, `pdfjs/${dir}`);
for (const file of ["pdf.worker.min.mjs", "pdf.renderer.min.mjs"]) copy(`pdfjs-dist/build/${file}`, `pdfjs/${file}`);

// qpdf (WebAssembly): PDF encryption and decryption.
mkdirSync("public/vendor/qpdf", { recursive: true });
copy("@neslinesli93/qpdf-wasm/dist/qpdf.wasm", "vendor/qpdf/qpdf.wasm");

// Tesseract OCR: worker, LSTM cores (the browser picks one by CPU features) and language data.
mkdirSync("public/tesseract/core", { recursive: true });
mkdirSync("public/tesseract/lang", { recursive: true });
copy("tesseract.js/dist/worker.min.js", "tesseract/worker.min.js");
for (const variant of ["", "-simd", "-relaxedsimd"]) {
  for (const extension of ["wasm.js", "wasm", "js"]) {
    copy(`tesseract.js-core/tesseract-core${variant}-lstm.${extension}`, `tesseract/core/tesseract-core${variant}-lstm.${extension}`);
  }
}
for (const language of ["eng", "fil"]) {
  copy(`@tesseract.js-data/${language}/4.0.0_best_int/${language}.traineddata.gz`, `tesseract/lang/${language}.traineddata.gz`);
}
