"use client"

import { useState } from "react"

import { memberInitial, safeAvatarUrl, type CampaignMemberRole } from "@/lib/campaign-members"

/**
 * 36px member avatar (DESIGN.md 9): renders a safe `https://` image with
 * `referrerPolicy="no-referrer"`, falling back to the 36px initial tile when
 * missing, rejected, or failed to load.
 */
export function MemberAvatar({
  displayName,
  avatarUrl,
  role = "editor",
}: {
  displayName: string | null | undefined
  avatarUrl: string | null | undefined
  role?: CampaignMemberRole
}) {
  const safeSrc = safeAvatarUrl(avatarUrl)
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const showImage = Boolean(safeSrc && failedSrc !== safeSrc)

  if (showImage && safeSrc) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={safeSrc}
        alt=""
        width={36}
        height={36}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailedSrc(safeSrc)}
        className="size-9 shrink-0 rounded bg-surface object-cover"
      />
    )
  }

  return (
    <span
      className="inline-flex size-9 shrink-0 items-center justify-center rounded bg-surface text-sm font-bold text-muted"
      aria-hidden
    >
      {memberInitial(displayName, role)}
    </span>
  )
}
