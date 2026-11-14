/**
 * Shared helpers for the document editors: HTML escaping and a standalone
 * HTML page shell used for preview, HTML export and print-to-PDF.
 * Pure string functions, safe to import anywhere.
 */

/** Escape text for safe insertion into HTML. Every user value goes through this. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Only allow data:image URLs (from the device) and http(s) links into generated documents. */
export function safeImageSrc(value: string): string {
  return /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(value) ? value : "";
}

export type PaperSize = "a4" | "letter";

/** A complete HTML document. `css` styles the page; print margins come from `@page`. */
export function htmlDocument({ title, css, body, paper = "a4" }: { title: string; css: string; body: string; paper?: PaperSize }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
@page { size: ${paper === "letter" ? "letter" : "A4"}; margin: 14mm; }
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; color: #16171a; background: #ffffff; font-family: "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.5; }
@media screen { body { padding: 32px; } }
${css}
</style>
</head>
<body>
${body}
</body>
</html>`;
}
