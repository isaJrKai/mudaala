import type { Metadata, Viewport } from "next";
import { Fraunces } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { siteUrl } from "@/lib/site";
import { copy } from "@/lib/copy";

// Body type is ONE sans: Inter where a device has it, system-ui otherwise
// (see globals.css). The display serif is kept ONLY for the logo wordmark
// and shop names - a market shop's name on a painted signboard is serif;
// nothing else in the app dresses up.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Anchors every relative canonical/OG URL to one origin (ad pages depend on it).
  metadataBase: new URL(siteUrl),
  title: copy.app.metaTitle,
  description: copy.app.metaDescription,
  keywords: ["Mudaala", "marketplace", "local commerce", "Uganda", "Kampala", "offer", "request"],
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/logo.svg",
    apple: "/logo.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Mobile-first, and phones have curves: viewport-fit=cover lets the page
  // paint edge to edge, and the sticky header pads itself with the safe-area
  // inset so a notch or a curved corner never eats the brand bar. In normal
  // browsers the inset is 0, so this is invisible there - it only earns
  // its keep where the hardware actually curves (standalone webviews, PWA).
  viewportFit: "cover",
  themeColor: "#1d4a35",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${fraunces.variable} antialiased bg-background text-foreground`}>
        {children}
        <PwaInstallPrompt />
        <Toaster />
      </body>
    </html>
  );
}
