"use client"

import clsx from "clsx"
import { useActionState } from "react"

import { buttonClass } from "@/components/ui/Button"
import { BellIcon, CheckIcon } from "@/components/ui/icons"

export interface FollowActionState {
  following: boolean
  count: number
  error?: string
}

const COUNT_FORMAT = new Intl.NumberFormat("vi-VN")

function SignedInFollowForm({
  initialFollowing,
  initialCount,
  action,
  followLabel,
  followingLabel,
  countNoun,
  primary,
  full,
  size,
  className,
}: {
  initialFollowing: boolean
  initialCount: number
  action: (state: FollowActionState, formData: FormData) => Promise<FollowActionState>
  followLabel: string
  followingLabel: string
  countNoun: string
  primary: boolean
  full: boolean
  size: "md" | "lg"
  className?: string
}) {
  const [state, formAction, pending] = useActionState(action, {
    following: initialFollowing,
    count: initialCount,
  })

  const following = state.following
  const count = state.count
  const countText = `${COUNT_FORMAT.format(Math.max(0, count))} ${countNoun}`

  return (
    <div className={clsx("flex flex-col gap-1.5", full ? "w-full" : "items-start", className)}>
      <form action={formAction} className={full ? "w-full" : undefined}>
        <input type="hidden" name="intent" value={following ? "unfollow" : "follow"} />
        <button
          type="submit"
          disabled={pending}
          aria-pressed={following}
          className={buttonClass({
            variant: following ? "secondary" : primary ? "primary" : "secondary",
            size,
            full,
          })}
        >
          {following ? <CheckIcon width={18} height={18} /> : <BellIcon width={18} height={18} />}
          {pending ? "Đang lưu…" : following ? followingLabel : followLabel}
        </button>
      </form>
      {count > 0 && <p className={clsx("text-sm text-muted tabular-nums", full && "text-center")}>{countText}</p>}
      {state.error && (
        <p role="alert" className={clsx("text-sm text-danger", full && "text-center")}>
          {state.error}
        </p>
      )}
    </div>
  )
}

/**
 * Reusable Follow / Unfollow control for public campaign pages (including
 * pre-launch "Nhận thông báo khi mở" CTAs) and public organizer profile pages
 * (`/u/[handle]`, DOS/Give#315).
 *
 * - Guests see a clean login link carrying `return_path` (using a plain `<a>`
 *   so Next.js never prefetches the OAuth redirect).
 * - Signed-in users toggle follow state via a Server Action with live count
 *   updates and accessible `aria-pressed` / `role="alert"` feedback. Keying the
 *   inner form on the server-provided props keeps client state in sync across
 *   `router.refresh()` and status transitions while preserving inline errors
 *   on failed submissions.
 */
export function FollowButton({
  following: initialFollowing,
  count: initialCount,
  signedIn,
  loginHref,
  action,
  followLabel = "Theo dõi",
  followingLabel = "Đang theo dõi",
  countNoun = "người theo dõi",
  primary = false,
  full = false,
  size = "md",
  className,
}: {
  following: boolean
  count: number
  signedIn: boolean
  loginHref: string
  action: (state: FollowActionState, formData: FormData) => Promise<FollowActionState>
  followLabel?: string
  followingLabel?: string
  countNoun?: string
  primary?: boolean
  full?: boolean
  size?: "md" | "lg"
  className?: string
}) {
  if (!signedIn) {
    const countText = `${COUNT_FORMAT.format(Math.max(0, initialCount))} ${countNoun}`
    return (
      <div className={clsx("flex flex-col gap-1.5", full ? "w-full" : "items-start", className)}>
        <a href={loginHref} className={buttonClass({ variant: primary ? "primary" : "secondary", size, full })}>
          <BellIcon width={18} height={18} />
          {followLabel}
        </a>
        {initialCount > 0 && (
          <p className={clsx("text-sm text-muted tabular-nums", full && "text-center")}>{countText}</p>
        )}
      </div>
    )
  }

  return (
    <SignedInFollowForm
      key={`${initialFollowing}:${initialCount}`}
      initialFollowing={initialFollowing}
      initialCount={initialCount}
      action={action}
      followLabel={followLabel}
      followingLabel={followingLabel}
      countNoun={countNoun}
      primary={primary}
      full={full}
      size={size}
      className={className}
    />
  )
}
