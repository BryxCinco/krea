/**
 * Open Graph / social preview images, rendered at build time with next/og.
 * Brand colours are fixed here on purpose: the image is a standalone picture,
 * not a themed screen.
 */
import { ImageResponse } from "next/og";
import { K_HEIGHT, K_PIXELS, K_WIDTH, SPARKLES } from "@/lib/logo";

function LogoTile({ size }: { size: number }) {
  const cell = size / 17;
  const w = (K_WIDTH + 0.5) * cell, h = (K_HEIGHT + 0.5) * cell;
  const ox = (size - w) / 2, oy = (size - h) / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <rect width={size} height={size} rx={size * 0.22} fill="#c6ff3d" />
      {K_PIXELS.map(([c, r]) => (
        <rect key={`${c}-${r}`} x={ox + c * cell} y={oy + r * cell} width={cell} height={cell} fill="#0a0b08" />
      ))}
      {SPARKLES.map(([x, y, sw, o], i) => (
        <rect key={i} x={ox + (x * cell) / 2} y={oy + (y * cell) / 2} width={(sw * cell) / 2} height={cell / 2} fill="#ffffff" opacity={o} />
      ))}
    </svg>
  );
}

export const OG_SIZE = { width: 1200, height: 630 };

export function ogImage({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0a0b08", color: "#eef1e6", padding: "64px 72px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <LogoTile size={72} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 40, fontWeight: 800 }}>krea</div>
            <div style={{ fontSize: 18, letterSpacing: 4, color: "#a4aa96" }}>KINETIC RENDER ENGINE APP</div>
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
