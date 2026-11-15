import type { Metadata } from "next";
import Link from "next/link";
import { ToolBrowser } from "@/components/ui/tool-browser";

const DESCRIPTION =
  "All 35 Krea tools in one place: image compressor, background remover, ID photo maker, EXIF remover, blur and redact, document scanner, PDF merge, compress, sign, protect and page numbers, OCR, resume builder, invoice generator, QR and barcodes, passwords, PH pay calculators and a video compressor. All run on your device.";

export const metadata: Metadata = {
  title: "All Tools",
  description: DESCRIPTION,
  alternates: { canonical: "/tools" },
  openGraph: { url: "/tools", title: "All Krea tools", description: DESCRIPTION },
};

/** All Tools: the same card grid as the home page, for browsing and search engines. */
export default function AllToolsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 lg:px-8 lg:py-14">
      <h1 className="text-4xl font-semibold tracking-tight text-fg sm:text-6xl">All tools</h1>
      <p className="mb-8 mt-3 max-w-xl leading-relaxed text-muted">
        Mas mabilis sa{" "}
        <Link href="/" className="text-accent underline">
          Stage
        </Link>
        : drop a file and Krea shows the Moves that fit. Or pick a tool here.
      </p>
      <ToolBrowser />
    </div>
  );
}
