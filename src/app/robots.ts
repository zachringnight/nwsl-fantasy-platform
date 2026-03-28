import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://nwslfantasy.com";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin/", "/settings/", "/notifications/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
