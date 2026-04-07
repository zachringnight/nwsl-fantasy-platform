import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MessageCircle, FileText } from "lucide-react";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Contact",
};

const channels = [
  {
    icon: Mail,
    title: "Email support",
    description: "For account issues, scoring questions, or general feedback.",
    action: siteConfig.supportEmail,
    href: `mailto:${siteConfig.supportEmail}`,
    linkLabel: "Send email",
  },
  {
    icon: MessageCircle,
    title: "In-app help",
    description: "Quick answers to the most common questions about leagues, drafts, and scoring.",
    href: "/help",
    linkLabel: "Open help center",
  },
  {
    icon: FileText,
    title: "Rules and scoring",
    description: "Full breakdown of formats, point values, and how every stat is scored.",
    href: "/rules",
    linkLabel: "View rules",
  },
];

export default function ContactPage() {
  return (
    <AppShell
      eyebrow="Contact"
      title="Get in touch"
      description="Questions, feedback, or issues — here's how to reach us."
    >
      <section className="grid gap-5 lg:grid-cols-3">
        {channels.map((channel) => (
          <SurfaceCard
            key={channel.title}
            eyebrow="Support"
            title={channel.title}
            description={channel.description}
          >
            <div className="flex items-center gap-3">
              <channel.icon className="size-5 text-brand-strong" />
              <Link
                href={channel.href}
                className="rounded-full border border-line bg-white/6 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-brand-strong/40 hover:text-brand-strong"
              >
                {channel.linkLabel}
              </Link>
            </div>
          </SurfaceCard>
        ))}
      </section>

      <SurfaceCard
        eyebrow="Response time"
        title="We typically reply within one business day"
        description="Most questions are answered the same day during the season. Off-season response times may be slightly longer."
        tone="brand"
      >
        <p className="text-sm text-white/72">
          For urgent account or security issues, include &ldquo;URGENT&rdquo; in your subject line.
        </p>
      </SurfaceCard>
    </AppShell>
  );
}
