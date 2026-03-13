import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";

export default function AdminPage() {
  return (
    <AppShell
      eyebrow="Admin"
      title="League operations desk"
      description="Review support cases, scoring corrections, and league operations from one secure workspace."
    >
      <section className="grid gap-5 lg:grid-cols-3">
        <SurfaceCard eyebrow="Scoring" title="Manual correction tools" description="Audit score changes, replay event corrections, and keep a history of every override." />
        <SurfaceCard eyebrow="Data" title="Feed health" description="See ingestion status, stalled jobs, and contest windows that need review before lock." />
        <SurfaceCard eyebrow="Support" title="User and league support" description="Find accounts, inspect leagues, and trace commissioner actions from one place." tone="accent" />
      </section>
    </AppShell>
  );
}
