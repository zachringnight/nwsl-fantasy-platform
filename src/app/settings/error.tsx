"use client";

export default function SettingsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="page-shell flex flex-col items-center justify-center px-4 py-20 text-center">
      <h1 className="text-xl font-bold text-white">Something went wrong</h1>
      <p className="mt-2 text-sm text-white/60">
        We couldn&apos;t load this page. Please try again.
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-full bg-brand px-6 py-2 text-sm font-semibold text-white hover:bg-brand-strong transition-colors"
      >
        Try again
      </button>
      <a
        href="/contact"
        className="mt-3 text-sm text-white/50 hover:text-white/70 underline"
      >
        Contact support
      </a>
    </main>
  );
}
