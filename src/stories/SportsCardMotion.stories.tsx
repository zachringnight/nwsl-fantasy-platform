import type { Meta, StoryObj } from "@storybook/react";
import { ArrowRight, Radar, Radio, Sparkles, TimerReset } from "lucide-react";
import { getButtonClassName } from "@/components/ui/button";
import {
  BroadcastScoreBug,
  BroadcastStage,
  CardFan,
  CountdownRing,
  FoilTiltCard,
  MomentumRail,
  PlayerLowerThird,
  PulseMetricStrip,
  RarityPulse,
  TickerMarquee,
  ZoneHeatGrid,
} from "@/components/ui/sports-card-motion";

function MotionLibraryShowcase() {
  return (
    <div className="page-shell space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <BroadcastStage
        tone="cobalt"
        className="grid min-h-[32rem] items-center gap-8 lg:grid-cols-[0.94fr_1.06fr]"
      >
        <div className="space-y-5">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.3em] text-brand-strong">
            Motion Graphics
          </p>
          <div className="space-y-4">
            <h1 className="max-w-xl font-display text-[clamp(3.2rem,8vw,6rem)] uppercase leading-[0.82] tracking-[0.02em] text-white">
              Basketball broadcast motion for analytics and fantasy
            </h1>
            <p className="max-w-lg text-base leading-7 text-white/80">
              Score bugs, player lower-thirds, countdown rings, momentum rails, heat sweeps, and chrome-card reveals.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <RarityPulse label="Broadcast core" tone="holo" />
            <RarityPulse label="Analytics motion" tone="rookie" />
            <RarityPulse label="Fantasy reveal" tone="legendary" />
          </div>
          <div className="flex flex-wrap gap-3">
            <span className={getButtonClassName({ variant: "primary" })}>
              Browse kit
              <ArrowRight className="size-4" />
            </span>
            <span className={getButtonClassName({ variant: "secondary" })}>Use in packages</span>
          </div>
        </div>

        <div className="grid gap-4">
          <BroadcastScoreBug
            awayTeam="PHX"
            awayScore={101}
            homeTeam="GSW"
            homeScore={104}
            period="Q4"
            gameClock="1:49"
            shotClock={11}
            possession="home"
          />
          <PlayerLowerThird
            playerName="Noah Winters"
            teamName="Golden State Horizon"
            role="34 PTS • 7 AST • 59 3P%"
            number="3"
            tags={["Hot hand", "Late game", "Feature open"]}
          />
          <div className="grid gap-4 md:grid-cols-[0.42fr_0.58fr]">
            <CountdownRing label="Shot Clock" value={11} max={24} detail="Live possession" />
            <MomentumRail
              leftLabel="Road"
              leftValue={46}
              rightLabel="Home"
              rightValue={54}
              caption="11-2 finishing run"
            />
          </div>
        </div>
      </BroadcastStage>

      <TickerMarquee
        items={[
          "Tip-off stinger",
          "Live score bug",
          "Possession pulse",
          "Heat sweep",
          "Fantasy reward reveal",
          "Shot clock ring",
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
        <div className="grid gap-6">
          <PulseMetricStrip
            metrics={[
              { label: "Win Prob", value: "62.1%", delta: "+4.6", trend: "up" },
              { label: "Usage", value: "31.8%", delta: "+3.9", trend: "up" },
              { label: "Proj Pace", value: "101.7", delta: "+1.3", trend: "steady" },
              { label: "EV", value: "144", delta: "-1.7", trend: "down" },
            ]}
          />
          <ZoneHeatGrid
            zones={[
              { label: "L Wing", value: 62 },
              { label: "Top", value: 89 },
              { label: "R Wing", value: 68 },
              { label: "L Mid", value: 44 },
              { label: "Paint", value: 95 },
              { label: "R Mid", value: 51 },
              { label: "L Corner", value: 56 },
              { label: "Dunker", value: 70 },
              { label: "R Corner", value: 60 },
            ]}
          />
        </div>

        <div className="grid gap-6">
          <FoilTiltCard
            title="Fast Break"
            subtitle="Chrome-card motion for reward claims, player intros, and high-value fantasy reveals."
            rating="98"
            series="Courtside Signature"
            tags={["Reward", "Chrome", "Hero"]}
          />
          <CardFan
            cards={[
              { eyebrow: "Parallel", title: "Prizm", meta: "Collection reveal", rarity: "Holo" },
              { eyebrow: "Chase", title: "Blackout", meta: "Premium center frame", rarity: "Legendary" },
              { eyebrow: "Rookie", title: "Debut", meta: "Prospect call-up reveal", rarity: "Rookie" },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

const meta: Meta<typeof BroadcastStage> = {
  title: "Motion/SportsCardMotion",
  component: BroadcastStage,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof BroadcastStage>;

export const LibraryShowcase: Story = {
  render: () => <MotionLibraryShowcase />,
};

export const LiveBroadcastPackage: Story = {
  render: () => (
    <div className="page-shell grid gap-4 px-4 py-8">
      <BroadcastScoreBug
        awayTeam="MIL"
        awayScore={97}
        homeTeam="DAL"
        homeScore={100}
        period="Q4"
        gameClock="3:04"
        shotClock={18}
        possession="away"
        status="National TV"
      />
      <PlayerLowerThird
        tone="volt"
        eyebrow="Matchup Focus"
        playerName="Cam Ellis"
        teamName="Dallas Orbit"
        role="28 PTS • 12 REB • 3 BLK"
        number="24"
        tags={["Primary matchup", "Live update", "Feature"]}
      />
    </div>
  ),
};

export const AnalyticsMotionModules: Story = {
  render: () => (
    <div className="page-shell grid gap-6 px-4 py-8 lg:grid-cols-[0.34fr_0.66fr]">
      <CountdownRing tone="ember" label="Lock" value={5} max={10} detail="Lineup window" />
      <div className="grid gap-6">
        <MomentumRail
          tone="cobalt"
          leftLabel="Halfcourt"
          leftValue={41}
          rightLabel="Transition"
          rightValue={59}
          caption="Play-type pressure"
        />
        <PulseMetricStrip
          tone="volt"
          metrics={[
            { label: "Assist Rate", value: "68.4%", delta: "+7.2", trend: "up" },
            { label: "Rim Rate", value: "39.2%", delta: "+3.1", trend: "up" },
            { label: "Turnover Risk", value: "12.8%", delta: "-0.8", trend: "down" },
          ]}
        />
        <ZoneHeatGrid
          tone="ember"
          zones={[
            { label: "L Wing", value: 57 },
            { label: "Top", value: 88 },
            { label: "R Wing", value: 73 },
            { label: "L Mid", value: 40 },
            { label: "Paint", value: 92 },
            { label: "R Mid", value: 49 },
            { label: "L Corner", value: 55 },
            { label: "Dunker", value: 76 },
            { label: "R Corner", value: 63 },
          ]}
        />
      </div>
    </div>
  ),
};

export const FantasyRevealPackage: Story = {
  render: () => (
    <div className="page-shell grid gap-6 px-4 py-8">
      <TickerMarquee
        speed="fast"
        items={["Reward reveal", "Pack drop", "Featured card", "Claimed win", "Legendary pull"]}
      />
      <div className="grid gap-6 xl:grid-cols-[0.56fr_0.44fr]">
        <FoilTiltCard
          tone="volt"
          title="Buzzer"
          subtitle="A collectible treatment for spotlight players, reward claims, and premium fantasy drops."
          rating="95"
          series="Chrome Vault"
          tags={["Starter", "Shimmer", "Arena"]}
        />
        <CardFan
          cards={[
            { eyebrow: "Parallel", title: "Prizm", meta: "Reward reveal", rarity: "Holo" },
            { eyebrow: "Chase", title: "Nightfall", meta: "Rare bonus pull", rarity: "Legendary" },
            { eyebrow: "Rookie", title: "Debut", meta: "Breakout player unlock", rarity: "Rookie" },
          ]}
        />
      </div>
    </div>
  ),
};

export const ModuleIcons: Story = {
  render: () => (
    <div className="page-shell grid gap-4 px-4 py-8 sm:grid-cols-2 lg:grid-cols-4">
      {[
        { icon: Radio, label: "Score Bug" },
        { icon: TimerReset, label: "Timer Ring" },
        { icon: Radar, label: "Heat Sweep" },
        { icon: Sparkles, label: "Reward Reveal" },
      ].map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className="rounded-[1.6rem] border border-white/12 bg-panel p-5 text-center"
          >
            <div className="inline-flex size-12 items-center justify-center rounded-2xl border border-white/12 bg-white/8 text-brand-strong">
              <Icon className="size-5" />
            </div>
            <p className="mt-3 text-sm font-semibold uppercase tracking-[0.18em] text-white/82">
              {item.label}
            </p>
          </div>
        );
      })}
    </div>
  ),
};
