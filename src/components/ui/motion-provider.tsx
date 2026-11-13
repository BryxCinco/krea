"use client";

import { MotionConfig } from "framer-motion";

/** Makes every Framer Motion animation honour the user's prefers-reduced-motion setting. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
