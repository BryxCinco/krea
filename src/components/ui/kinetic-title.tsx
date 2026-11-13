"use client";

import { useEffect, useRef } from "react";

/** Radius (px) inside which a letter reacts to the pointer. */
const REACH = 180;

/**
 * Headline whose letters lean toward the cursor or finger: nearby letters get
 * heavier, lift and take the accent colour. Styles are written straight to the
 * DOM inside one animation frame, so React never re-renders during movement.
 * Disabled under prefers-reduced-motion.
 */
export function KineticTitle({ text, className = "" }: { text: string; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const letters = Array.from(root.querySelectorAll<HTMLElement>(".kinetic-letter"));
    let frame = 0;

    const apply = (x: number | null, y: number | null) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        for (const letter of letters) {
          let pull = 0;
          if (x !== null && y !== null) {
            const box = letter.getBoundingClientRect();
            const distance = Math.hypot(x - (box.left + box.width / 2), y - (box.top + box.height / 2));
            pull = Math.max(0, 1 - distance / REACH);
          }
          letter.style.transform = pull ? `translateY(${-10 * pull}px) scale(${1 + 0.12 * pull})` : "";
          letter.style.fontVariationSettings = `"wght" ${Math.round(600 + 200 * pull)}`;
          letter.style.color = pull > 0.45 ? "var(--color-lime)" : "";
        }
      });
    };

    const onMove = (event: PointerEvent) => apply(event.clientX, event.clientY);
    const onRest = () => apply(null, null);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onRest, { passive: true });
    document.documentElement.addEventListener("pointerleave", onRest);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onRest);
      document.documentElement.removeEventListener("pointerleave", onRest);
    };
  }, []);

  return (
    <h1 ref={ref} aria-label={text} className={className}>
      {text.split(" ").map((word, w) => (
        // Words stay unbreakable so letters never wrap mid-word.
        <span key={w} aria-hidden className="inline-block whitespace-nowrap">
          {[...word].map((letter, i) => (
            <span key={i} className="kinetic-letter">
              {letter}
            </span>
          ))}
          {" "}
        </span>
      ))}
    </h1>
  );
}
