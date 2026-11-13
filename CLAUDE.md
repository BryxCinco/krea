# Krea (Kinetic Render Engine)

@AGENTS.md

Local-first, privacy-first file toolkit. Everything runs in the browser: no backend, no database, no accounts, no uploads. Never add code that sends file content or filenames anywhere.

## Commands

- `npm run dev` / `npm run build` / `npm run start`
- `npm run lint`, `npm run typecheck`
- `npm run assets` copies pdf.js runtime files into `public/pdfjs/` (runs automatically before dev and build; the folder is git-ignored)

## Architecture rules

- **File-first.** The Stage (`/`) is the main UI: drop files, Krea offers Moves. Do not make a tool-card grid the primary experience.
- **One tool = one file + one registry line.** Tools live in `src/tools/{image,pdf,text}/`, are registered in `src/tools/registry.ts`, and describe their settings as `fields` (see `src/tools/types.ts`). The inspector renders fields generically; tools ship no UI of their own.
- **Tools run in workers.** `run()` executes inside `src/workers/*` via `src/lib/chain-runner.ts`. Heavy libraries are `await import()`ed inside `run()`, never at module top level, because the registry is also imported on the main thread.
- **The one exception is pdf.js rendering** (`worker: "pdfjs"`, `src/lib/pdf-render.ts`): pdf.js needs the DOM, so it is coordinated from the page while its own parser and renderer workers do the work. Such tools must check `ctx.signal` to support cancel.
- **Errors** thrown from tools should be `KreaError` with a code and a clear, specific message.
- **Next.js 16 with Cache Components.** Route segment configs like `dynamicParams` are not allowed. Read `node_modules/next/dist/docs/` before using a Next API.
- **Service worker** is hand-written in `public/sw.js` and only registers in production builds.

## Design: "Kinetic Darkroom"

- Dark workspace; lime `#C6FF3D` is the only accent; signal `#FF6B3D` is reserved for warnings and active processing. Tokens are in `src/app/globals.css`.
- Bricolage Grotesque for text, JetBrains Mono for numbers, sizes and status.
- lucide-react line icons only. No emoji, no "Ready"-style status badges.
- Respect `prefers-reduced-motion`. Mobile-first: 40px+ touch targets, bottom sheet for settings.
- Microcopy: natural Taglish in empty states, success and error messages; plain English for technical labels.

## Folder structure (fixed, do not reorganize)

`src/app` routes · `src/components/{stage,palette,chains,inspector,ui}` · `src/tools` · `src/workers` · `src/lib` · `src/config` · `src/styles`

## Milestones

1. Done: scaffold, design system, Stage, palette, registry, workers, PWA, tools 1-6, 11, 12, 14, 15.
2. Next: tools 7-10, 13, 16-20, Render Chains and presets.
3. Then: tools 21-25, SEO pages, All Tools polish, README, performance and accessibility pass.
