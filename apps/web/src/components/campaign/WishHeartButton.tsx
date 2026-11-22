"use client"

import clsx from "clsx"
import { useActionState } from "react"

import { HeartIcon } from "@/components/ui/icons"

export interface WishHeartActionState {
  hearted: boolean
  heartCount: number
  error?: string
}

const COUNT_FORMAT = new Intl.NumberFormat("vi-VN")

function SignedInWishHeartForm({
  initialHearted,
  initialHeartCount,
  action,
}: {
  initialHearted: boolean
  initialHeartCount: number
  action: (state: WishHeartActionState, formData: FormData) => Promise<WishHeartActionState>
}) {
  const [state, formAction, pending] = useActionState(action, {
    hearted: initialHearted,
    heartCount: initialHeartCount,
  })

  const hearted = state.hearted
  const count = Math.max(0, state.heartCount)

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          aria-pressed={hearted}
          aria-label={hearted ? `Bỏ tim lời chúc (${count} tim)` : `Gửi tim cho lời chúc (${count} tim)`}
          className={clsx(
            "hit-area inline-flex min-h-9 items-center gap-2 rounded border px-3 text-sm font-medium transition-colors disabled:opacity-60",
            hearted
              ? "border-primary bg-primary-soft text-primary"
              : "border-border bg-bg text-muted hover:border-primary/40 hover:text-fg"
          )}
        >
          <HeartIcon width={18} height={18} fill={hearted ? "currentColor" : "none"} className="shrink-0" />
          <span className="tabular-nums">{COUNT_FORMAT.format(count)}</span>
          <span className="sr-only">{hearted ? "Đã thả tim" : "Thả tim"}</span>
        </button>
      </form>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
    </div>
  )
}

/**
 * Interactive heart toggle on the Donor Wishes Wall (DOS/Give#320).
 *
 * - Signed-in users toggle their own heart atomically via
 *   `give.toggle_contribution_heart` under `dbAs(session.accessToken)`.
 * - Guests see a plain `<a>` link to `/auth/login?return_path=...` so Next.js
 *   never prefetches the OAuth redirect.
 */
export function WishHeartButton({
  hearted: initialHearted,
  heartCount: initialHeartCount,
  signedIn,
  loginHref,
  action,
}: {
  hearted: boolean
  heartCount: number
  signedIn: boolean
  loginHref: string
  action: (state: WishHeartActionState, formData: FormData) => Promise<WishHeartActionState>
}) {
  const count = Math.max(0, initialHeartCount)

  if (!signedIn) {
    return (
      <a
        href={loginHref}
        aria-label={`Đăng nhập để gửi tim cho lời chúc (${count} tim)`}
        className="hit-area inline-flex min-h-9 items-center gap-2 rounded border border-border bg-bg px-3 text-sm font-medium text-muted transition-colors hover:border-primary/40 hover:text-fg"
      >
        <HeartIcon width={18} height={18} className="shrink-0" />
        <span className="tabular-nums">{COUNT_FORMAT.format(count)}</span>
      </a>
    )
  }

  return (
    <SignedInWishHeartForm
      key={`${String(initialHearted)}:${initialHeartCount}`}
      initialHearted={initialHearted}
      initialHeartCount={initialHeartCount}
      action={action}
    />
  )
}
