/*
 * Krea service worker: makes the app work offline after the first load.
 *
 * It only ever caches GET responses for the app's own code and the public
 * model files tools download. User files never pass through here: they are
 * read from memory in the page and are not part of any request.
 */
const VERSION = "krea-v2";
const SHELL = `${VERSION}-shell`; // pages and build assets
const MODELS = `${VERSION}-models`; // third-party model downloads (background removal)

/** Hosts that serve public, versioned model files to the on-device tools. */
const MODEL_HOSTS = ["staticimgly.com"];

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
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
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

  if (MODEL_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request, MODELS));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Build assets are content-hashed, and vendored engines (pdf.js, qpdf, Tesseract)
  // only change with a new deploy, which bumps VERSION. A cached copy is correct.
  if (["/_next/static/", "/pdfjs/", "/vendor/", "/tesseract/"].some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(cacheFirst(request, SHELL));
    return;
  }
  // Pages and everything else: fresh when online, cached when not.
  event.respondWith(networkFirst(request, request.mode === "navigate" ? "/" : undefined));
});

/**
 * "warm": fetch each page and the scripts and styles it references, so tools
 * the user has not opened yet still load offline.
 */
self.addEventListener("message", (event) => {
  if (event.data?.type !== "warm") return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      const seen = new Set();

      // Cache one URL, then follow every build asset it mentions. Pages name
      // their scripts and styles; scripts name the lazy chunks (tool libraries,
      // workers) they load later. Following both reaches the whole app.
      const crawl = async (url) => {
        if (seen.has(url)) return;
        seen.add(url);
        try {
          let response = await cache.match(url);
          if (!response) {
            response = await fetch(url);
            if (!response.ok) return;
            await cache.put(url, response.clone());
          }
          if (!/\.js$|\.mjs$|^\/[^.]*$/.test(url)) return; // only pages and scripts reference other assets
          const text = await response.text();
          const found = [...text.matchAll(/static\/(?:chunks|media)\/[\w\-.~/[\]@]+\.(?:js|css|woff2)/g)];
          await Promise.all(found.map((match) => crawl(`/_next/${match[0]}`)));
        } catch {
          // Offline or interrupted: warming is best-effort and retried on the next visit.
        }
      };

      for (const url of event.data.urls) await crawl(url);
    })(),
  );
});
