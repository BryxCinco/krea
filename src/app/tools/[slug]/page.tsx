import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { EditorHost } from "@/components/stage/editors/editor-host";
import { Workspace } from "@/components/stage/workspace";
import { ToolCard } from "@/components/ui/tool-card";
import { absoluteUrl, jsonLd, SITE_NAME } from "@/lib/site";
import { categories, getTool, relatedTools, tools } from "@/tools/registry";

/** One static page per registered tool. Unknown slugs fall through to notFound() below. */
export function generateStaticParams() {
  return tools.map((tool) => ({ slug: tool.slug }));
}

export async function generateMetadata({ params }: PageProps<"/tools/[slug]">): Promise<Metadata> {
  const tool = getTool((await params).slug);
  if (!tool) return {};
  const path = `/tools/${tool.slug}`;
  return {
    title: tool.seoTitle,
    description: tool.seoDescription,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: SITE_NAME, url: path, title: tool.seoTitle, description: tool.seoDescription },
    twitter: { card: "summary_large_image", title: tool.seoTitle, description: tool.seoDescription },
  };
}

const APPLICATION_CATEGORY = { image: "MultimediaApplication", pdf: "BusinessApplication", text: "BusinessApplication", code: "UtilitiesApplication", video: "MultimediaApplication" } as const;

export default async function ToolPage({ params }: PageProps<"/tools/[slug]">) {
  const tool = getTool((await params).slug);
  if (!tool) notFound();
  const category = categories.find((entry) => entry.id === tool.category)!;
  const related = relatedTools(tool);
  const url = absoluteUrl(`/tools/${tool.slug}`);

  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: tool.name,
      description: tool.seoDescription,
      url,
      applicationCategory: APPLICATION_CATEGORY[tool.category],
      operatingSystem: "Any (runs in a web browser)",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "PHP" },
      publisher: { "@type": "Organization", name: SITE_NAME, url: absoluteUrl("/") },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: tool.faqs.map((faq) => ({ "@type": "Question", name: faq.q, acceptedAnswer: { "@type": "Answer", text: faq.a } })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Tools", item: absoluteUrl("/tools") },
        { "@type": "ListItem", position: 2, name: tool.name, item: url },
      ],
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />
      <div className="px-4 pt-8 lg:px-8">
        <nav aria-label="Breadcrumb" className="font-mono text-xs uppercase tracking-widest text-muted">
          <ol className="flex gap-2">
            <li>
              <Link href="/tools" className="hover:text-accent">
                Tools
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              {category.label} · {String(tool.id).padStart(2, "0")}
            </li>
          </ol>
        </nav>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-fg sm:text-5xl">{tool.name}</h1>
        <p className="mt-2 max-w-2xl leading-relaxed text-muted">{tool.description}</p>
      </div>

      <div className="mt-6">{tool.kind === "editor" ? <EditorHost slug={tool.slug} /> : <Workspace lockedSlug={tool.slug} />}</div>

      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-12 lg:grid-cols-2 lg:px-8">
        <section aria-labelledby="how-to">
          <h2 id="how-to" className="text-2xl font-semibold tracking-tight text-fg">
            How to use {tool.name}
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
              <Link href="/privacy" className="text-accent underline">
                What Krea sends and does not send
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
            {tool.faqs.map((faq) => (
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

      {related.length > 0 && (
        <section aria-labelledby="related" className="border-t border-line">
          <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
            <h2 id="related" className="text-2xl font-semibold tracking-tight text-fg">
              Related tools
            </h2>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
              {related.map((other, index) => (
                <li key={other.slug}>
                  <ToolCard
                    index={index}
                    fit="neutral"
                    tool={{
                      slug: other.slug,
                      name: other.name,
                      description: other.description,
                      icon: other.icon,
                      categoryLabel: categories.find((entry) => entry.id === other.category)?.label ?? "",
                    }}
                  />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
