"use client";

import { useEffect, useRef, useState } from "react";

/** A4 width in CSS pixels at 96 DPI. Letter is close enough (816px) to use the same scale. */
const PAGE_WIDTH = 794;

/**
 * Live preview of a generated document. The HTML is written into a same-origin
 * iframe, so the document's own CSS is isolated from the app and the preview is
 * exactly what gets printed. It is scaled down to fit the column.
 */
export function DocPreview({ html, title }: { html: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(1123);

  // Scale to the available width.
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setScale(Math.min(1, entry.contentRect.width / PAGE_WIDTH)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Rewrite the document (debounced) and measure its height.
  useEffect(() => {
    const timer = setTimeout(() => {
      const doc = frame.current?.contentDocument;
      if (!doc) return;
      const scrollY = frame.current?.contentWindow?.scrollY ?? 0;
      doc.open();
      doc.write(html.replace("@media screen { body { padding: 32px; } }", "@media screen { body { padding: 40px 48px; } }"));
      doc.close();
      frame.current?.contentWindow?.scrollTo(0, scrollY);
      const measure = () => setHeight(Math.max(1123, doc.documentElement.scrollHeight));
      measure();
      Array.from(doc.images).forEach((image) => image.addEventListener("load", measure, { once: true }));
    }, 150);
    return () => clearTimeout(timer);
  }, [html]);

  return (
    <div ref={box} className="w-full">
      <div className="mx-auto overflow-hidden rounded-md border border-line bg-paper shadow-lg" style={{ width: PAGE_WIDTH * scale, height: height * scale }}>
        <iframe
          ref={frame}
          title={title}
          className="origin-top-left border-0 bg-paper"
          style={{ width: PAGE_WIDTH, height, transform: `scale(${scale})` }}
        />
      </div>
    </div>
  );
}
