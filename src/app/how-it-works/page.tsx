import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage, ContentSection } from "@/components/ui/content-page";

const DESCRIPTION =
  "How Krea processes images, PDFs and documents entirely in your browser with Web Workers and WebAssembly, why nothing is uploaded, and what the limits are.";

export const metadata: Metadata = {
  title: "How it works",
  description: DESCRIPTION,
  alternates: { canonical: "/how-it-works" },
  openGraph: { url: "/how-it-works", title: "How Krea works: local-first file processing", description: DESCRIPTION },
};

const steps = [
  {
    title: "The app loads once",
    body: "Your browser downloads Krea's pages and code from this site, like any website. After the first visit they are cached, so Krea opens even without internet.",
  },
  {
    title: "You open a file, not upload it",
    body: "When you drop or pick a file, the browser gives the page read access to it. The file is held in this tab's memory; there is no upload step and no server to send it to.",
  },
  {
    title: "The work happens on your device",
    body: "Each tool runs in a Web Worker, a background thread in your browser, so the page stays responsive and Cancel can stop a job instantly. Images are processed with the browser's own canvas. PDFs use pdf-lib, pdf.js and qpdf; OCR uses Tesseract; background removal runs an AI model with ONNX Runtime. All of these are WebAssembly or JavaScript engines running locally.",
  },
  {
    title: "The result is saved straight to your device",
    body: "The finished file is created in memory and handed to your browser's download. Wipe session or closing the tab clears everything.",
  },
];

export default function HowItWorksPage() {
  return (
    <ContentPage
      eyebrow="How it works"
      title="Local-first: the browser does the work."
      intro={
        <p>
          Most online file tools send your file to a server, process it there and send it back. Krea skips the server. Your phone or computer is
          powerful enough to do the job, so it does.
        </p>
      }
    >
      <ol className="flex flex-col gap-6">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-5">
            <span className="font-mono text-2xl text-accent">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h2 className="text-xl font-semibold text-fg">{step.title}</h2>
              <p className="mt-1.5 leading-relaxed text-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <ContentSection id="offline" title="Offline">
        <p>
          A service worker keeps a copy of the app and the engines in your browser&apos;s cache. Once loaded, tools work in airplane mode. Big engines
          (OCR and the AI model) are cached the first time you use them, or all at once with Make offline-ready on the{" "}
          <Link href="/privacy#offline">privacy page</Link>.
        </p>
      </ContentSection>

      <ContentSection id="limits" title="Honest limits">
        <ul>
          <li>Speed and file size depend on your device. Very large photos (over about 80 megapixels) are refused to avoid running out of memory.</li>
          <li>The first use of OCR or background removal waits for the engine to download (16 MB and about 56 MB).</li>
          <li>The Invoice Generator makes its PDF directly on your device. Save as PDF in the other document editors uses your browser&apos;s print dialog. Some in-app browsers (inside chat or social apps) block it; open Krea in your normal browser.</li>
          <li>Compress PDF only recompresses photos inside the PDF and optimizes its structure. It never turns pages into pictures, so some PDFs barely shrink.</li>
        </ul>
      </ContentSection>
    </ContentPage>
  );
}
