import type { Metadata } from "next";
import { IBM_Plex_Mono, Jost, Teko } from "next/font/google";
import { SiteHeader } from "@/components/common/site-header";
import { FantasyAuthProvider } from "@/components/providers/fantasy-auth-provider";
import { FantasyDataProvider } from "@/components/providers/fantasy-data-provider";
import { siteConfig } from "@/config/site";
import "./globals.css";

const headingFont = Teko({
  variable: "--font-teko",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const bodyFont = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const monoFont = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: siteConfig.name,
  description: siteConfig.description,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className={`${headingFont.variable} ${bodyFont.variable} ${monoFont.variable}`}>
        <FantasyDataProvider>
          <FantasyAuthProvider>
            <div className="min-h-screen">
              <SiteHeader />
              {children}
            </div>
          </FantasyAuthProvider>
        </FantasyDataProvider>
      </body>
    </html>
  );
}
