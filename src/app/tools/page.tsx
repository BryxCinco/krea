import type { Metadata } from "next";
import Link from "next/link";
import { ToolBrowser } from "@/components/ui/tool-browser";

const DESCRIPTION =
  "All 64 Krea tools in one place: English-Tagalog translator, image compressor, HEIC and SVG converters, image to SVG tracing, background remover, ID photo maker, EXIF remover, image annotator, blur and redact, document scanner, PDF merge, compress, crop, flatten, sign, protect, page numbers, form filler, annotator and true redaction, TXT, CSV, Excel and ZIP to PDF, PDF to Word, compare PDFs, OCR, resume builder, invoice generator, quotations and receipts, QR and barcodes, passwords, PH pay, final pay, freelancer tax and loan amortization calculators, a signature extractor, an audio trimmer, and video tools to compress, trim, crop, watermark and convert videos, extract MP3 audio and save frames. All run on your device.";

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
