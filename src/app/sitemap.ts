import type { MetadataRoute } from "next";
import { CONVERSIONS } from "@/config/conversions";
import { absoluteUrl } from "@/lib/site";
import { tools } from "@/tools/registry";

/** /sitemap.xml: every static page, tool page and conversion page, on the domain from NEXT_PUBLIC_SITE_URL. */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/tools"), changeFrequency: "weekly", priority: 0.9 },
    { url: absoluteUrl("/how-it-works"), changeFrequency: "monthly", priority: 0.5 },
    { url: absoluteUrl("/privacy"), changeFrequency: "monthly", priority: 0.5 },
    { url: absoluteUrl("/about"), changeFrequency: "monthly", priority: 0.4 },
  ];
  return [
    ...pages,
    ...tools.map((tool) => ({ url: absoluteUrl(`/tools/${tool.slug}`), changeFrequency: "monthly" as const, priority: 0.8 })),
    ...CONVERSIONS.map((entry) => ({ url: absoluteUrl(`/convert/${entry.slug}`), changeFrequency: "monthly" as const, priority: 0.7 })),
  ];
}
