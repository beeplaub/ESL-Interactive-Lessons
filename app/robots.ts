import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/docs", "/blog"],
      disallow: ["/admin", "/account", "/profile", "/notifications", "/api"],
    },
    sitemap: "https://www.brenup.com/sitemap.xml",
  };
}
