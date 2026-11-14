/**
 * Offline support, page side. The service worker (public/sw.js) does the
 * caching; this module tells it what to fetch and relays progress.
 */
import { tools } from "@/tools/registry";

/** Every page of the app, so they all open offline. */
export function appPages(): string[] {
  return ["/", "/tools", "/privacy", "/about", "/how-it-works", ...tools.map((tool) => `/tools/${tool.slug}`)];
}

export type OfflineProgress =
  | { type: "progress"; done: number; total: number; group: string }
  | { type: "done"; total: number; count: number }
  | { type: "error"; failed: string[]; total?: number; message?: string };

/** Why "Make offline-ready" cannot run here, or null when it can. */
export function offlineUnavailableReason(): string | null {
  if (!("serviceWorker" in navigator) || !("caches" in window)) {
    return "This browser does not support offline caching (no service worker).";
  }
  if (process.env.NODE_ENV !== "production") {
    return "Offline caching only runs in the production build (npm run build, then npm run start).";
  }
  return null;
}

/**
 * Ask the service worker to download all heavy engine files.
 * Resolves when it reports done or an error.
 */
export async function makeOfflineReady(onProgress: (message: OfflineProgress) => void): Promise<OfflineProgress> {
  const registration = await navigator.serviceWorker.ready;
  const worker = registration.active;
  if (!worker) throw new Error("The offline helper is still starting. Reload the page and try again.");

  // Ask the browser not to evict this data under storage pressure. Best-effort:
  // some browsers decide on their own and resolve false.
  await navigator.storage?.persist?.().catch(() => false);

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event: MessageEvent<OfflineProgress>) => {
      onProgress(event.data);
      if (event.data.type !== "progress") {
        channel.port1.close();
        resolve(event.data);
      }
    };
    worker.postMessage({ type: "offline-ready", pages: appPages() }, [channel.port2]);
  });
}
