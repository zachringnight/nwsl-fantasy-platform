import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { JoinLeagueForm } from "@/components/league/join-league-form";

interface JoinLeaguePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function JoinLeaguePage({ searchParams }: JoinLeaguePageProps) {
  const resolvedSearchParams = await searchParams;
  const codeParam = resolvedSearchParams.code;
  const initialCode = Array.isArray(codeParam) ? codeParam[0] : codeParam;

  return (
    <AppShell
      eyebrow="Join league"
      title="Enter a code and get straight into the room"
      description="Join from a link or code and land directly in the right league."
    >
      <section className="grid gap-5 lg:grid-cols-2">
        <SurfaceCard
          eyebrow="Invite link"
          title="Join from a link"
          description={
            initialCode
              ? `Invite detected. The code ${initialCode} is already loaded, so you only need to confirm and continue.`
              : "If you open an invite link, the code will already be filled in for you."
          }
        />
        <SurfaceCard
          eyebrow="Join code"
          title="Manual code entry"
          description="Paste a code from chat, email, or a shared post."
          tone="accent"
        >
          <JoinLeagueForm initialCode={initialCode} />
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
