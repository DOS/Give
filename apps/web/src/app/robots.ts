import type { MetadataRoute } from "next"

import { siteOrigin } from "@/lib/auth/origin"

export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin()
  return {
    rules: {
      userAgent: "*",
      // Allow /media/public/ explicitly (len 14 > /me len 3) so RFC 9309 prefix
      // matching allows public covers/evidence while /me, /media/private/, and /media/evidence/ stay disallowed.
      allow: ["/", "/media/public/"],
      disallow: ["/admin", "/me", "/api", "/auth", "/donations", "/plans", "/email", "/embed", "/invites", "/start"],
    },
    ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}),
  }
}
