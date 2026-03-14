import type { Metadata } from "next";
import { SiteHeader } from "@/components/common/site-header";
import { SiteFooter } from "@/components/common/site-footer";
import { AnalyticsProvider } from "@/components/providers/analytics-provider";
import { FantasyAuthProvider } from "@/components/providers/fantasy-auth-provider";
import { FantasyDataProvider } from "@/components/providers/fantasy-data-provider";
import { siteConfig } from "@/config/site";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  openGraph: {
    title: siteConfig.name,
    description: siteConfig.description,
    siteName: siteConfig.name,
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: siteConfig.name }],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <FantasyDataProvider>
          <FantasyAuthProvider>
            <AnalyticsProvider>
              <div className="flex min-h-screen flex-col">
                <a
                  href="#main-content"
                  className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-[100] focus-visible:rounded-full focus-visible:bg-brand focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-semibold focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55"
                >
                  Skip to main content
                </a>
                <SiteHeader />
                <div id="main-content" className="page-enter flex-1">{children}</div>
                <SiteFooter />
              </div>
            </AnalyticsProvider>
          </FantasyAuthProvider>
        </FantasyDataProvider>
      </body>
    </html>
  );
}
