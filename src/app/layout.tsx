import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { siteUrl } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// The display serif — shop names, the printed poster, brand moments.
// A market shop's name on a painted signboard is serif; Mudaala should read
// the same way. Body text stays Geist: serif is for display sizes only.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Anchors every relative canonical/OG URL to one origin (ad pages depend on it).
  metadataBase: new URL(siteUrl),
  title: "Mudaala — Trade locally, discover more",
  description:
    "Mudaala connects local buyers and sellers: find OFFERs and REQUESTs near you, compare prices and quantities, and contact sellers or buyers directly on WhatsApp or by phone.",
  keywords: ["Mudaala", "marketplace", "local commerce", "Uganda", "Kampala", "offer", "request"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1d4a35",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
