"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export interface NavLinkProps {
  href: string;
  label: string;
  isActive: boolean;
}

export function NavLink({ href, label, isActive }: NavLinkProps) {
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "rounded-full border px-4 py-2 text-sm font-medium transition duration-300",
        isActive
          ? "border-brand bg-brand text-white shadow-brand"
          : "border-line bg-white/6 text-foreground hover:border-brand-strong/50 hover:bg-white/10 hover:text-brand-strong"
      )}
    >
      {label}
    </Link>
  );
}
