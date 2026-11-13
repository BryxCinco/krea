"use client";

import { useEffect } from "react";
import { tools } from "@/tools/registry";

/**
 * Registers the service worker (production only, so it never fights the dev
 * server) and asks it to cache every tool page for offline use.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        registration.active?.postMessage({
          type: "warm",
          urls: [
            "/",
            "/tools",
            ...tools.map((tool) => `/tools/${tool.slug}`),
            // pdf.js's own workers, so PDF rendering is available offline too.
            "/pdfjs/pdf.worker.min.mjs",
            "/pdfjs/pdf.renderer.min.mjs",
            // qpdf, for Protect / Unlock PDF (1.3 MB). OCR files (about 10 MB) are cached on first use instead.
            "/vendor/qpdf/qpdf.wasm",
          ],
        });
      })
      .catch(() => {
        // Offline support is an enhancement; the app works without it.
      });
  }, []);
  return null;
}
