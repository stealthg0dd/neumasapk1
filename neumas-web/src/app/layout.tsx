import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ErrorBoundary } from "@/components/error-boundary";
import { PWARegistration } from "@/components/pwa-registration";
import { getCanonicalAppUrl } from "@/lib/app-url";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-neumas-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-neumas-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getCanonicalAppUrl()),
  title: {
    default: "Neumas — Your Grocery Autopilot",
    template: "%s | Neumas",
  },
  description:
    "Neumas predicts what you'll run out of before you do. AI-powered pantry scanning, stockout prediction, and smart shopping lists for households in Singapore, Malaysia, and Southeast Asia.",
  keywords: [
    "grocery autopilot",
    "pantry AI",
    "AI shopping list",
    "stockout prediction",
    "grocery app Singapore",
    "pantry management",
    "food waste reduction",
    "smart grocery planner",
    "PDPA compliant grocery app",
    "household AI assistant",
    "Malaysia grocery app",
    "grocery app SEA",
    "Neumas",
  ],
  openGraph: {
    type: "website",
    siteName: "Neumas",
    title: "Neumas — Your Grocery Autopilot",
    description:
      "AI predicts what you'll run out of before you do. Smart pantry scanning + one-tap reorder for households.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Neumas grocery autopilot" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Neumas — Your Grocery Autopilot",
    description: "Scan your pantry. Get AI predictions. Never run out.",
    images: ["/twitter-image"],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Neumas",
  },
};

export const viewport: Viewport = {
  themeColor: "#0066FF",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plusJakarta.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ErrorBoundary>
          <Providers>
            <PWARegistration />
            {children}
          </Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}
