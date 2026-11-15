# Krea (Kinetic Render Engine App)

@AGENTS.md

Local-first, privacy-first file toolkit. Everything runs in the browser: no backend, no database, no accounts, no uploads. Never add code that sends file content or filenames anywhere.

## Commands

- `npm run dev` / `npm run build` / `npm run start`
- `npm run lint`, `npm run typecheck`
- `npm run assets` (`copy-assets.mjs`) copies pdf.js, qpdf and Tesseract files into `public/`, mirrors the background-removal model into `public/vendor/imgly` (downloaded once at build, SHA-256 verified, cached in `.cache/`) and writes `public/offline-manifest.json`. Runs before dev and build; all git-ignored. Krea makes no third-party requests at runtime; keep it that way.
- `NEXT_PUBLIC_SITE_URL` sets the canonical domain (`src/lib/site.ts`).

## Architecture rules

- **Hybrid layout (since Milestone 2).** Home is hero + the Stage on top, then the tool card grid. The Stage stays file-first: dropping files shows Moves, and cards for compatible tools light up while the rest dim.
- **One tool = one file + one registry line.** Tools live in `src/tools/{image,pdf,text}/`, are registered in `src/tools/registry.ts`, and describe their settings as `fields` (see `src/tools/types.ts`). The inspector renders fields generically; tools ship no UI of their own.
- **Tools run in workers.** `run()` executes inside `src/workers/*` via `src/lib/chain-runner.ts`. Heavy libraries are `await import()`ed inside `run()`, never at module top level, because the registry is also imported on the main thread.
- **Editor tools (Text & Docs)** use `editorTool()` (`kind: "editor"`): metadata and pure logic in `src/tools/text/`, UI in `src/components/stage/editors/` mapped in `editor-host.tsx`. Generated documents escape every value (`esc()` in `doc-utils.ts`); Markdown is sanitized with DOMPurify. Never persist passwords, salary, Wi-Fi or account data.
- **No OffscreenCanvas** (old iOS): `worker-client.ts` runs image/pdf steps on the page with `src/lib/offscreen-shim.ts`.
- **Exceptions: pdf.js rendering and OCR** (`worker: "pdfjs"` / `"ocr"`, `src/lib/pdf-render.ts`, `src/lib/ocr.ts`): pdf.js needs the DOM and Tesseract ships its own worker, so these are coordinated from the page while the libraries' own workers do the work. Such tools must check `ctx.signal` to support cancel.
- **Render Chains** run step by step via `runSteps` in `src/lib/worker-client.ts`, each step where its tool lives. Every tool declares `output` so `src/lib/chains.ts` can block incompatible steps; tools that need hands-on input set `notChainable`. Fields with `secret: true` are never saved to localStorage.
- **Fields drawn on the Stage**: `crop`, `placement` and `pageGrid` render on the Stage (crop box, signature placement, page thumbnails), not in the inspector.
- **Editors that are not Text & Docs** pass a category to `editorTool(meta, category)` (Signature Maker, Blur & Redact and Document Scanner are `image`, Barcode is `code`, Video is `video`). Editors that read pointer positions on a canvas must size it by its own aspect (`w-auto h-auto max-w-full max-h-[..]`), never `w-full object-contain`, or the letterbox shifts every point.
- **Video** uses Mediabunny (MPL-2.0) on the browser's WebCodecs, and gifenc (types in `src/lib/gifenc.d.ts`). Do not add ffmpeg.wasm: `@ffmpeg/core` is GPL-2.0-or-later and about 31 MB.
- **PH rules** live in `src/config/ph-contributions.ts` (take-home pay) and `src/config/ph-labor.ts` (13th month, overtime, holidays), each with `LAST_UPDATED` and `VERIFICATION_STATUS`. Update both together with their sources.
- **Every tool needs 3-5 `faqs`**; tool pages render them with JSON-LD. Set canonical URLs per page, never in the layout.
- **Dialogs and sheets** use `useFocusTrap`; tablists use `onTabListKeyDown`. Keep axe clean (tests ran with zero violations).
- **Errors** thrown from tools should be `KreaError` with a code and a clear, specific message.
- **Next.js 16 with Cache Components.** Route segment configs like `dynamicParams` are not allowed. Read `node_modules/next/dist/docs/` before using a Next API.
- **Service worker** is hand-written in `public/sw.js` and only registers in production builds. Bump `VERSION` for app-shell changes and `VENDOR` when engine files change (the vendor cache survives deploys).
- **qpdf-wasm** has a Node-only branch; `fs`/`path`/`crypto` are aliased to `src/lib/empty-module.ts` for browser bundles in `next.config.ts`.

## Design: "Kinetic Darkroom"

- Dark (default), Light and System themes. All colours are CSS variables in `src/app/globals.css`, switched by `<html data-theme>` set before paint (`src/lib/theme.ts`). Never hard-code a colour in a component.
- Colour roles: `bg-lime` + `text-on-lime` for bright fills; `text-accent` / `border-accent` for accent text and lines (bright lime in dark, deep olive `#47630a` in light, because bright lime is unreadable on light); `signal` only for warnings and active processing; `paper` for document surfaces (signature pad, page previews).
- Bricolage Grotesque for text, JetBrains Mono for numbers, sizes and status.
- lucide-react line icons only. No emoji, no "Ready"-style status badges.
- Respect `prefers-reduced-motion`. Mobile-first: 40px+ touch targets, bottom sheet for settings.
- Microcopy: natural Taglish in empty states, success and error messages; plain English for technical labels.

## Folder structure (fixed, do not reorganize)

`src/app` routes · `src/components/{stage,palette,chains,inspector,ui}` · `src/tools` · `src/workers` · `src/lib` · `src/config` · `src/styles`

## Milestones

1. Done: scaffold, design system, Stage, palette, registry, workers, PWA, tools 1-6, 11, 12, 14, 15.
2. Done: layout revamp (header, card grid, themes), tools 7-10, 13, 16-20, Render Chains and presets.
3. Done: tools 21-25, self-hosted model, Make offline-ready, HEIC, collage swap, SEO pages, privacy/about/how-it-works, accessibility and performance pass. See LAUNCH-CHECKLIST.md.
4. Done: tools 26-35 (EXIF Remover, Signature Maker, PDF Page Numbers, Text Toolkit, Password, Barcode & QR Scanner, Blur & Redact, PH Pay Calculators, Document Scanner, Video Compressor & MP4 to GIF), new `code` and `video` categories.
