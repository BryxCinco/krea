# Krea (Kinetic Render Engine)

@AGENTS.md

Local-first, privacy-first file toolkit. Everything runs in the browser: no backend, no database, no accounts, no uploads. Never add code that sends file content or filenames anywhere.

## Commands

- `npm run dev` / `npm run build` / `npm run start`
- `npm run lint`, `npm run typecheck`
- `npm run assets` (`copy-assets.mjs`) copies pdf.js, qpdf and Tesseract runtime files into `public/pdfjs`, `public/vendor`, `public/tesseract` (runs before dev and build; git-ignored). Nothing loads from a CDN except the background-removal model.

## Architecture rules

- **Hybrid layout (since Milestone 2).** Home is hero + the Stage on top, then the tool card grid. The Stage stays file-first: dropping files shows Moves, and cards for compatible tools light up while the rest dim.
- **One tool = one file + one registry line.** Tools live in `src/tools/{image,pdf,text}/`, are registered in `src/tools/registry.ts`, and describe their settings as `fields` (see `src/tools/types.ts`). The inspector renders fields generically; tools ship no UI of their own.
- **Tools run in workers.** `run()` executes inside `src/workers/*` via `src/lib/chain-runner.ts`. Heavy libraries are `await import()`ed inside `run()`, never at module top level, because the registry is also imported on the main thread.
- **Exceptions: pdf.js rendering and OCR** (`worker: "pdfjs"` / `"ocr"`, `src/lib/pdf-render.ts`, `src/lib/ocr.ts`): pdf.js needs the DOM and Tesseract ships its own worker, so these are coordinated from the page while the libraries' own workers do the work. Such tools must check `ctx.signal` to support cancel.
- **Render Chains** run step by step via `runSteps` in `src/lib/worker-client.ts`, each step where its tool lives. Every tool declares `output` so `src/lib/chains.ts` can block incompatible steps; tools that need hands-on input set `notChainable`. Fields with `secret: true` are never saved to localStorage.
- **Fields drawn on the Stage**: `crop`, `placement` and `pageGrid` render on the Stage (crop box, signature placement, page thumbnails), not in the inspector.
- **Errors** thrown from tools should be `KreaError` with a code and a clear, specific message.
- **Next.js 16 with Cache Components.** Route segment configs like `dynamicParams` are not allowed. Read `node_modules/next/dist/docs/` before using a Next API.
- **Service worker** is hand-written in `public/sw.js` and only registers in production builds. Bump `VERSION` when cached vendor files change.
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
3. Next: tools 21-25, SEO pages, All Tools polish, README, performance and accessibility pass.
