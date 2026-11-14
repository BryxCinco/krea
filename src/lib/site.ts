/**
 * The public site URL, used for canonical links, Open Graph, the sitemap and
 * robots.txt. Set NEXT_PUBLIC_SITE_URL (e.g. https://krea.example) in the
 * hosting environment. On Vercel it falls back to the production domain Vercel
 * assigns; locally to http://localhost:3000.
 */
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export const SITE_URL = resolveSiteUrl();
export const SITE_NAME = "Krea";
export const SITE_TAGLINE = "Kinetic Render Engine";

/** Absolute URL for a path on this site. */
export const absoluteUrl = (path: string) => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;

/** Serialize structured data for a <script type="application/ld+json"> tag without allowing tag injection. */
export const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
