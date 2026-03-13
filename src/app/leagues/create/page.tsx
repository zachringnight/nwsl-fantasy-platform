import { AppShell } from "@/components/common/app-shell";
import { CreateLeagueForm } from "@/components/league/create-league-form";

export default function CreateLeaguePage() {
  return (
    <AppShell
      eyebrow="New league"
      title="Pick your format and invite your group"
      description="Classic draft, season cap, weekly cap, or daily — choose and go."
    >
      <CreateLeagueForm />
    </AppShell>
  );
}
