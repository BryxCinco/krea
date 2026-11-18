import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage, ContentSection } from "@/components/ui/content-page";

const DESCRIPTION = "Krea is a free, local-first toolkit for images, PDFs and documents, built for everyday paperwork in the Philippines.";

export const metadata: Metadata = {
  title: "About",
  description: DESCRIPTION,
  alternates: { canonical: "/about" },
  openGraph: { url: "/about", title: "About Krea", description: DESCRIPTION },
};

/** Open-source projects Krea is built on, with their licenses. */
const CREDITS: [string, string, string][] = [
  ["pdf-lib", "MIT", "Creating and editing PDFs"],
  ["PDF.js (Mozilla)", "Apache-2.0", "Rendering PDF pages"],
  ["qpdf", "Apache-2.0", "PDF encryption (compiled to WebAssembly)"],
  ["Tesseract.js and Tesseract", "Apache-2.0", "OCR in English and Filipino"],
  ["@imgly/background-removal", "AGPL-3.0", "AI background removal (ISNet model on ONNX Runtime)"],
  ["heic-to (libheif)", "LGPL-3.0", "Opening iPhone HEIC photos"],
  ["marked and DOMPurify", "MIT; MPL-2.0 or Apache-2.0", "Markdown preview"],
  ["node-qrcode", "MIT", "QR codes"],
  ["JSZip", "MIT or GPL-3.0", "ZIP downloads"],
  ["JsBarcode", "MIT", "Barcodes"],
  ["barcode-detector and zxing-wasm (ZXing-C++)", "MIT; Apache-2.0", "Reading QR codes and barcodes"],
  ["Mediabunny", "MPL-2.0", "Reading, trimming and re-encoding video with the browser's encoder"],
  ["gifenc", "MIT", "Making GIFs"],
  ["SecLists common password list", "MIT", "Spotting common passwords in the strength checker"],
  ["Next.js, React, Framer Motion", "MIT", "The app itself"],
  ["Lucide", "ISC", "Icons"],
];

export default function AboutPage() {
  return (
    <ContentPage
      eyebrow="About"
      title="Everyday file tools, minus the upload."
      intro={
        <p>
          Krea started from a simple annoyance: to shrink a photo for a government portal or merge two PDFs, most sites ask you to upload personal
          documents to a server you know nothing about. Your browser can do that work itself. Krea is built on that idea.
        </p>
      }
    >
      <ContentSection title="What Krea is">
        <p>
          53 tools for photos, PDFs, documents, video and audio, made with Philippine paperwork in mind: 2x2 and passport photos, 200 KB upload limits, short and
          long bond paper, peso invoices, and a take-home pay calculator for SSS, PhilHealth, Pag-IBIG and withholding tax.
        </p>
        <p>
          Drop a file on the <Link href="/">Stage</Link> and Krea shows what you can do with it, or chain several steps into a Render Chain you can
          reuse. <Link href="/tools">Browse all tools</Link>.
        </p>
      </ContentSection>

      <ContentSection title="Principles">
        <ul>
          <li>Local-first: files are processed on your device and never uploaded.</li>
          <li>No accounts, no paywalls inside tools, no dark patterns.</li>
          <li>Honest labels: when a tool cannot do something well, it says so instead of pretending.</li>
          <li>Works offline after the first visit.</li>
        </ul>
      </ContentSection>

      <ContentSection title="Built on open source">
        <p>Krea stands on these projects. Thank you to their authors.</p>
        <ul className="!list-none !pl-0">
          {CREDITS.map(([name, license, use]) => (
            <li key={name} className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-line py-2">
              <span>
                <strong>{name}</strong>: {use}
              </span>
              <span className="font-mono text-xs">{license}</span>
            </li>
          ))}
        </ul>
        <p>
          Passphrases use the{" "}
          <a href="https://www.eff.org/deeplinks/2016/07/new-wordlists-random-passphrases" rel="noopener noreferrer" target="_blank">
            EFF Large Wordlist
          </a>{" "}
          by the Electronic Frontier Foundation, licensed under{" "}
          <a href="https://creativecommons.org/licenses/by/3.0/us/" rel="noopener noreferrer" target="_blank">
            CC BY 3.0 US
          </a>
          . Krea uses its 7,776 words unchanged, without the dice numbers.
        </p>
      </ContentSection>
    </ContentPage>
  );
}
