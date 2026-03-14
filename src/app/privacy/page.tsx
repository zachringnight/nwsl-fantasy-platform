import type { Metadata } from "next";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

const sections = [
  {
    title: "Information we collect",
    content:
      "We collect information you provide when creating an account, such as your email address, display name, and favorite NWSL club. We also collect usage data like lineup submissions, draft picks, and league activity to operate the platform.",
  },
  {
    title: "How we use your information",
    content:
      "Your information powers your fantasy experience — roster management, scoring, standings, and notifications. We use aggregated, anonymized data to improve the platform. We never sell your personal information to third parties.",
  },
  {
    title: "Data storage and security",
    content:
      "Account data is stored securely using industry-standard encryption. Passwords are hashed and never stored in plain text. We use secure connections (HTTPS) for all data transmission between your browser and our servers.",
  },
  {
    title: "Cookies and local storage",
    content:
      "We use essential cookies and local storage to keep you signed in and remember your preferences. We do not use third-party tracking cookies for advertising purposes.",
  },
  {
    title: "Your rights",
    content:
      "You can update or delete your account information at any time from the Settings page. If you delete your account, we remove your personal data from our active systems. Some anonymized, aggregated data may be retained for platform analytics.",
  },
  {
    title: "Changes to this policy",
    content:
      "We may update this privacy policy from time to time. When we make material changes, we will notify you through the platform or by email. Continued use of the platform after changes constitutes acceptance of the updated policy.",
  },
];

export default function PrivacyPage() {
  return (
    <AppShell
      eyebrow="Privacy"
      title="How we handle your data"
      description="Your privacy matters. Here's what we collect, why, and how we protect it."
    >
      <SurfaceCard
        eyebrow="Policy"
        title="Privacy policy"
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

      <SurfaceCard
        eyebrow="Contact"
        title="Questions about your data?"
        description="Reach out and we'll respond within two business days."
      >
        <p className="text-sm text-muted">
          Email us at{" "}
          <a
            href={`mailto:${siteConfig.supportEmail}`}
            className="font-semibold text-brand-strong transition hover:text-foreground"
          >
            {siteConfig.supportEmail}
          </a>
        </p>
      </SurfaceCard>
    </AppShell>
  );
}
