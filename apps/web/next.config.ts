import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  experimental: {
    // Cover uploads go through a server action: 4 MB image (lib/media.ts)
    // plus multipart overhead, under Vercel's 4.5 MB request limit.
    serverActions: { bodySizeLimit: "4.5mb" },
  },
  images: {
    // Covers come from the app's own /media routes (give-media is a private
    // bucket). Only public covers may be optimized and cached; private ones
    // (src/lib/cover-urls.ts) are rendered unoptimized. Public evidence
    // (/media/public/evidence/) is never optimized: the optimizer's cache
    // would keep serving an image after staff hide it (DOS/Give#58).
    localPatterns: [{ pathname: "/media/public/campaigns/**", search: "" }],
    // Match the route's own cache time, so a cover stops being served soon
    // after its campaign is suspended or cancelled.
    minimumCacheTTL: 300,
    remotePatterns: [{ protocol: "https", hostname: "i.ytimg.com", pathname: "/vi/**" }],
  },
  async headers() {
    return [
      {
        // Global defaults with X-Frame-Options: DENY, excluding /embed and /embed/*
        // which are intentionally frameable read-only widgets (DOS/Give#335).
        source: "/((?!embed(?:/|$)).*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Embeddable campaign widget (DOS/Give#335): allows third-party framing
        // via CSP frame-ancestors * and omits X-Frame-Options.
        source: "/embed/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Guest donation and tracking URLs carry reference codes or status
        // tokens: never send a Referer from them and never store them in
        // shared or browser caches (DOS/Give#50).
        source: "/donations/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
      {
        // Co-organizer invite URLs carry single-use secret tokens: never send a
        // Referer from them, never cache them, and keep crawlers out (DOS/Give#253).
        source: "/invites/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ]
  },
}

export default nextConfig
