import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://nwslfantasy.com";
  const staticPages = [
    "",
    "/login",
    "/signup",
    "/help",
    "/rules",
    "/terms",
    "/privacy",
    "/contact",
    "/players",
    "/players/compare",
  ];

  return staticPages.map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: path === "" ? "daily" : "weekly",
    priority: path === "" ? 1 : 0.7,
  }));
}
