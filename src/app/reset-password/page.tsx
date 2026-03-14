"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle, Lock } from "lucide-react";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { Button, getButtonClassName } from "@/components/ui/button";
import { validateFantasyPassword } from "@/lib/fantasy-profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type ResetState = "loading" | "ready" | "submitting" | "done" | "error";
const expiredRecoveryLinkMessage =
  "This recovery link has expired or was already used. Request a new one.";

function getResetPasswordErrorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "We could not verify your recovery link. Request a new one.";
}

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetState, setResetState] = useState<ResetState>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isActive = true;
    let resolvedRecovery = false;
    let fallbackTimer: number | null = null;

    const clearFallbackTimer = () => {
      if (fallbackTimer != null) {
        window.clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
    };

    const markReady = () => {
      if (!isActive) {
        return;
      }

      resolvedRecovery = true;
      clearFallbackTimer();
      setErrorMessage("");
      setResetState("ready");
    };

    const markError = (message: string) => {
      if (!isActive || resolvedRecovery) {
        return;
      }

      clearFallbackTimer();
      setResetState("error");
      setErrorMessage(message);
    };

    try {
      const supabase = getSupabaseBrowserClient();
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (session || event === "PASSWORD_RECOVERY") {
          markReady();
        }
      });

      void supabase.auth.getSession().then(({ data: { session }, error }) => {
        if (error) {
          markError(getResetPasswordErrorMessage(error));
          return;
        }

        if (session) {
          markReady();
          return;
        }

        if (!resolvedRecovery) {
          fallbackTimer = window.setTimeout(() => {
            markError(expiredRecoveryLinkMessage);
          }, 1200);
        }
      });

      return () => {
        isActive = false;
        clearFallbackTimer();
        data.subscription.unsubscribe();
      };
    } catch (error) {
      markError(getResetPasswordErrorMessage(error));
    }

    return () => {
      isActive = false;
      clearFallbackTimer();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage("");

    try {
      validateFantasyPassword(password);
    } catch (error) {
      setErrorMessage(getResetPasswordErrorMessage(error));
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setResetState("submitting");
    setErrorMessage("");

    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        throw error;
      }

      setResetState("done");
    } catch (err) {
      setResetState("ready");
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
      title="Set a new password"
      description="Choose a new password for your account."
    >
      <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <SurfaceCard
          eyebrow="New password"
          title={
            resetState === "done"
              ? "Password updated"
              : resetState === "error"
                ? "Link expired"
                : "Choose a new password"
          }
          description={
            resetState === "done"
              ? "You're all set. Sign in with your new password."
              : resetState === "error"
                ? errorMessage
                : "Enter a new password to regain access to your account."
          }
        >
          {resetState === "loading" && (
            <p className="text-sm text-muted">Verifying your recovery link...</p>
          )}

          {resetState === "done" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-[1.2rem] border border-success/30 bg-success/8 p-4">
                <CheckCircle className="size-5 text-brand-lime" />
                <div>
                  <p className="font-semibold text-foreground">Password updated</p>
                  <p className="mt-1 text-sm text-muted">
                    Your password has been changed. You can now sign in.
                  </p>
                </div>
              </div>
              <Link className={getButtonClassName()} href="/login">
                Sign in
              </Link>
            </div>
          )}

          {resetState === "error" && (
            <div className="space-y-4">
              <Link className={getButtonClassName()} href="/forgot-password">
                Request a new link
              </Link>
              <Link
                className={getButtonClassName({ variant: "secondary" })}
                href="/login"
              >
                Back to sign in
              </Link>
            </div>
          )}

          {(resetState === "ready" || resetState === "submitting") && (
            <form className="space-y-4" noValidate onSubmit={handleSubmit}>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-foreground">
                  New password
                </span>
                <input
                  className="field-control"
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoFocus
                  autoComplete="new-password"
                  aria-invalid={Boolean(errorMessage)}
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-foreground">
                  Confirm password
                </span>
                <input
                  className="field-control"
                  type="password"
                  placeholder="Type it again"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  aria-invalid={Boolean(errorMessage)}
                />
              </label>

              {errorMessage && (
                <div
                  className="rounded-[1rem] border border-danger/30 bg-danger/8 p-3 text-sm text-danger"
                  role="alert"
                >
                  {errorMessage}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <Button
                  type="submit"
                  disabled={resetState === "submitting"}
                >
                  <Lock className="size-4" />
                  {resetState === "submitting"
                    ? "Updating..."
                    : "Update password"}
                </Button>
                <Link
                  className={getButtonClassName({ variant: "secondary" })}
                  href="/login"
                >
                  Cancel
                </Link>
              </div>
            </form>
          )}
        </SurfaceCard>

        <SurfaceCard
          eyebrow="Security"
          title="Password tips"
          description="Keep your account safe."
          tone="accent"
        >
          <div className="space-y-3">
            <div className="rounded-[1.2rem] border border-line bg-white/6 p-4 text-sm leading-6 text-foreground">
              <p className="font-semibold">Use a strong password</p>
              <p className="mt-2 text-muted">
                At least 6 characters. Mix letters, numbers, and symbols for the best protection.
              </p>
            </div>
            <div className="rounded-[1.2rem] border border-line bg-white/6 p-4 text-sm leading-6 text-foreground">
              <p className="font-semibold">Keep it unique</p>
              <p className="mt-2 text-muted">
                Use a different password than your other accounts so one breach does not affect everything.
              </p>
            </div>
          </div>
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
