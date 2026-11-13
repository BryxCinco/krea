# Krea (Kinetic Render Engine)

A local-first, privacy-first file toolkit. Compress, resize and convert images, make ID photos, merge and split PDFs, all inside your browser. There is no backend, no database and no account. Files never leave the device.

> Status: Milestone 1 of 3. Ten of the 25 planned tools are implemented; see [Roadmap](#roadmap).

## Setup

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev        # http://localhost:3000
```

Production build:

```bash
npm run build
npm run start
```

Other scripts: `npm run lint`, `npm run typecheck`. `npm run assets` copies pdf.js runtime files into `public/pdfjs/`; it runs automatically before `dev` and `build`.

The service worker (offline support) only registers in a production build, so test offline behaviour with `npm run build && npm run start`.

## How it works

- **The Stage** (`/`) is one large dropzone. Drop, paste or pick files; Krea sniffs the real file type and offers the Moves that fit.
- **Command Palette**: `Ctrl+K` or `/` jumps to any tool.
- **Tool pages** (`/tools/[slug]`) show the same workspace locked to one tool. `/tools` lists everything.
- **Workers**: tools run inside Web Workers, so the page stays responsive and Cancel simply terminates the worker. PDF rendering is the one exception: pdf.js needs the DOM, so it is driven from the page while pdf.js's own workers parse and rasterize.
- **Offline**: after the first visit the service worker caches the app's code. Switch on airplane mode and it still works.

### Privacy

- Files are held in memory only. **Wipe session** clears them and stops every worker.
- No analytics. Fonts are self-hosted at build time.
- The only third-party request is a one-time download of the background-removal model from IMG.LY's CDN (`staticimgly.com`), used by Background Remover and ID Photo Maker. It is a download of public model files; your photo is not sent. The service worker caches it for offline use.

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
     seoTitle: "...",
     seoDescription: "...",
     howTo: ["Drop an image.", "Download the result."],
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

2. Add one line to the `tools` array in `src/tools/registry.ts`.

That is all: the Stage, palette, All Tools page, `/tools/[slug]` route and offline cache pick it up. Guidelines:

- Import heavy libraries with `await import()` inside `run()`, not at the top of the file.
- Throw `KreaError` with a specific message for bad input.
- Settings are declared as `fields`; the inspector renders them. Add a new icon key in `src/tools/types.ts` and `src/components/ui/icon.tsx` if needed.

## Deploying to Vercel

1. Push the repository to GitHub.
2. In Vercel, **Add New Project** and import it. The framework preset (Next.js) and default build command (`npm run build`) are correct; no environment variables are needed.
3. Deploy. Every page is prerendered as static content.

Or from the terminal: `npx vercel` for a preview, `npx vercel --prod` for production.

## Roadmap

- **Milestone 1 (done)**: Stage, Command Palette, registry, workers, PWA; Image Compressor, Resizer, Crop & Rotate, Format Converter, Background Remover, ID Photo Maker; Merge PDFs, Split PDF, PDF to Image, Image to PDF.
- **Milestone 2**: Watermark, Upscaler, Palette Extractor, Collage; Compress PDF, PDF Watermark, Sign, Protect/Unlock, Page Organizer, OCR; Render Chains and presets.
- **Milestone 3**: Markdown Editor, Resume Builder, Invoice Generator, QR Code Generator, PH Take-Home Pay Calculator; SEO, performance and accessibility pass.
