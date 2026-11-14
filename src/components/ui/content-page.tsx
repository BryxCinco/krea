import type { ReactNode } from "react";

/** Layout for text pages (privacy, about, how it works): readable width, consistent rhythm. */
export function ContentPage({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 lg:py-16">
      <p className="font-mono text-xs uppercase tracking-widest text-muted">{eyebrow}</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-fg sm:text-5xl">{title}</h1>
      <div className="mt-4 text-lg leading-relaxed text-muted">{intro}</div>
      <div className="mt-10 flex flex-col gap-10">{children}</div>
    </article>
  );
}

export function ContentSection({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className="scroll-mt-(--header-h)">
      <h2 id={id ? `${id}-title` : undefined} className="text-2xl font-semibold tracking-tight text-fg">
        {title}
      </h2>
      <div className="mt-3 flex flex-col gap-3 leading-relaxed text-muted [&_a]:text-accent [&_a]:underline [&_strong]:text-fg [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}
