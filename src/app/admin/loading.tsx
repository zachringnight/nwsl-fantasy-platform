export default function AdminLoading() {
  return (
    <main className="page-shell space-y-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <section className="glass-card edge-field surface-ring overflow-hidden rounded-[2.25rem] border border-line bg-panel-strong px-5 py-6 sm:px-7 lg:px-9 lg:py-8">
        <div className="subtle-grid absolute inset-0 opacity-20" />
        <div className="brand-strip absolute inset-x-0 top-0 h-1.5 opacity-95" />
        <div className="relative z-10 space-y-4">
          <div className="h-6 w-20 animate-pulse rounded-full bg-white/8" />
          <div className="h-14 w-72 animate-pulse rounded-xl bg-white/6" />
          <div className="h-5 w-56 animate-pulse rounded-lg bg-white/5" />
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <div className="h-10 w-28 animate-pulse rounded-full border border-line bg-white/8" />
        <div className="h-10 w-32 animate-pulse rounded-full border border-line bg-white/5" />
        <div className="h-10 w-28 animate-pulse rounded-full border border-line bg-white/5" />
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <div className="h-28 animate-pulse rounded-[1.75rem] border border-line bg-panel-strong/60" />
        <div className="h-28 animate-pulse rounded-[1.75rem] border border-line bg-panel-strong/60" />
        <div className="h-28 animate-pulse rounded-[1.75rem] border border-line bg-panel-strong/60" />
      </div>

      <div className="space-y-4 rounded-[1.75rem] border border-line bg-panel-strong/60 p-6">
        <div className="h-5 w-36 animate-pulse rounded-full bg-white/8" />
        <div className="h-7 w-56 animate-pulse rounded-lg bg-white/6" />
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-[1.2rem] border border-line bg-white/5" />
          <div className="h-24 animate-pulse rounded-[1.2rem] border border-line bg-white/5" />
        </div>
      </div>
    </main>
  );
}
