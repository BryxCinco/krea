"use client";

/**
 * Loads the editor for a Text & Docs tool. Each editor is its own chunk and
 * renders on the client only (it reads localStorage on first render), so the
 * tool page itself stays light and fully static.
 */
import dynamic from "next/dynamic";

function EditorSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading editor" className="mx-auto grid max-w-7xl gap-6 border-y border-line px-4 py-6 lg:grid-cols-2 lg:px-8">
      <div className="skeleton h-[60vh] rounded-xl" />
      <div className="skeleton hidden h-[60vh] rounded-xl lg:block" />
    </div>
  );
}

const editors = {
  "markdown-editor": dynamic(() => import("./markdown-editor"), { ssr: false, loading: EditorSkeleton }),
  "resume-builder": dynamic(() => import("./resume-editor"), { ssr: false, loading: EditorSkeleton }),
  "invoice-generator": dynamic(() => import("./invoice-editor"), { ssr: false, loading: EditorSkeleton }),
  "qr-code-generator": dynamic(() => import("./qr-editor"), { ssr: false, loading: EditorSkeleton }),
  "signature-maker": dynamic(() => import("./signature-editor"), { ssr: false, loading: EditorSkeleton }),
  "text-toolkit": dynamic(() => import("./text-toolkit-editor"), { ssr: false, loading: EditorSkeleton }),
  "password-generator": dynamic(() => import("./password-editor"), { ssr: false, loading: EditorSkeleton }),
  "barcode-generator-scanner": dynamic(() => import("./barcode-editor"), { ssr: false, loading: EditorSkeleton }),
  "blur-redact": dynamic(() => import("./redact-editor"), { ssr: false, loading: EditorSkeleton }),
  "ph-take-home-pay-calculator": dynamic(() => import("./payroll-editor"), { ssr: false, loading: EditorSkeleton }),
  "ph-pay-calculators": dynamic(() => import("./ph-pay-editor"), { ssr: false, loading: EditorSkeleton }),
  "document-scanner": dynamic(() => import("./doc-scan-editor"), { ssr: false, loading: EditorSkeleton }),
  "video-compressor-gif": dynamic(() => import("./video-editor"), { ssr: false, loading: EditorSkeleton }),
  "video-trimmer": dynamic(() => import("./trim-editor"), { ssr: false, loading: EditorSkeleton }),
  "video-speed": dynamic(() => import("./speed-editor"), { ssr: false, loading: EditorSkeleton }),
  "video-crop-rotate": dynamic(() => import("./crop-video-editor"), { ssr: false, loading: EditorSkeleton }),
  "video-watermark": dynamic(() => import("./watermark-video-editor"), { ssr: false, loading: EditorSkeleton }),
  "video-to-mp3": dynamic(() => import("./audio-editor"), { ssr: false, loading: EditorSkeleton }),
  "video-converter": dynamic(() => import("./convert-video-editor"), { ssr: false, loading: EditorSkeleton }),
  "extract-frames": dynamic(() => import("./frames-editor"), { ssr: false, loading: EditorSkeleton }),
  "pdf-form-filler": dynamic(() => import("./form-filler-editor"), { ssr: false, loading: EditorSkeleton }),
  "pdf-annotator": dynamic(() => import("./annotate-editor"), { ssr: false, loading: EditorSkeleton }),
  "redact-pdf": dynamic(() => import("./redact-pdf-editor"), { ssr: false, loading: EditorSkeleton }),
} as const;

export function EditorHost({ slug }: { slug: string }) {
  const Editor = editors[slug as keyof typeof editors];
  return Editor ? <Editor /> : null;
}
