import nodemailer from "nodemailer";

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

function createTransport() {
  const server = process.env.AUTH_EMAIL_SERVER;

  if (server) {
    return nodemailer.createTransport(server);
  }

  // Fallback: use SMTP env vars directly
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "localhost",
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
  });
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const transport = createTransport();
  const from = process.env.AUTH_EMAIL_FROM ?? "NWSL Fantasy <noreply@nwslfantasy.com>";

  await transport.sendMail({
    from,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text ?? payload.subject,
  });
}

export function buildDraftTurnEmail(
  displayName: string,
  leagueName: string,
  pickNumber: number
): EmailPayload {
  return {
    to: "",
    subject: `${leagueName}: Your draft pick #${pickNumber} is on deck`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #0522ff;">Your turn to pick</h2>
        <p>Hey ${displayName}, pick #${pickNumber} in <strong>${leagueName}</strong> is waiting for you.</p>
        <p>Head to the draft room to make your selection before the timer runs out.</p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL ?? ""}/dashboard" style="display: inline-block; padding: 12px 24px; background: #0522ff; color: white; border-radius: 999px; text-decoration: none; font-weight: 600;">Open draft room</a>
      </div>
    `,
  };
}

export function buildWaiverResultEmail(
  displayName: string,
  leagueName: string,
  playerName: string,
  result: "won" | "lost" | "canceled"
): EmailPayload {
  const verb = result === "won" ? "won" : result === "lost" ? "was not successful for" : "was canceled for";

  return {
    to: "",
    subject: `${leagueName}: Waiver claim ${result} — ${playerName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #0522ff;">Waiver update</h2>
        <p>Hey ${displayName}, your waiver claim ${verb} <strong>${playerName}</strong> in ${leagueName}.</p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL ?? ""}/dashboard" style="display: inline-block; padding: 12px 24px; background: #0522ff; color: white; border-radius: 999px; text-decoration: none; font-weight: 600;">View transactions</a>
      </div>
    `,
  };
}

export function buildMatchFinalEmail(
  displayName: string,
  leagueName: string,
  userPoints: number,
  opponentPoints: number,
  opponentName: string
): EmailPayload {
  const won = userPoints > opponentPoints;

  return {
    to: "",
    subject: `${leagueName}: Matchup ${won ? "win" : "loss"} — ${userPoints.toFixed(1)} to ${opponentPoints.toFixed(1)}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #0522ff;">Matchup final</h2>
        <p>Hey ${displayName}, your matchup against ${opponentName} in <strong>${leagueName}</strong> went final.</p>
        <p style="font-size: 1.5rem; font-weight: 700;">${userPoints.toFixed(1)} — ${opponentPoints.toFixed(1)}</p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL ?? ""}/dashboard" style="display: inline-block; padding: 12px 24px; background: #0522ff; color: white; border-radius: 999px; text-decoration: none; font-weight: 600;">View standings</a>
      </div>
    `,
  };
}

export function buildEntryLockEmail(
  displayName: string,
  leagueName: string,
  slateLabel: string,
  minutesUntilLock: number
): EmailPayload {
  return {
    to: "",
    subject: `${leagueName}: ${slateLabel} locks in ${minutesUntilLock} minutes`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #0522ff;">Lock warning</h2>
        <p>Hey ${displayName}, your salary-cap entry for <strong>${slateLabel}</strong> in ${leagueName} locks in ${minutesUntilLock} minutes.</p>
        <p>Make your final edits before the window closes.</p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL ?? ""}/dashboard" style="display: inline-block; padding: 12px 24px; background: #0522ff; color: white; border-radius: 999px; text-decoration: none; font-weight: 600;">Open entry</a>
      </div>
    `,
  };
}
