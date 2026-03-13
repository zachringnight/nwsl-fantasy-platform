import { AppShell } from "@/components/common/app-shell";
import { CreateLeagueForm } from "@/components/league/create-league-form";

export default function CreateLeaguePage() {
  return (
    <AppShell
      eyebrow="League creation"
      title="Create a league with the right rules from the start"
      description="Choose classic season-long, season salary cap, weekly salary cap, or daily salary cap, then set your room size and invite your group."
    >
      <CreateLeagueForm />
    </AppShell>
  );
}
