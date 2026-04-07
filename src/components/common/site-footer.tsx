import Link from "next/link";
import { siteConfig } from "@/config/site";

const footerLinks = [
  { href: "/rules", label: "Rules" },
  { href: "/help", label: "Help" },
  { href: "/players", label: "Players" },
  { href: "/leagues", label: "Leagues" },
];

export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-line bg-panel-strong/60 px-4 py-8 backdrop-blur-xl sm:px-6">
      <div className="page-shell">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="font-display text-2xl uppercase leading-none tracking-[0.02em] text-foreground">
              {siteConfig.shortName}
            </p>
            <p className="text-sm text-muted">{siteConfig.description}</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-4">
            {footerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md text-sm text-muted transition hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55 focus-visible:ring-offset-2 focus-visible:ring-offset-night"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-6 flex flex-col gap-2 border-t border-line pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {siteConfig.copyrightYear} {siteConfig.owner}. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/privacy" className="rounded-md transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55">
              Privacy
            </Link>
            <Link href="/terms" className="rounded-md transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55">
              Terms
            </Link>
            <Link href="/contact" className="rounded-md transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/55">
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
