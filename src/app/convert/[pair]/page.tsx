import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronDown, ShieldCheck } from "lucide-react";
import { EditorHost } from "@/components/stage/editors/editor-host";
import { Workspace } from "@/components/stage/workspace";
import { CONVERSIONS, getConversion } from "@/config/conversions";
import { absoluteUrl, jsonLd, SITE_NAME } from "@/lib/site";
import { getTool } from "@/tools/registry";

/**
 * Conversion landing pages ("webp to png", "heic to jpg"…): a page per common search,
 * each embedding the tool that does the job with the output already chosen.
 * Data: src/config/conversions.ts.
 */
type Props = { params: Promise<{ pair: string }> };

export function generateStaticParams() {
  return CONVERSIONS.map((entry) => ({ pair: entry.slug }));
}

const titleOf = (from: string, to: string) => `${from} to ${to} Converter: free, private, in your browser`;
const descriptionOf = (from: string, to: string, intro: string) => `Convert ${from} to ${to} online without uploading. ${intro}`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const entry = getConversion((await params).pair);
  if (!entry) return {};
  const path = `/convert/${entry.slug}`;
  const title = titleOf(entry.from, entry.to);
  const description = descriptionOf(entry.from, entry.to, entry.intro);
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: SITE_NAME, url: path, title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ConversionPage({ params }: Props) {
  const entry = getConversion((await params).pair);
  const tool = entry ? getTool(entry.tool) : undefined;
  if (!entry || !tool) notFound();
  const url = absoluteUrl(`/convert/${entry.slug}`);
  const others = CONVERSIONS.filter((other) => other.slug !== entry.slug);

  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: `${entry.from} to ${entry.to} Converter`,
      description: descriptionOf(entry.from, entry.to, entry.intro),
      url,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Any (runs in a web browser)",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "PHP" },
      publisher: { "@type": "Organization", name: SITE_NAME, url: absoluteUrl("/") },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: entry.faqs.map((faq) => ({ "@type": "Question", name: faq.q, acceptedAnswer: { "@type": "Answer", text: faq.a } })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Tools", item: absoluteUrl("/tools") },
        { "@type": "ListItem", position: 2, name: tool.name, item: absoluteUrl(`/tools/${tool.slug}`) },
        { "@type": "ListItem", position: 3, name: `${entry.from} to ${entry.to}`, item: url },
      ],
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />
      <div className="px-4 pt-8 lg:px-8">
        <nav aria-label="Breadcrumb" className="font-mono text-xs uppercase tracking-widest text-muted">
          <ol className="flex flex-wrap gap-2">
            <li>
              <Link href="/tools" className="hover:text-accent">
                Tools
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link href={`/tools/${tool.slug}`} className="hover:text-accent">
                {tool.name}
              </Link>
            </li>
          </ol>
        </nav>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
          {entry.from} to {entry.to}
        </h1>
        <p className="mt-2 max-w-2xl leading-relaxed text-muted">{entry.intro}</p>
      </div>

      <div className="mt-6">{tool.kind === "editor" ? <EditorHost slug={tool.slug} preset={entry.preset} /> : <Workspace lockedSlug={tool.slug} preset={entry.preset} />}</div>

      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-12 lg:grid-cols-2 lg:px-8">
        <section aria-labelledby="how-to">
          <h2 id="how-to" className="text-2xl font-semibold tracking-tight text-fg">
            How to convert {entry.from} to {entry.to}
          </h2>
          <ol className="mt-5 flex flex-col gap-3">
            {tool.howTo.map((step, index) => (
              <li key={step} className="flex gap-4 leading-relaxed text-fg">
                <span className="font-mono text-accent">{String(index + 1).padStart(2, "0")}</span>
                {step}
              </li>
            ))}
          </ol>
          <p className="mt-6 flex gap-2 text-sm leading-relaxed text-muted">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={1.75} />
            <span>
              Private by design: everything happens in this browser tab. Walang account, walang upload.{" "}
              <Link href={`/tools/${tool.slug}`} className="text-accent underline">
                More about {tool.name}
              </Link>
              .
            </span>
          </p>
        </section>

        <section aria-labelledby="faq">
          <h2 id="faq" className="text-2xl font-semibold tracking-tight text-fg">
            Questions
          </h2>
          <div className="mt-5 border-t border-line">
            {entry.faqs.map((faq) => (
              <details key={faq.q} className="group border-b border-line">
                <summary className="flex min-h-12 list-none items-center justify-between gap-4 py-3 font-medium text-fg [&::-webkit-details-marker]:hidden">
                  {faq.q}
                  <ChevronDown aria-hidden className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" strokeWidth={1.75} />
                </summary>
                <p className="pb-4 leading-relaxed text-muted">{faq.a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>

      <section aria-labelledby="more-conversions" className="border-t border-line">
        <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
          <h2 id="more-conversions" className="text-2xl font-semibold tracking-tight text-fg">
            More conversions
          </h2>
          <ul className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {others.map((other) => (
              <li key={other.slug}>
                <Link href={`/convert/${other.slug}`} className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-line px-4 text-sm text-fg hover:border-accent">
                  {other.from} to {other.to}
                  <ArrowRight aria-hidden className="size-4 text-muted" strokeWidth={1.75} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
