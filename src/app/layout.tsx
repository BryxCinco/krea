import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import { CommandPalette } from "@/components/palette/command-palette";
import { AppHeader } from "@/components/ui/app-header";
import { MotionProvider } from "@/components/ui/motion-provider";
import { ServiceWorker } from "@/components/ui/service-worker";
import { SessionProvider } from "@/lib/session";
import "./globals.css";

// Fonts are downloaded at build time and self-hosted, so no request leaves the device at runtime.
const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"], display: "swap" });
const code = JetBrains_Mono({ variable: "--font-code", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Krea: private image and PDF tools that run on your device",
    template: "%s | Krea",
  },
  description:
    "Krea is a local-first file toolkit. Compress, resize and convert images, merge and split PDFs, make ID photos. Everything runs in your browser, nothing is uploaded.",
  applicationName: "Krea",
  appleWebApp: { capable: true, title: "Krea", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#0a0b08",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${code.variable} antialiased`}>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-md focus:bg-lime focus:px-4 focus:py-2 focus:text-ink"
        >
          Skip to content
        </a>
        <MotionProvider>
          <SessionProvider>
            <AppHeader />
            <main id="main">{children}</main>
            <CommandPalette />
          </SessionProvider>
        </MotionProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
