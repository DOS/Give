"use client"

import { useActionState, useEffect, useId, useRef, useState, useSyncExternalStore } from "react"

import type { AmbassadorActionState } from "@/app/campaigns/[slug]/ambassador-actions"
import { buttonClass } from "@/components/ui/Button"
import { Field } from "@/components/ui/Field"
import { CheckIcon, ShareIcon, UsersIcon } from "@/components/ui/icons"
import { ModalDialog } from "@/components/ui/ModalDialog"
import { AMBASSADOR_NAME_MAX, ambassadorLinkPath, type MyCampaignAmbassador } from "@/lib/ambassadors"
import { trackShareClick } from "@/lib/analytics-client"
import { formatVnd } from "@/lib/format"

const noSubscribe = () => () => {}
const COUNT = new Intl.NumberFormat("vi-VN")

/**
 * "Tạo link kêu gọi giúp chiến dịch" trigger & modal on `/campaigns/[slug]`
 * (DOS/Give#319).
 *
 * - Guests see a clean sign-in link (`/auth/login?return_path=...`).
 * - Signed-in users open a `ModalDialog` to create or update their display name
 *   and leaderboard opt-in (`upsert_my_campaign_ambassador` under user JWT),
 *   copy their shareable `?ref=<code>` link, and review personal net matched stats.
 * - Strictly rendered only on live (not yet ended) or public pre-launch campaigns.
 */
export function AmbassadorLinkModal({
  campaignId,
  slug,
  origin: siteOrigin,
  signedIn,
  loginHref,
  defaultName,
  initialAmbassador,
  action,
}: {
  /** Public live/ended campaign id for aggregate share-click analytics (omitted on pre-launch). */
  campaignId?: string
  slug: string
  origin?: string
  signedIn: boolean
  loginHref: string
  defaultName: string
  initialAmbassador: MyCampaignAmbassador | null
  action: (state: AmbassadorActionState, form: FormData) => Promise<AmbassadorActionState>
}) {
  const [open, setOpen] = useState(false)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const [state, formAction, pending] = useActionState<AmbassadorActionState, FormData>(action, {
    ambassador: initialAmbassador,
  })

  const titleId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  const origin = useSyncExternalStore(
    noSubscribe,
    () => siteOrigin ?? window.location.origin,
    () => siteOrigin ?? ""
  )

  if (!signedIn) {
    return (
      <a href={loginHref} className={buttonClass({ variant: "secondary", full: true })}>
        <UsersIcon />
        Tạo link kêu gọi giúp chiến dịch
      </a>
    )
  }

  const ambassador = state.ambassador
  const sharePath = ambassador ? ambassadorLinkPath(slug, ambassador.ref_code) : null
  const shareUrl = sharePath ? `${origin}${sharePath}` : null

  const handleCopy = async () => {
    if (!shareUrl) return
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    try {
      await navigator.clipboard.writeText(shareUrl)
      if (campaignId) trackShareClick(campaignId)
      if (!mountedRef.current) return
      setCopyStatus("Đã sao chép liên kết kêu gọi.")
    } catch {
      if (!mountedRef.current) return
      setCopyStatus("Không chép được tự động. Hãy chọn và sao chép liên kết ở trên.")
    }
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setCopyStatus(null)
    }, 3000)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setCopyStatus(null)
          setOpen(true)
        }}
        className={buttonClass({ variant: "secondary", full: true })}
      >
        <UsersIcon />
        {ambassador ? "Link kêu gọi của bạn" : "Tạo link kêu gọi giúp chiến dịch"}
      </button>

      <ModalDialog
        open={open}
        onClose={() => setOpen(false)}
        titleId={titleId}
        title={ambassador ? "Link kêu gọi giúp chiến dịch" : "Tạo link kêu gọi giúp chiến dịch"}
        returnFocusRef={triggerRef}
      >
        <p className="mt-2 text-sm text-muted">
          Chia sẻ liên kết riêng của bạn để kêu gọi bạn bè cùng ủng hộ. Tiền vẫn đi thẳng vào tài khoản nhận của chiến
          dịch; Give chỉ ghi nhận các khoản đã đối soát qua liên kết của bạn.
        </p>

        {ambassador && shareUrl && (
          <div className="mt-4 space-y-4 rounded-md bg-surface p-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-fg">Liên kết kêu gọi riêng của bạn</p>
              <p className="rounded bg-bg px-3 py-2 text-sm break-all text-fg">{shareUrl}</p>
              <button
                type="button"
                onClick={handleCopy}
                className={buttonClass({ variant: "secondary", size: "sm", full: true })}
              >
                {copyStatus?.startsWith("Đã") ? <CheckIcon /> : <ShareIcon />}
                Sao chép liên kết
              </button>
              <p className="min-h-5 text-center text-sm text-muted" aria-live="polite">
                {copyStatus}
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4">
              <div className="min-w-0">
                <dt className="text-sm text-muted">Lượt đã đối soát</dt>
                <dd className="mt-1 text-lg font-bold text-fg tabular-nums">
                  {COUNT.format(ambassador.matched_count)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-sm text-muted">Tổng đã lan tỏa</dt>
                <dd className="mt-1 text-lg font-bold text-fg tabular-nums">
                  {formatVnd(ambassador.matched_total_vnd)}
                </dd>
              </div>
            </dl>
          </div>
        )}

        <form action={formAction} className="mt-6 space-y-6">
          <Field
            htmlFor="ambassador-display-name"
            label="Tên hiển thị khi lan tỏa"
            hintId="ambassador-display-name-hint"
            hint="Tên này hiển thị khi có người mở liên kết của bạn và trên bảng Người đồng hành lan tỏa nếu bạn đồng ý."
          >
            <input
              key={ambassador?.display_name ?? defaultName}
              id="ambassador-display-name"
              name="display_name"
              required
              maxLength={AMBASSADOR_NAME_MAX}
              defaultValue={ambassador?.display_name ?? defaultName}
              aria-describedby="ambassador-display-name-hint"
              placeholder="Ví dụ: CLB Sinh viên Xanh hoặc tên của bạn"
              className="field"
            />
          </Field>

          <div>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
              <input
                key={String(ambassador ? ambassador.show_on_leaderboard : true)}
                type="checkbox"
                name="show_on_leaderboard"
                defaultChecked={ambassador ? ambassador.show_on_leaderboard : true}
                aria-describedby="ambassador-leaderboard-hint"
                className="mt-1 size-5 shrink-0 accent-primary"
              />
              <span className="text-sm font-medium text-fg">Hiển thị trên bảng “Người đồng hành lan tỏa”</span>
            </label>
            <p id="ambassador-leaderboard-hint" className="hint">
              Chỉ hiện tên hiển thị, số lượt và tổng tiền đã đối soát. Email và thông tin cá nhân luôn được giữ kín.
            </p>
          </div>

          {state.error && (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {state.error}
            </p>
          )}
          {state.message && !state.error && (
            <p role="status" className="rounded-md bg-primary-soft px-3 py-2 text-sm text-primary">
              {state.message}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className={buttonClass({ variant: "primary", size: "md", full: true })}
          >
            {pending ? "Đang lưu…" : ambassador ? "Lưu thay đổi" : "Tạo liên kết của tôi"}
          </button>
        </form>
      </ModalDialog>
    </>
  )
}
