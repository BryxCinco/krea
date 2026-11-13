import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/stage/workspace";
import { getTool, tools } from "@/tools/registry";

/** One static page per registered tool. Unknown slugs fall through to notFound() below. */
export function generateStaticParams() {
  return tools.map((tool) => ({ slug: tool.slug }));
}

export async function generateMetadata({ params }: PageProps<"/tools/[slug]">): Promise<Metadata> {
  const tool = getTool((await params).slug);
  if (!tool) return {};
  return { title: tool.seoTitle, description: tool.seoDescription, alternates: { canonical: `/tools/${tool.slug}` } };
}

export default async function ToolPage({ params }: PageProps<"/tools/[slug]">) {
  const tool = getTool((await params).slug);
  if (!tool) notFound();

  return (
    <>
      <div className="px-4 pt-8 lg:px-8">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">
          {tool.category} / {String(tool.id).padStart(2, "0")}
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-fg sm:text-5xl">{tool.name}</h1>
        <p className="mt-2 max-w-2xl leading-relaxed text-muted">{tool.description}</p>
      </div>

      {/* The same Workspace as the Stage, locked to this tool. */}
      <Workspace lockedSlug={tool.slug} />

      <section aria-labelledby="how-to" className="border-t border-line px-4 py-10 lg:px-8">
        <h2 id="how-to" className="text-xs uppercase tracking-widest text-muted">
          How it works
        </h2>
        <ol className="mt-4 flex max-w-2xl flex-col gap-3">
          {tool.howTo.map((step, index) => (
            <li key={step} className="flex gap-4 leading-relaxed text-fg">
              <span className="font-mono text-accent">{String(index + 1).padStart(2, "0")}</span>
              {step}
            </li>
          ))}
        </ol>
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted">
          Private by design: your files are processed in this browser tab and are never uploaded. Walang account, walang
          bayad.
        </p>
      </section>
    </>
  );
}
