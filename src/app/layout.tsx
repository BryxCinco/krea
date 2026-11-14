import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import { CommandPalette } from "@/components/palette/command-palette";
import { AppHeader } from "@/components/ui/app-header";
import { MotionProvider } from "@/components/ui/motion-provider";
import { ServiceWorker } from "@/components/ui/service-worker";
import { SessionProvider } from "@/lib/session";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { themeScript } from "@/lib/theme";
import "./globals.css";

// Fonts are downloaded at build time and self-hosted, so no request leaves the device at runtime.
const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"], display: "swap" });
const code = JetBrains_Mono({ variable: "--font-code", subsets: ["latin"], display: "swap" });

const DESCRIPTION =
  "25 free tools for images, PDFs and documents that run entirely in your browser: compress, convert, sign and protect files, make ID photos, resumes, invoices and QR codes. No uploads, no account, works offline.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Krea: private image, PDF and document tools that run on your device",
    template: "%s | Krea",
  },
  description: DESCRIPTION,
  // Canonical URLs are set per page: a canonical here would be inherited by pages that lack their own.
  openGraph: { type: "website", siteName: SITE_NAME, locale: "en_PH", description: DESCRIPTION },
  twitter: { card: "summary_large_image" },
  applicationName: "Krea",
  appleWebApp: { capable: true, title: "Krea", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  // Default (dark) chrome colour; lib/theme.ts updates it when the theme changes.
  themeColor: "#0a0b08",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme is corrected by the inline script before first paint, hence suppressHydrationWarning.
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${display.variable} ${code.variable} antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-80 focus:rounded-md focus:bg-lime focus:px-4 focus:py-2 focus:text-on-lime"
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
