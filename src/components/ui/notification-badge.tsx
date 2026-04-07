"use client";

interface NotificationBadgeProps {
  count: number;
  maxDisplay?: number;
}

export function NotificationBadge({ count, maxDisplay = 9 }: NotificationBadgeProps) {
  if (count <= 0) return null;

  const display = count > maxDisplay ? `${maxDisplay}+` : String(count);

  return (
    <span
      aria-label={`${count} unread notification${count === 1 ? "" : "s"}`}
      className="absolute -right-1.5 -top-1.5 flex min-w-[1.15rem] items-center justify-center rounded-full bg-danger px-1 py-0.5 text-[0.6rem] font-bold leading-none text-white shadow-sm"
    >
      {display}
    </span>
  );
}
