import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ToolIcon } from "@/components/ui/icon";
import { categories, tools } from "@/tools/registry";

export const metadata: Metadata = {
  title: "All Tools",
  description:
    "Every Krea tool in one list: image compressor, resizer, converter, background remover, ID photo maker, and PDF merge, split and convert. All run on your device.",
};

/** Secondary browsing page. The Stage is the main experience; this is an index for browsing and search engines. */
export default function AllToolsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 lg:py-14">
      <h1 className="text-4xl font-semibold tracking-tight text-fg sm:text-5xl">All tools</h1>
      <p className="mt-3 max-w-xl leading-relaxed text-muted">
        Mas mabilis sa{" "}
        <Link href="/" className="text-lime underline">
          Stage
        </Link>
        : drop a file and Krea shows the Moves that fit. Or pick a tool here.
      </p>

      {categories.map((category) => {
        const list = tools.filter((tool) => tool.category === category.id);
        if (list.length === 0) return null;
        return (
          <section key={category.id} aria-labelledby={`category-${category.id}`} className="mt-10">
            <h2 id={`category-${category.id}`} className="flex items-baseline gap-3 text-xs uppercase tracking-widest text-muted">
              {category.label}
              <span className="font-mono">{String(list.length).padStart(2, "0")}</span>
            </h2>
            <ul className="mt-3 border-t border-line">
              {list.map((tool) => (
                <li key={tool.slug} className="border-b border-line">
                  <Link href={`/tools/${tool.slug}`} className="group flex items-center gap-4 py-4 transition-colors hover:text-lime">
                    <ToolIcon name={tool.icon} className="size-5 shrink-0 text-muted group-hover:text-lime" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-lg font-medium text-fg group-hover:text-lime">{tool.name}</span>
                      <span className="block text-sm leading-relaxed text-muted">{tool.description}</span>
                    </span>
                    <ChevronRight aria-hidden className="size-5 shrink-0 text-muted group-hover:text-lime" strokeWidth={1.75} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
