import { Skeleton, SkeletonRow } from "@/components/ui/skeleton";

export default function NotificationsLoading() {
  return (
    <main className="page-shell space-y-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <section className="glass-card edge-field surface-ring overflow-hidden rounded-[2.25rem] border border-line bg-panel-strong px-5 py-6 sm:px-7 lg:px-9 lg:py-8">
        <div className="subtle-grid absolute inset-0 opacity-20" />
        <div className="brand-strip absolute inset-x-0 top-0 h-1.5 opacity-95" />
        <div className="relative z-10 space-y-4">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-14 w-1/2" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      </section>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </main>
  );
}
