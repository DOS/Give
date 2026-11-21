"use client"

import { useEffect } from "react"

import { trackCampaignView } from "@/lib/analytics-client"

/**
 * Invisible beacon on public campaign pages (DOS/Give#252): sends at most one
 * view event per Vietnam day per browser, skipping speculative prerenders until
 * the page actually activates.
 */
export function CampaignViewBeacon({ campaignId }: { campaignId: string }) {
  useEffect(() => {
    const isPrerendering = () =>
      Boolean((document as Document & { prerendering?: boolean }).prerendering) ||
      String(document.visibilityState) === "prerender"

    if (!isPrerendering()) {
      trackCampaignView(campaignId)
      return
    }
    const onActivate = () => {
      if (!isPrerendering()) {
        document.removeEventListener("prerenderingchange", onActivate)
        document.removeEventListener("visibilitychange", onActivate)
        trackCampaignView(campaignId)
      }
    }
    document.addEventListener("prerenderingchange", onActivate)
    document.addEventListener("visibilitychange", onActivate)
    return () => {
      document.removeEventListener("prerenderingchange", onActivate)
      document.removeEventListener("visibilitychange", onActivate)
    }
  }, [campaignId])

  return null
}
