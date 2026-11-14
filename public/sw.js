/*
 * Krea service worker: makes the app work offline after the first load.
 *
 * It only ever caches GET responses for the app's own code and the engine
 * files it serves (pdf.js, qpdf, Tesseract, the background-removal model).
 * User files never pass through here: they are read from memory in the page
 * and are never part of any request. Krea makes no third-party requests.
 */
const VERSION = "krea-v4";
/** Pages and build assets. Replaced on every deploy that bumps VERSION. */
const SHELL = `${VERSION}-shell`;
/**
 * Engine files (pdf.js, qpdf, Tesseract, the model). Large and only changed
 * when a dependency is upgraded, so this cache survives deploys. Bump VENDOR
 * when one of those dependencies changes.
 */
const VENDOR = "krea-vendor-1";
const VENDOR_PREFIXES = ["/pdfjs/", "/vendor/", "/tesseract/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(["/", "/tools", "/manifest.webmanifest"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION) && key !== VENDOR).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, { ignoreSearch: false });
  if (hit) {
    // Worker scripts read their bootstrap config from their own URL fragment.
    // A cached response carries the URL it was stored under (no fragment), so
    // re-wrap the body: a response without a URL keeps the requested one.
    return request.destination === "worker" ? new Response(hit.body, { headers: hit.headers }) : hit;
  }
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(SHELL);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = (await cache.match(request)) || (fallbackUrl && (await cache.match(fallbackUrl)));
    if (hit) return hit;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (VENDOR_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(cacheFirst(request, VENDOR));
    return;
  }
  // Build assets are content-hashed, so a cached copy is always correct.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, SHELL));
    return;
  }
  // Pages and everything else: fresh when online, cached when not.
  event.respondWith(networkFirst(request, request.mode === "navigate" ? "/" : undefined));
});

/**
 * Cache one URL, then follow every build asset it mentions. Pages name their
 * scripts and styles; scripts name the lazy chunks (tool libraries, workers)
 * they load later. Following both reaches the whole app.
 */
async function warm(urls) {
  const cache = await caches.open(SHELL);
  const seen = new Set();
  const crawl = async (url) => {
    if (seen.has(url)) return;
    seen.add(url);
    try {
      const vendor = VENDOR_PREFIXES.some((prefix) => url.startsWith(prefix));
      const target = vendor ? await caches.open(VENDOR) : cache;
      let response = await target.match(url);
      if (!response) {
        response = await fetch(url);
        if (!response.ok) return;
        await target.put(url, response.clone());
      }
      if (!/\.js$|\.mjs$|^\/[^.]*$/.test(url) || vendor) return; // only pages and our scripts reference other assets
      const text = await response.text();
      const found = [...text.matchAll(/static\/(?:chunks|media)\/[\w\-.~/[\]@]+\.(?:js|css|woff2)/g)];
      await Promise.all(found.map((match) => crawl(`/_next/${match[0]}`)));
    } catch {
      // Offline or interrupted: warming is best-effort and retried on the next visit.
    }
  };
  for (const url of urls) await crawl(url);
}

/**
 * "Make offline-ready": download every heavy engine file listed in
 * /offline-manifest.json into the vendor cache, reporting progress on the
 * MessagePort the page sent along.
 */
async function makeOfflineReady(port, pages) {
  const post = (message) => port?.postMessage(message);
  try {
    const manifest = await (await fetch("/offline-manifest.json", { cache: "no-store" })).json();
    const files = manifest.files;
    const total = files.reduce((sum, file) => sum + file.size, 0);
    const cache = await caches.open(VENDOR);
    let done = 0;
    const failed = [];

    // A few downloads at a time: fast, without flooding a slow connection.
    let next = 0;
    const lane = async () => {
      while (next < files.length) {
        const file = files[next++];
        try {
          if (!(await cache.match(file.url))) {
            const response = await fetch(file.url, { cache: "no-cache" });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            await cache.put(file.url, response);
          }
        } catch {
          failed.push(file.url);
        }
        done += file.size;
        post({ type: "progress", done, total, group: file.group });
      }
    };
    await Promise.all([lane(), lane(), lane(), lane()]);
    await warm(pages);

    post(failed.length ? { type: "error", failed, total } : { type: "done", total, count: files.length });
  } catch (error) {
    post({ type: "error", failed: [], message: String(error?.message ?? error) });
  }
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "warm") event.waitUntil(warm(event.data.urls));
  if (event.data?.type === "offline-ready") event.waitUntil(makeOfflineReady(event.ports[0], event.data.pages ?? []));
});
