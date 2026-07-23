import Link from "next/link";
import {
  ArrowRight,
  Flame,
  Radar,
  Radio,
  Sparkles,
  TimerReset,
  Waves,
  Zap,
} from "lucide-react";
import { AppShell } from "@/components/common/app-shell";
import { MotionReveal } from "@/components/ui/motion-reveal";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
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
  SpotlightPanel,
  TickerMarquee,
  ZoneHeatGrid,
} from "@/components/ui/sports-card-motion";

export const metadata = {
  title: "Motion Graphics Library",
  description: "Reusable basketball motion graphics for analytics and fantasy products.",
};

const tickerItems = [
  "Tip-off stinger",
  "Live score bug",
  "Possession pulse",
  "Shot clock ring",
  "Momentum rail",
  "Heat sweep",
  "Fantasy reward reveal",
];

const pulseMetrics = [
  { label: "Win Prob", value: "61.8%", delta: "+4.2", trend: "up" as const },
  { label: "Proj Pace", value: "102.4", delta: "+1.8", trend: "up" as const },
  { label: "Usage Spike", value: "33.1%", delta: "+5.0", trend: "up" as const },
  { label: "Lineup EV", value: "147", delta: "-2.3", trend: "down" as const },
];

const zoneData = [
  { label: "L Wing 3", value: 64 },
  { label: "Top 3", value: 91 },
  { label: "R Wing 3", value: 72 },
  { label: "L Mid", value: 48 },
  { label: "Paint", value: 96 },
  { label: "R Mid", value: 52 },
  { label: "L Corner", value: 58 },
  { label: "Dunker", value: 74 },
  { label: "R Corner", value: 61 },
];

const packageRecipes = [
  {
    eyebrow: "Live Package",
    title: "Stinger + score bug + lower third",
    description:
      "The on-air core for game opens, player intros, alerts, and live score updates.",
    icon: Radio,
  },
  {
    eyebrow: "Analytics Package",
    title: "Countdown + momentum + heat sweep",
    description:
      "The motion set for predictive dashboards, matchup explainers, and player trend stories.",
    icon: Radar,
  },
  {
    eyebrow: "Fantasy Package",
    title: "Foil reveal + chase fan + ticker",
    description:
      "The motion language for drops, reward claims, draft promos, and premium player cards.",
    icon: Sparkles,
  },
];

export default function MotionLibraryPage() {
  return (
    <AppShell
      eyebrow="Motion Lab"
      title="Basketball motion graphics library"
      description="Broadcast-grade motion pieces for analytics and fantasy basketball products: score bugs, lower-thirds, shot-clock rings, momentum rails, heat sweeps, and chrome-card reveals."
      actions={
        <div className="flex flex-wrap gap-3">
          <Link href="#graphics-kit" className={getButtonClassName({ variant: "primary" })}>
            Browse graphics
            <ArrowRight className="size-4" />
          </Link>
          <Link href="#packages" className={getButtonClassName({ variant: "secondary" })}>
            View packages
          </Link>
        </div>
      }
    >
      <MotionReveal className="xl:col-span-2" emphasis="live">
        <BroadcastStage
          tone="cobalt"
          className="grid min-h-[36rem] items-center gap-8 lg:grid-cols-[0.96fr_1.04fr]"
        >
          <div className="space-y-6">
            <div className="space-y-4">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.3em] text-brand-strong">
                Motion Package
              </p>
              <h2 className="max-w-2xl font-display text-[clamp(3.5rem,8vw,6.8rem)] uppercase leading-[0.8] tracking-[0.02em] text-white">
                Broadcast, analytics, and fantasy motion in one system
              </h2>
              <p className="max-w-xl text-base leading-7 text-white/82">
                This library is focused on reusable motion graphics, not full site builds. It covers
                the layer a high-end basketball analytics or fantasy product actually needs on top:
                score bugs, lower-thirds, timer rings, run-of-play rails, data pulses, heat sweeps,
                and collectible-card reveals.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <RarityPulse label="Broadcast core" tone="holo" />
              <RarityPulse label="Analytics motion" tone="rookie" />
              <RarityPulse label="Fantasy reveals" tone="legendary" />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-[1.5rem] border border-white/12 bg-black/22 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-brand-gold">
                  Graphics
                </p>
                <p className="mt-2 font-display text-4xl uppercase leading-none text-white">11</p>
                <p className="mt-2 text-sm leading-6 text-white/74">Core reusable motion modules.</p>
              </div>
              <div className="rounded-[1.5rem] border border-white/12 bg-black/22 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-brand-gold">
                  Timing
                </p>
                <p className="mt-2 font-display text-4xl uppercase leading-none text-white">Fast</p>
                <p className="mt-2 text-sm leading-6 text-white/74">TV-paced sweeps and restrained loops.</p>
              </div>
              <div className="rounded-[1.5rem] border border-white/12 bg-black/22 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-brand-gold">
                  Focus
                </p>
                <p className="mt-2 font-display text-4xl uppercase leading-none text-white">Pure</p>
                <p className="mt-2 text-sm leading-6 text-white/74">Motion graphics, not page scaffolding.</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <BroadcastScoreBug
              awayTeam="NYK"
              awayScore={94}
              homeTeam="LAL"
              homeScore={99}
              period="Q4"
              gameClock="2:18"
              shotClock={13}
              possession="home"
            />
            <PlayerLowerThird
              eyebrow="Player Intro"
              playerName="Jalen Mercer"
              teamName="Los Angeles Stars"
              role="38 PTS • 9 AST • 61 TS%"
              number="11"
              tags={["Late clock", "Primary creator", "Crunch time"]}
            />
            <div className="grid gap-4 md:grid-cols-[0.44fr_0.56fr]">
              <CountdownRing label="Shot Clock" value={13} max={24} detail="Live possession" />
              <MomentumRail
                leftLabel="Road"
                leftValue={43}
                rightLabel="Home"
                rightValue={57}
                caption="13-4 closing run"
              />
            </div>
          </div>
        </BroadcastStage>
      </MotionReveal>

      <MotionReveal className="xl:col-span-2" delay={120} variant="scale">
        <TickerMarquee items={tickerItems} speed="medium" />
      </MotionReveal>

      <section id="graphics-kit" className="grid gap-6 xl:col-span-2 xl:grid-cols-[1.06fr_0.94fr]">
        <ScrollReveal>
          <div className="grid gap-6">
            <div className="grid gap-6 lg:grid-cols-[0.58fr_0.42fr]">
              <BroadcastScoreBug
                tone="ember"
                awayTeam="BOS"
                awayScore={108}
                homeTeam="MIA"
                homeScore={110}
                period="OT"
                gameClock="0:42"
                shotClock={8}
                possession="away"
                status="Crunch Time"
              />
              <CountdownRing
                tone="volt"
                label="Lock"
                value={6}
                max={10}
                detail="Lineup edit window"
              />
            </div>

            <PlayerLowerThird
              tone="volt"
              eyebrow="Fantasy Spotlight"
              playerName="Ari Chambers"
              teamName="Chicago Orbit"
              role="48.6 projected • 30.4 usage • 9.1 leverage"
              number="2"
              tags={["Captain pool", "Late swap", "Ceiling play"]}
            />

            <PulseMetricStrip metrics={pulseMetrics} />
          </div>
        </ScrollReveal>

        <ScrollReveal>
          <div className="grid gap-6">
            <MomentumRail
              tone="ember"
              leftLabel="Halfcourt"
              leftValue={38}
              rightLabel="Transition"
              rightValue={62}
              caption="Possession profile"
            />

            <ZoneHeatGrid zones={zoneData} />

            <SpotlightPanel tone="cobalt">
              <div className="space-y-5">
                <div className="space-y-2">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-brand-strong">
                    Analytics Motion
                  </p>
                  <h3 className="font-display text-[clamp(2.3rem,4.6vw,3.7rem)] uppercase leading-[0.84] tracking-[0.02em] text-white">
                    Data should move like a TV package, not a dashboard
                  </h3>
                  <p className="max-w-lg text-sm leading-7 text-white/80">
                    Use timer rings for lock pressure, momentum rails for game-state shifts, pulse strips
                    for fast reads, and heat sweeps when a stat block needs cinematic emphasis.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <RarityPulse label="Score bugs" tone="holo" />
                  <RarityPulse label="Timer rings" tone="rookie" />
                  <RarityPulse label="Heat sweeps" tone="legendary" />
                </div>
              </div>
            </SpotlightPanel>
          </div>
        </ScrollReveal>
      </section>

      <section className="grid gap-6 xl:col-span-2 xl:grid-cols-[1fr_1fr]">
        <ScrollReveal>
          <FoilTiltCard
            title="Fast Break"
            subtitle="Chrome-card motion for reward reveals, premium players, lineup wins, and featured drops."
            rating="98"
            series="Courtside Signature"
            tags={["Fantasy reward", "Player intro", "Promo stinger"]}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.15rem] border border-white/12 bg-black/22 p-3">
                <p className="text-[0.64rem] font-semibold uppercase tracking-[0.22em] text-white/65">
                  Finish
                </p>
                <p className="mt-2 text-lg font-semibold text-white">Chrome</p>
              </div>
              <div className="rounded-[1.15rem] border border-white/12 bg-black/22 p-3">
                <p className="text-[0.64rem] font-semibold uppercase tracking-[0.22em] text-white/65">
                  Motion
                </p>
                <p className="mt-2 text-lg font-semibold text-white">Tilt</p>
              </div>
              <div className="rounded-[1.15rem] border border-white/12 bg-black/22 p-3">
                <p className="text-[0.64rem] font-semibold uppercase tracking-[0.22em] text-white/65">
                  Package
                </p>
                <p className="mt-2 text-lg font-semibold text-white">Fantasy</p>
              </div>
            </div>
          </FoilTiltCard>
        </ScrollReveal>

        <ScrollReveal>
          <CardFan
            cards={[
              {
                eyebrow: "Parallel",
                title: "Prizm",
                meta: "Use for pack opens, reward claim reveals, and featured collection drops.",
                rarity: "Holo",
                rarityTone: "holo",
              },
              {
                eyebrow: "Chase",
                title: "Blackout",
                meta: "Use as the premium center frame in a fantasy reward or player-intro sequence.",
                rarity: "Legendary",
                rarityTone: "legendary",
              },
              {
                eyebrow: "Rookie",
                title: "Debut",
                meta: "Use for breakout alerts, prospect packages, and opening-night feature reveals.",
                rarity: "Rookie",
                rarityTone: "rookie",
              },
            ]}
          />
        </ScrollReveal>
      </section>

      <section id="packages" className="grid gap-6 xl:col-span-2 lg:grid-cols-3">
        {packageRecipes.map((recipe, index) => {
          const Icon = recipe.icon;

          return (
            <MotionReveal
              key={recipe.title}
              delay={index * 90}
              variant={index === 1 ? "scale" : index === 2 ? "right" : "left"}
            >
              <div className="league-mood-card h-full rounded-[2rem] border border-white/10 p-6">
                <div className="relative z-10 space-y-4">
                  <div className="inline-flex size-11 items-center justify-center rounded-2xl border border-white/12 bg-white/8 text-brand-strong">
                    <Icon className="size-5" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-brand-strong">
                      {recipe.eyebrow}
                    </p>
                    <h3 className="font-display text-[2.5rem] uppercase leading-[0.86] tracking-[0.02em] text-white">
                      {recipe.title}
                    </h3>
                    <p className="text-sm leading-7 text-white/78">{recipe.description}</p>
                  </div>
                </div>
              </div>
            </MotionReveal>
          );
        })}
      </section>

      <ScrollReveal className="xl:col-span-2">
        <SpotlightPanel tone="volt">
          <div className="grid gap-8 lg:grid-cols-[0.76fr_1.24fr]">
            <div className="space-y-4">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-brand-lime">
                Library Scope
              </p>
              <h2 className="font-display text-[clamp(2.8rem,5vw,4.9rem)] uppercase leading-[0.84] tracking-[0.02em] text-white">
                Everything here is about motion graphics, not site chrome
              </h2>
              <p className="max-w-lg text-sm leading-7 text-white/82">
                The goal is to give a basketball analytics or fantasy product a complete on-air layer:
                broadcast information graphics, stat-driven animation modules, and high-value reward reveals.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.25rem] border border-white/12 bg-black/20 p-4">
                <Radio className="size-5 text-brand-strong" />
                <p className="mt-3 text-sm font-semibold text-white">Score bug / lower third</p>
              </div>
              <div className="rounded-[1.25rem] border border-white/12 bg-black/20 p-4">
                <TimerReset className="size-5 text-brand-gold" />
                <p className="mt-3 text-sm font-semibold text-white">Countdown / run-of-play</p>
              </div>
              <div className="rounded-[1.25rem] border border-white/12 bg-black/20 p-4">
                <Flame className="size-5 text-brand-lime" />
                <p className="mt-3 text-sm font-semibold text-white">Fantasy reward reveal</p>
              </div>
              <div className="rounded-[1.25rem] border border-white/12 bg-black/20 p-4">
                <Waves className="size-5 text-brand-strong" />
                <p className="mt-3 text-sm font-semibold text-white">Ticker / sweep accents</p>
              </div>
              <div className="rounded-[1.25rem] border border-white/12 bg-black/20 p-4">
                <Radar className="size-5 text-brand-gold" />
                <p className="mt-3 text-sm font-semibold text-white">Heat / analytics motion</p>
              </div>
              <div className="rounded-[1.25rem] border border-white/12 bg-black/20 p-4">
                <Zap className="size-5 text-brand-lime" />
                <p className="mt-3 text-sm font-semibold text-white">Pulse stats / live bugs</p>
              </div>
            </div>
          </div>
        </SpotlightPanel>
      </ScrollReveal>
    </AppShell>
  );
}
