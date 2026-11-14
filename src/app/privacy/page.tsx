import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage, ContentSection } from "@/components/ui/content-page";
import { OfflineReady } from "@/components/ui/offline-ready";

const DESCRIPTION =
  "Exactly what Krea sends and does not send. Your files, text, signatures and passwords never leave your device. No analytics, no accounts, no third-party requests.";

export const metadata: Metadata = {
  title: "Privacy",
  description: DESCRIPTION,
  alternates: { canonical: "/privacy" },
  openGraph: { url: "/privacy", title: "Krea privacy: what is and is not sent", description: DESCRIPTION },
};

const LAST_REVIEWED = "November 14, 2026";

export default function PrivacyPage() {
  return (
    <ContentPage
      eyebrow="Privacy"
      title="Your files never leave your device."
      intro={
        <p>
          Krea is a website that works like an app installed on your phone or computer. Every tool runs inside your browser tab. There is no
          Krea server that receives files, no account and no database. This page lists exactly what moves over the network and what stays
          with you.
        </p>
      }
    >
      <ContentSection id="never-sent" title="Never sent anywhere">
        <ul>
          <li>Your files (photos, PDFs, documents) and their file names.</li>
          <li>Anything you type: Markdown, resume and invoice details, QR code contents, Wi-Fi passwords, salary figures.</li>
          <li>Signatures you draw, type or upload.</li>
          <li>Passwords for Protect / Unlock PDF. They are used inside the browser to encrypt or decrypt and then forgotten.</li>
          <li>Results you create. They are made in memory and saved straight to your device when you press Download.</li>
        </ul>
        <p>
          You can check this yourself: load a tool, switch on airplane mode, and use it. Or open your browser&apos;s developer tools, go to the
          Network tab, and watch: processing a file makes no requests.
        </p>
      </ContentSection>

      <ContentSection id="downloads" title="What your browser downloads, and from where">
        <p>
          Like any website, your browser downloads Krea&apos;s pages, scripts and fonts. Some tools also need an engine, downloaded the first time
          you use that tool. <strong>All of it comes from this same site.</strong> Krea makes no requests to any other company.
        </p>
        <ul>
          <li>
            <strong>PDF engines</strong> (pdf.js, qpdf): about 6 MB, used to read, render and encrypt PDFs.
          </li>
          <li>
            <strong>OCR</strong> (Tesseract) with English and Filipino language data: about 16 MB, used by OCR: Image and PDF to Text.
          </li>
          <li>
            <strong>Background-removal AI model</strong> (IMG.LY, ISNet): about 56 MB for the Fast model plus runtime, or 88 MB more for
            Detailed. Used by Background Remover and ID Photo Maker. Earlier versions of Krea loaded this from the publisher&apos;s CDN. It is
            now served from this site, so the publisher receives nothing from you.
          </li>
          <li>
            <strong>Fonts</strong> are bundled with the site at build time, not loaded from a font service.
          </li>
        </ul>
        <p>
          These are one-way downloads. Nothing about your files is attached to them. As with any website, the hosting provider that serves these
          files can see standard request information such as your IP address, the address requested and your browser type, in its server logs.
          Krea does not add analytics, cookies or trackers on top of that.
        </p>
        <p>
          The PH Take-Home Pay Calculator links to SSS, PhilHealth, Pag-IBIG and BIR. Those sites are only contacted if you click a link.
        </p>
      </ContentSection>

      <ContentSection id="stored" title="What is stored on your device">
        <ul>
          <li>
            <strong>Files on the Stage and your results</strong> live only in this tab&apos;s memory. Wipe session clears them at once; closing the tab
            does too.
          </li>
          <li>
            <strong>Saved in local storage</strong>, so you find them again: your theme choice, saved Render Chains, the Markdown document, resume
            and invoice data (including an invoice logo). Each editor has a Clear button. Passwords are never saved, and the QR and pay
            calculators save nothing.
          </li>
          <li>
            <strong>Cached for offline use</strong>: the app itself and the engines above, in your browser&apos;s cache. Tesseract may also keep its
            language data in your browser&apos;s IndexedDB.
          </li>
        </ul>
        <p>To remove everything, clear this site&apos;s data in your browser settings (often under Site settings, then Storage or Clear data).</p>
      </ContentSection>

      <ContentSection id="offline" title="Make Krea offline-ready">
        <p>
          Normally each engine downloads the first time you use its tool. To use every tool without internet, for example before a trip or in an
          area with weak signal, download them all now.
        </p>
        <OfflineReady />
      </ContentSection>

      <ContentSection title="Questions">
        <p>
          See <Link href="/how-it-works">how Krea works</Link> for the technical details, or <Link href="/about">about Krea</Link> for the libraries it
          is built on.
        </p>
        <p className="font-mono text-sm">Last reviewed: {LAST_REVIEWED}</p>
      </ContentSection>
    </ContentPage>
  );
}
