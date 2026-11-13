"use client";

import { useEffect, useState } from "react";
import { CropBox, type CropRect } from "@/components/ui/crop-box";
import { openPdf, renderPage } from "@/lib/pdf-render";
import type { StageFile } from "@/lib/session";

interface Rendered {
  key: string;
  url?: string;
  width: number;
  height: number;
  pages: number;
  error?: string;
}

/**
 * Shows one PDF page with a draggable, resizable box on it: where the signature
 * goes. The box keeps the signature's proportions so what you see is what lands.
 */
export function PlacementEditor({
  file,
  page,
  image,
  value,
  onChange,
}: {
  file: StageFile;
  /** 1-based page number. */
  page: number;
  /** Signature as a data URL ("" when none yet). */
  image: string;
  value: CropRect;
  onChange: (rect: CropRect) => void;
}) {
  const key = `${file.id}:${page}`;
  const [rendered, setRendered] = useState<Rendered | null>(null);
  const [ratio, setRatio] = useState<{ src: string; value: number } | null>(null);

  // Render the chosen page (results are tagged with their key, so a stale render is never shown).
  useEffect(() => {
    let cancelled = false;
    let url: string | undefined;
    (async () => {
      try {
        const { pdf, close } = await openPdf({ name: file.name, type: file.mime, blob: file.file });
        try {
          const index = Math.min(Math.max(1, Math.round(page) || 1), pdf.numPages) - 1;
          const { blob, width, height } = await renderPage(pdf, index, 1.5, "image/png");
          if (cancelled) return;
          url = URL.createObjectURL(blob);
          setRendered({ key, url, width, height, pages: pdf.numPages });
        } finally {
          await close();
        }
      } catch (error) {
        if (!cancelled) setRendered({ key, width: 0, height: 0, pages: 0, error: (error as Error).message });
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, page, key]);

  // Natural proportions of the signature image.
  useEffect(() => {
    if (!image) return;
    const element = new Image();
    element.onload = () => setRatio({ src: image, value: element.naturalWidth / element.naturalHeight });
    element.src = image;
  }, [image]);

  const current = rendered?.key === key ? rendered : null;
  if (current?.error) return <p className="text-sm text-signal">{current.error}</p>;
  if (!current?.url) {
    return <div aria-label="Rendering page" className="skeleton aspect-[1/1.414] w-full max-w-sm rounded-md" />;
  }

  return (
    <figure className="flex flex-col items-center gap-2">
      <CropBox
        src={current.url}
        alt={`Page ${page} of ${file.name}`}
        mode="place"
        overlaySrc={image || undefined}
        aspect={image && ratio?.src === image ? ratio.value : null}
        imageWidth={current.width}
        imageHeight={current.height}
        value={value}
        label="Signature position"
        onChange={onChange}
      />
      <figcaption className="font-mono text-xs text-muted">
        Page {Math.min(Math.max(1, Math.round(page) || 1), current.pages)} of {current.pages}
        {!image && " · gumawa muna ng signature sa settings"}
      </figcaption>
    </figure>
  );
}
