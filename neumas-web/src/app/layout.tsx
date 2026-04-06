import type { Metadata } from "next";
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ErrorBoundary } from "@/components/error-boundary";

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
  title: "Neumas — Intelligent Inventory Management",
  description: "AI-powered inventory management for hospitality. Scan receipts, predict stockouts, auto-generate shopping lists.",
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
          <Providers>{children}</Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}
