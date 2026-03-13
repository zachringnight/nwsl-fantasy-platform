"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle, Mail } from "lucide-react";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { Button, getButtonClassName } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type FormState = "idle" | "sending" | "sent" | "error";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [formState, setFormState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = email.trim();

    if (!trimmed) return;

    setFormState("sending");
    setErrorMessage("");

    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        throw error;
      }

      setFormState("sent");
    } catch (err) {
      setFormState("error");
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    }
  }

  return (
    <AppShell
      eyebrow="Recovery"
      title="Get back into your account"
      description="We will send a secure link to reset your password."
    >
      <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <SurfaceCard
          eyebrow="Email sign-in"
          title={formState === "sent" ? "Check your inbox" : "Request a new magic link"}
          description={
            formState === "sent"
              ? "Check your email for a link to reset your password."
              : "Enter the email address you used to create your account."
          }
        >
          {formState === "sent" ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-[1.2rem] border border-success/30 bg-success/8 p-4">
                <CheckCircle className="size-5 text-brand-lime" />
                <div>
                  <p className="font-semibold text-foreground">Recovery link sent</p>
                  <p className="mt-1 text-sm text-muted">
                    Check {email} for a link to sign back into your account.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link className={getButtonClassName()} href="/login">
                  Return to sign in
                </Link>
                <button
                  className={getButtonClassName({ variant: "secondary" })}
                  onClick={() => {
                    setFormState("idle");
                    setEmail("");
                  }}
                  type="button"
                >
                  Send to a different email
                </button>
              </div>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-foreground">Email address</span>
                <input
                  className="field-control"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </label>

              {formState === "error" && errorMessage && (
                <div className="rounded-[1rem] border border-danger/30 bg-danger/8 p-3 text-sm text-danger">
                  {errorMessage}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={formState === "sending"}>
                  <Mail className="size-4" />
                  {formState === "sending" ? "Sending…" : "Send magic link"}
                </Button>
                <Link
                  className={getButtonClassName({ variant: "secondary" })}
                  href="/login"
                >
                  Back to sign in
                </Link>
              </div>
            </form>
          )}
        </SurfaceCard>

        <SurfaceCard
          eyebrow="Account security"
          title="How recovery works"
          description="We send a secure, one-time link to your inbox."
          tone="accent"
        >
          <div className="space-y-3">
            <div className="rounded-[1.2rem] border border-line bg-white/6 p-4 text-sm leading-6 text-foreground">
              <p className="font-semibold">Why magic links?</p>
              <p className="mt-2 text-muted">
                Magic links are a single-use, time-limited token sent directly to your inbox.
                They expire after use so there is no password to guess or reuse.
              </p>
            </div>
            <div className="rounded-[1.2rem] border border-line bg-white/6 p-4 text-sm leading-6 text-foreground">
              <p className="font-semibold">Did not get the email?</p>
              <p className="mt-2 text-muted">
                Check your spam folder. If you still cannot find it, wait a few minutes
                and try again — only one link is active at a time.
              </p>
            </div>
          </div>
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
