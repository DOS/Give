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
    // (src/lib/cover-urls.ts) are rendered unoptimized.
    localPatterns: [{ pathname: "/media/public/**", search: "" }],
    remotePatterns: [{ protocol: "https", hostname: "i.ytimg.com", pathname: "/vi/**" }],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ]
  },
}

export default nextConfig
