export default function LeaguesLoading() {
  return (
    <main className="page-shell space-y-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <section className="glass-card edge-field surface-ring overflow-hidden rounded-[2.25rem] border border-line bg-panel-strong px-5 py-6 sm:px-7 lg:px-9 lg:py-8">
        <div className="subtle-grid absolute inset-0 opacity-20" />
        <div className="brand-strip absolute inset-x-0 top-0 h-1.5 opacity-95" />
        <div className="relative z-10 space-y-4">
          <div className="h-6 w-20 animate-pulse rounded-full bg-white/8" />
          <div className="h-14 w-3/4 animate-pulse rounded-xl bg-white/6" />
          <div className="h-5 w-1/2 animate-pulse rounded-lg bg-white/5" />
        </div>
      </section>
      <div className="hero-grid">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-52 animate-pulse rounded-[1.75rem] border border-line bg-panel-strong/60"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
