import type { Metadata } from "next";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Terms of Service",
};

const sections = [
  {
    title: "Acceptance of terms",
    content:
      "By creating an account or using NWSL Fantasy, you agree to these terms. If you do not agree, do not use the platform. We may update these terms — continued use after changes means you accept the new terms.",
  },
  {
    title: "Eligibility",
    content:
      "You must be at least 18 years old to create an account. By signing up, you confirm that you meet this requirement and that the information you provide is accurate.",
  },
  {
    title: "Account responsibilities",
    content:
      "You are responsible for keeping your login credentials secure. Do not share your account. You are responsible for all activity on your account. Notify us immediately if you believe your account has been compromised.",
  },
  {
    title: "Fair play",
    content:
      "One account per person. Multi-accounting, collusion, and any form of manipulation — including coordinated trades, tanking, or exploiting scoring bugs — will result in account suspension. Play fair and keep it fun for everyone.",
  },
  {
    title: "Intellectual property",
    content:
      "All content, design, and code on the platform are owned by NWSL Fantasy or its licensors. Player names, team names, and league data are used under license. You may not copy, modify, or distribute platform content without written permission.",
  },
  {
    title: "Service availability",
    content:
      "We aim for high uptime but cannot guarantee uninterrupted service. We may perform maintenance, push updates, or temporarily disable features. We are not liable for losses resulting from downtime or service interruptions.",
  },
  {
    title: "Limitation of liability",
    content:
      "NWSL Fantasy is provided as-is. We do our best to keep scoring accurate and the platform running smoothly, but we are not liable for errors in scoring data, player information, or fantasy results beyond correcting them when discovered.",
  },
  {
    title: "Termination",
    content:
      "We may suspend or terminate accounts that violate these terms. You may delete your account at any time from the Settings page. Upon termination, your access to leagues, rosters, and contest history will end.",
  },
];

export default function TermsPage() {
  return (
    <AppShell
      eyebrow="Terms"
      title="Rules of the platform"
      description="The terms that govern your use of NWSL Fantasy."
    >
      <SurfaceCard
        eyebrow="Agreement"
        title="Terms of service"
        description={`Last updated: March ${siteConfig.copyrightYear}`}
      >
        <div className="space-y-4">
          {sections.map((section) => (
            <div
              key={section.title}
              className="rounded-[1.2rem] border border-line bg-panel-soft px-4 py-3"
            >
              <p className="font-semibold text-foreground">{section.title}</p>
              <p className="mt-2 text-sm leading-6 text-muted">{section.content}</p>
            </div>
          ))}
        </div>
      </SurfaceCard>
    </AppShell>
  );
}
