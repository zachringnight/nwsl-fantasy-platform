import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Leagues",
  description:
    "Create or join NWSL fantasy leagues. Classic draft, salary-cap, weekly, and daily formats.",
};

export default function LeaguesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
