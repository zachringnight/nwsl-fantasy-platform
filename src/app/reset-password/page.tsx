"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle, Lock } from "lucide-react";
import { AppShell } from "@/components/common/app-shell";
import { SurfaceCard } from "@/components/common/surface-card";
import { Button, getButtonClassName } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type ResetState = "loading" | "ready" | "submitting" | "done" | "error";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetState, setResetState] = useState<ResetState>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    // Supabase sends the user here with a session already established
    // via the recovery token in the URL hash
    const supabase = getSupabaseBrowserClient();

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setResetState("ready");
      } else {
        setResetState("error");
        setErrorMessage(
          "This recovery link has expired or was already used. Request a new one."
        );
      }
    });
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
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
            <form className="space-y-4" onSubmit={handleSubmit}>
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
                />
              </label>

              {errorMessage && (
                <div className="rounded-[1rem] border border-danger/30 bg-danger/8 p-3 text-sm text-danger">
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
                Use a different password than your other accounts so one breach doesn't affect everything.
              </p>
            </div>
          </div>
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
