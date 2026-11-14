/**
 * Open Graph / social preview images, rendered at build time with next/og.
 * Brand colours are fixed here on purpose: the image is a standalone picture,
 * not a themed screen.
 */
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

export function ogImage({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0a0b08", color: "#eef1e6", padding: "64px 72px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 72, height: 72, borderRadius: 16, background: "#c6ff3d", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48, fontWeight: 800, color: "#0a0b08" }}>K</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 40, fontWeight: 800 }}>krea</div>
            <div style={{ fontSize: 18, letterSpacing: 4, color: "#a4aa96" }}>KINETIC RENDER ENGINE</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 26, letterSpacing: 4, color: "#c6ff3d" }}>{eyebrow.toUpperCase()}</div>
          <div style={{ fontSize: title.length > 28 ? 64 : 80, fontWeight: 700, lineHeight: 1.05 }}>{title}</div>
          <div style={{ fontSize: 30, color: "#a4aa96", lineHeight: 1.35, maxWidth: 1000 }}>{subtitle}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 24, color: "#c6ff3d" }}>
          <div style={{ width: 14, height: 14, borderRadius: 7, background: "#ff6b3d" }} />
          100% on-device. Walang upload.
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
