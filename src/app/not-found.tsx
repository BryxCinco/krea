import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

/** 404: short, honest, and two ways forward. */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-xl flex-col items-start justify-center px-4 py-16">
      <p className="font-mono text-sm text-signal">404</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-fg sm:text-5xl">Wala dito ang hinahanap mo.</h1>
      <p className="mt-3 leading-relaxed text-muted">This page does not exist. The link may be old, or the address has a typo.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-lime px-6 font-semibold text-on-lime hover:brightness-110">
          <ArrowLeft aria-hidden className="size-4" strokeWidth={2} />
          Back to the Stage
        </Link>
        <Link href="/tools" className="inline-flex min-h-12 items-center gap-2 rounded-full border border-line px-6 text-fg hover:border-accent">
          <Search aria-hidden className="size-4" strokeWidth={1.75} />
          Browse all tools
        </Link>
      </div>
    </div>
  );
}
