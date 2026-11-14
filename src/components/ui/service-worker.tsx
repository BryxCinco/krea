"use client";

import { useEffect } from "react";
import { appPages } from "@/lib/offline";

/**
 * Registers the service worker (production only, so it never fights the dev
 * server) and asks it to cache every page and the small PDF engines. The large
 * engines (AI model, OCR) are cached on first use, or all at once with
 * "Make offline-ready".
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
          urls: [...appPages(), "/pdfjs/pdf.worker.min.mjs", "/pdfjs/pdf.renderer.min.mjs", "/vendor/qpdf/qpdf.wasm"],
        });
      })
      .catch(() => {
        // Offline support is an enhancement; the app works without it.
      });
  }, []);
  return null;
}
