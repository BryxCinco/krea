# Krea (Kinetic Render Engine App)

A local-first, privacy-first toolkit for images, PDFs and documents. 35 tools run entirely in the browser: compress, convert, watermark, upscale, redact and strip metadata from images, make ID photos, collages and signatures, scan documents, merge, compress, sign, number and password-protect PDFs, read text with OCR, write Markdown, resumes and invoices, make QR codes and barcodes, generate passwords, compute PH take-home, 13th month, overtime and loan payments, and compress videos or turn them into GIFs.

There is no backend, no database and no account. Files never leave the device, and the app makes no requests to third parties.

## Setup

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev        # http://localhost:3000
```

Production build (needed to test offline mode, which only registers in production):

```bash
npm run build
npm run start
```

Other scripts: `npm run lint`, `npm run typecheck`.

### Engine files (`npm run assets`)

`copy-assets.mjs` runs automatically before `dev` and `build`. It:

- copies pdf.js, qpdf (WebAssembly) and Tesseract OCR files (English and Filipino) from `node_modules` into `public/`;
- mirrors the background-removal model (about 138 MB) into `public/vendor/imgly/`. The model is not published on npm for the library version used, so the first build downloads it once from the publisher's CDN, checks every chunk against the SHA-256 hash it is named after, and caches it in `.cache/`. Visitors then load it from your site, never from the CDN. If the download fails the build continues and only Background Remover and ID Photo Maker are unavailable;
- writes `public/offline-manifest.json`, the list of files "Make offline-ready" downloads.

All of these outputs are git-ignored.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Recommended | Public URL, e.g. `https://krea.example`. Used for canonical links, Open Graph URLs, `sitemap.xml` and `robots.txt`. Read at build time. |

If it is not set, Krea uses Vercel's production domain (`VERCEL_PROJECT_PRODUCTION_URL`), then `http://localhost:3000`.

## How it works

- **Home** has the Stage on top and the tool cards below. Drop, paste or pick files; Krea sniffs the real file type, offers the Moves that fit, and highlights the matching cards. iPhone HEIC photos are converted to JPEG on arrival.
- **Workers**: file tools run in Web Workers, so the page stays responsive and Cancel stops a job instantly. PDF rendering and OCR are coordinated from the page while pdf.js and Tesseract work in their own workers. Browsers without `OffscreenCanvas` (older iOS) run image tools on the page instead.
- **Editor tools** have their own UI in `src/components/stage/editors/`: Markdown, resume, invoice, QR, take-home pay, Signature Maker, Text Toolkit, Password, Barcode & QR Scanner, Blur & Redact, PH Pay Calculators, Document Scanner and Video Compressor. Markdown, resume and invoice data autosave to `localStorage`; signatures are saved only when you press Save (up to 6, with Delete); passwords, salaries, loans, photos, scans and videos are never saved. "Save as PDF" prints a standalone document through the browser's print dialog, which produces a real, selectable PDF.
- **Video** (tool 35) uses the browser's own WebCodecs encoder through Mediabunny, not ffmpeg.wasm (whose core is GPL and about 31 MB). Browsers without WebCodecs get a clear message.
- **Command Palette**: `Ctrl+K` or `/` jumps to any tool, opens Chains, or switches the theme.

### Theme system

Dark (default), Light and System. Every colour is a CSS variable in `src/app/globals.css`, switched by `<html data-theme>`. An inline script (`src/lib/theme.ts`) sets the theme before the first paint, so there is no flash. The choice is stored in `localStorage` (`krea.theme`). Components use role tokens only: `bg-lime` with `text-on-lime` for bright fills, `text-accent`/`border-accent` for accent text and lines (deep olive in light mode, where bright lime is unreadable), `signal` for warnings and active processing, `paper` for document surfaces.

### Render Chains

Chains run several Moves in sequence on the Stage files (Chains button or header link). Each tool declares what it outputs, so incompatible steps are blocked with a reason. Chains save to `localStorage` (`krea.chains.v1`) without secret fields such as passwords. Built-in presets: Gov Portal Ready, 2x2 ID Photo, Email-Safe PDF. A failed step is named and the output of earlier steps is kept.

### Offline behaviour

`public/sw.js` caches the app on first visit. Engine files go into a separate cache that survives deploys (bump `VENDOR` in `sw.js` when pdf.js, qpdf, Tesseract or the model change; bump `VERSION` for app-shell changes). Big engines cache on first use, or all at once with **Make offline-ready** on the Privacy page and in the phone menu (about 80 MB; the 88 MB Detailed background model still caches on first use).

## Adding a tool

1. Create one file in `src/tools/image/`, `src/tools/pdf/` or `src/tools/text/` that exports a `Tool` (see `src/tools/types.ts`):

   ```ts
   export const grayscale: Tool = {
     id: 26,
     slug: "grayscale",
     name: "Grayscale",
     verb: "Grayscale",
     category: "image",
     description: "Turn a photo black and white.",
     accepts: IMAGE_MIMES,
     output: "image", // what comes out, so Render Chains can check that steps fit
     seoTitle: "...",
     seoDescription: "...",
     howTo: ["Drop an image.", "Download the result."],
     faqs: [{ q: "Is my photo uploaded?", a: "No. ..." }], // 3 to 5, shown on the page and in structured data
     icon: "convert",
     worker: "image",
     input: "each", // batch-capable; "all" combines every file into one result
     fields: [{ key: "strength", label: "Strength", type: "slider", min: 0, max: 100, step: 1, unit: "%", default: 100 }],
     async run([file], options, ctx) {
       const bitmap = await decodeImage(file);
       // ...draw to an OffscreenCanvas, encode, return files
       return { files: [{ name: renameFile(file.name, "jpg", "-gray"), type: "image/jpeg", blob }] };
     },
   };
   ```

   For an editor-style tool, use `editorTool({...})` from `src/tools/text/editor-tool.ts`, add its component to `src/components/stage/editors/`, and map the slug in `editor-host.tsx`.

2. Add one line to the `tools` array in `src/tools/registry.ts`.

The Stage, cards, palette, chains, tool page (with SEO metadata, JSON-LD, FAQs, related tools and an Open Graph image), sitemap and offline cache pick it up. Guidelines: import heavy libraries with `await import()` inside `run()`; throw `KreaError` with a specific message; add icon keys in `src/tools/types.ts` and `src/components/ui/icon.tsx`.

## Deploying to Vercel

`krea/` is its own git repository with no remote yet. To deploy:

1. Create an empty repository on GitHub (no README or license, so the first push is clean).
2. Connect and push from the `krea/` folder:

   ```bash
   git remote add origin https://github.com/<you>/krea.git
   git push -u origin main
   ```

3. In Vercel, choose **Add New... > Project**, import the repository, and keep the detected Next.js settings (build command `npm run build`, no output directory override).
4. Under **Environment Variables**, add `NEXT_PUBLIC_SITE_URL` with your final URL (for example `https://krea.example`). Without a custom domain, use the `https://<project>.vercel.app` URL.
5. Deploy. The first build downloads the background-removal model (about 138 MB), so it takes a few minutes longer than later builds.
6. If you add a custom domain later, update `NEXT_PUBLIC_SITE_URL` and redeploy so canonical URLs and the sitemap use it.

Every page is prerendered; there are no server functions doing work for users.

## License note

Krea uses `@imgly/background-removal`, which is licensed **AGPL-3.0**. Serving it on a public website may oblige you to publish Krea's source under the AGPL. Check this before launch: publish the source, buy IMG.LY's commercial license, or replace the background-removal engine. See `LAUNCH-CHECKLIST.md`.

Other licences that carry duties: `heic-to` (LGPL-3.0), Mediabunny (MPL-2.0, used unmodified), the EFF Large Wordlist (CC BY 3.0 US, attributed on `/about`), and ZXing-C++ inside `zxing-wasm` (Apache-2.0). Everything else is MIT, ISC or Apache-2.0. The full list is on `/about`.
