"use client"

import { useSyncExternalStore } from "react"

import { CopyButton } from "@/components/CopyButton"

const noSubscribe = () => () => {}

/**
 * Copies the guest's cross-device tracking link (DOS/Give#50). Uses the
 * canonical site origin when configured, else the current page's own origin
 * (Vercel previews and local runs), matching ShareButtons.
 */
export function TrackingLinkButton({ path, origin: configuredOrigin }: { path: string; origin?: string }) {
  const origin = useSyncExternalStore(
    noSubscribe,
    () => configuredOrigin ?? window.location.origin,
    () => configuredOrigin ?? ""
  )
  return <CopyButton value={`${origin}${path}`} label="Sao chép đường dẫn" name="theo dõi khoản ủng hộ" />
}
