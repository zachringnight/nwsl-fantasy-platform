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
                className="text-sm text-muted transition hover:text-brand-strong"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-6 flex flex-col gap-2 border-t border-line pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {siteConfig.copyrightYear} {siteConfig.owner}. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/privacy" className="transition hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="transition hover:text-foreground">
              Terms
            </Link>
            <Link href="/contact" className="transition hover:text-foreground">
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
