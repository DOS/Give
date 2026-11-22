"use client"

import Image from "next/image"
import { useState } from "react"

import { organizerInitial, safeAvatarUrl } from "@/lib/organizer-handle"

const SIZE_CLASSES = {
  md: { px: 36, box: "size-9 text-sm" },
  lg: { px: 64, box: "size-16 text-h2" },
} as const

/**
 * Organizer avatar with initials fallback (DESIGN.md 5 & 9: 4px radius, never a
 * circle/pill, flat `surface` fill when showing the initial). Uses `unoptimized`
 * so external DOS ID avatar hosts do not pass through Next's image proxy.
 */
export function OrganizerAvatar({
  displayName,
  avatarUrl,
  size = "lg",
}: {
  displayName: string
  avatarUrl: string | null | undefined
  size?: keyof typeof SIZE_CLASSES
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const safeUrl = safeAvatarUrl(avatarUrl)
  const { px, box } = SIZE_CLASSES[size]
  const initial = organizerInitial(displayName)

  if (safeUrl && failedUrl !== safeUrl) {
    return (
      <Image
        src={safeUrl}
        alt=""
        width={px}
        height={px}
        unoptimized
        referrerPolicy="no-referrer"
        onError={() => setFailedUrl(safeUrl)}
        className={`${box} shrink-0 rounded border border-border bg-surface object-cover`}
      />
    )
  }

  return (
    <span
      className={`inline-flex ${box} shrink-0 items-center justify-center rounded bg-surface font-bold text-muted`}
      aria-hidden
    >
      {initial}
    </span>
  )
}
