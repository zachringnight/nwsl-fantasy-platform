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
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
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
                <SiteHeader />
                <div className="flex-1">{children}</div>
                <SiteFooter />
              </div>
            </AnalyticsProvider>
          </FantasyAuthProvider>
        </FantasyDataProvider>
      </body>
    </html>
  );
}
