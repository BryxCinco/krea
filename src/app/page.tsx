import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, UserX, WifiOff, Zap } from "lucide-react";
import { Workspace } from "@/components/stage/workspace";
import { KineticTitle } from "@/components/ui/kinetic-title";
import { ToolBrowser } from "@/components/ui/tool-browser";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { url: "/" },
};

const reasons = [
  {
    icon: ShieldCheck,
    title: "On-device",
    body: "Your photos and PDFs are processed by your own phone or computer. Hindi sila umaalis sa device mo.",
  },
  {
    icon: Zap,
    title: "No uploads, no waiting",
    body: "Nothing to upload means no progress bar for a 20 MB scan on slow data. Most jobs finish in a second or two.",
  },
  {
    icon: UserX,
    title: "No account",
    body: "No sign-up, no email, no watermark on your results. Open a tool and use it.",
  },
  {
    icon: WifiOff,
    title: "Works offline",
    body: "After the first visit Krea opens without internet. Switch on airplane mode and try it.",
  },
];

/** Home: hero and the Stage on top, then why Krea, then every tool. */
export default function HomePage() {
  return (
    <>
      <section className="px-4 pb-6 pt-8 text-center lg:px-8 lg:pb-8 lg:pt-12">
        <KineticTitle
          text="Drop a file. Make your move."
          className="mx-auto max-w-4xl text-[2.6rem] font-semibold leading-[1.02] tracking-tight text-fg sm:text-6xl lg:text-7xl"
        />
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-muted">
          Compress, convert, sign and protect files without uploading them. <span className="text-fg">Your files never leave your device.</span>
        </p>
      </section>

      <Workspace />

      <section aria-labelledby="why-heading" className="mx-auto max-w-7xl px-4 pt-12 lg:px-8 lg:pt-16">
        <h2 id="why-heading" className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
          Why Krea
        </h2>
        <ul className="mt-8 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {reasons.map(({ icon: Icon, title, body }) => (
            <li key={title}>
              <Icon aria-hidden className="size-6 text-accent" strokeWidth={1.75} />
              <h3 className="mt-3 text-lg font-semibold text-fg">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-muted">
          <Link href="/how-it-works" className="text-accent underline">
            How it works
          </Link>{" "}
          ·{" "}
          <Link href="/privacy" className="text-accent underline">
            Exactly what is and is not sent
          </Link>
        </p>
      </section>

      <section id="tools" aria-labelledby="browse-heading" className="mx-auto max-w-7xl px-4 py-12 lg:px-8 lg:py-16">
        <h2 id="browse-heading" className="mb-6 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
          Browse tools
        </h2>
        <ToolBrowser />
      </section>
    </>
  );
}
