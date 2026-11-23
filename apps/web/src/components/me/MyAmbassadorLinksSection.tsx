"use client"

import Link from "next/link"
import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react"

import type { AmbassadorLeaderboardToggleState } from "@/app/me/actions"
import { StatusBadge } from "@/components/badges"
import { Badge } from "@/components/ui/Badge"
import { buttonClass, ButtonLink } from "@/components/ui/Button"
import { CheckIcon, ShareIcon } from "@/components/ui/icons"
import { ambassadorLinkPath, type MyAmbassadorLink } from "@/lib/ambassadors"
import { formatVnd } from "@/lib/format"

const noSubscribe = () => () => {}
const COUNT = new Intl.NumberFormat("vi-VN")

type ToggleLeaderboardAction = (
  state: AmbassadorLeaderboardToggleState,
  form: FormData
) => Promise<AmbassadorLeaderboardToggleState>

const noopToggleAction: ToggleLeaderboardAction = async (state) => state

function AmbassadorLinkItem({
  item,
  origin,
  copied,
  failed,
  onCopy,
  toggleLeaderboardAction,
}: {
  item: MyAmbassadorLink
  origin: string
  copied: boolean
  failed: boolean
  onCopy: (slug: string, refCode: string) => void
  toggleLeaderboardAction?: ToggleLeaderboardAction
}) {
  const [toggleState, formAction, pending] = useActionState<AmbassadorLeaderboardToggleState, FormData>(
    toggleLeaderboardAction ?? noopToggleAction,
    {}
  )
  const [syncState, setSyncState] = useState<{
    propValue: boolean
    supersededResult: AmbassadorLeaderboardToggleState | null
  }>({
    propValue: item.show_on_leaderboard,
    supersededResult: null,
  })

  if (syncState.propValue !== item.show_on_leaderboard) {
    setSyncState({
      propValue: item.show_on_leaderboard,
      supersededResult:
        toggleState.showOnLeaderboard !== undefined && toggleState.showOnLeaderboard !== item.show_on_leaderboard
          ? toggleState
          : null,
    })
  }

  const activeState = syncState.supersededResult === toggleState ? null : toggleState
  const showOnLeaderboard =
    toggleLeaderboardAction && activeState?.showOnLeaderboard !== undefined
      ? activeState.showOnLeaderboard
      : item.show_on_leaderboard
  const path = ambassadorLinkPath(item.campaign_slug, item.ref_code)
  const fullUrl = `${origin}${path}`

  return (
    <li className="space-y-3 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/campaigns/${encodeURIComponent(item.campaign_slug)}`}
            className="font-semibold break-words text-fg underline-offset-4 hover:text-primary hover:underline"
          >
            {item.campaign_title}
          </Link>
          <p className="mt-1 text-sm text-muted">
            Tên hiển thị: <span className="text-fg">{item.display_name}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={item.campaign_status} />
          <Badge tone={showOnLeaderboard ? "brand" : "neutral"}>
            {showOnLeaderboard ? "Hiện trên bảng lan tỏa" : "Ẩn khỏi bảng lan tỏa"}
          </Badge>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-4 rounded-md bg-surface p-3">
        <div className="min-w-0">
          <dt className="text-sm text-muted">Lượt đã đối soát</dt>
          <dd className="mt-1 font-bold text-fg tabular-nums">{COUNT.format(item.matched_count)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-sm text-muted">Tổng đã lan tỏa</dt>
          <dd className="mt-1 font-bold text-fg tabular-nums">{formatVnd(item.matched_total_vnd)}</dd>
        </div>
      </dl>

      <div className="space-y-3">
        <p className="text-sm break-all text-muted">{fullUrl}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onCopy(item.campaign_slug, item.ref_code)}
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            {copied ? <CheckIcon /> : <ShareIcon />}
            {copied ? "Đã sao chép" : "Sao chép liên kết"}
          </button>
          {toggleLeaderboardAction && (
            <form action={formAction}>
              <input type="hidden" name="campaign_id" value={item.campaign_id} />
              <input type="hidden" name="campaign_slug" value={item.campaign_slug} />
              <input type="hidden" name="show_on_leaderboard" value={showOnLeaderboard ? "false" : "true"} />
              <button type="submit" disabled={pending} className={buttonClass({ variant: "secondary", size: "sm" })}>
                {pending ? "Đang lưu…" : showOnLeaderboard ? "Ẩn khỏi bảng xếp hạng" : "Hiện trên bảng xếp hạng"}
                <span className="sr-only"> cho {item.campaign_title}</span>
              </button>
            </form>
          )}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {copied
          ? `Đã sao chép liên kết đồng hành cho ${item.campaign_title}`
          : failed
            ? "Không chép được tự động. Hãy sao chép đường dẫn ở trên."
            : ""}
      </p>
      {failed && <p className="text-sm text-muted">Không chép được tự động. Hãy sao chép đường dẫn ở trên.</p>}
      {activeState?.error && (
        <p role="alert" className="text-sm text-danger">
          {activeState.error}
        </p>
      )}
      {activeState?.message && !activeState.error && (
        <p role="status" className="text-sm text-primary">
          {activeState.message}
        </p>
      )}
    </li>
  )
}

/**
 * Personal ambassador summary ("Liên kết đồng hành của tôi") on `/me`
 * (DOS/Give#319, #331). Powered by `give.list_my_ambassador_links()` under the
 * signed-in user's own JWT, with per-campaign leaderboard visibility toggle.
 */
export function MyAmbassadorLinksSection({
  links,
  origin: siteOrigin,
  toggleLeaderboardAction,
}: {
  links: readonly MyAmbassadorLink[]
  origin?: string
  toggleLeaderboardAction?: ToggleLeaderboardAction
}) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [copyErrorCode, setCopyErrorCode] = useState<string | null>(null)
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

  const handleCopy = async (slug: string, refCode: string) => {
    const url = `${origin}${ambassadorLinkPath(slug, refCode)}`
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    try {
      await navigator.clipboard.writeText(url)
      if (!mountedRef.current) return
      setCopyErrorCode(null)
      setCopiedCode(refCode)
    } catch {
      if (!mountedRef.current) return
      setCopiedCode(null)
      setCopyErrorCode(refCode)
    }
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setCopiedCode(null)
      setCopyErrorCode(null)
    }, 3000)
  }

  const totalMatchedVnd = links.reduce((sum, item) => sum + item.matched_total_vnd, 0)
  const totalMatchedCount = links.reduce((sum, item) => sum + item.matched_count, 0)

  return (
    <section aria-labelledby="my-ambassador-links-heading" className="max-w-160 border-t border-border pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="my-ambassador-links-heading" className="text-h2">
          Liên kết đồng hành của tôi
        </h2>
        {links.length > 0 && (
          <p className="text-sm text-muted tabular-nums">
            {COUNT.format(totalMatchedCount)} lượt đã đối soát · {formatVnd(totalMatchedVnd)}
          </p>
        )}
      </div>
      <p className="mt-2 max-w-[68ch] text-sm text-muted">
        Các liên kết bạn đã tạo để lan tỏa chiến dịch trên Give. Chỉ tính các khoản đã đối soát thực tế (đã trừ hoàn
        tiền).
      </p>

      {links.length === 0 ? (
        <div className="mt-6 rounded-md bg-surface p-6">
          <p className="text-fg">Bạn chưa tạo liên kết đồng hành cho chiến dịch nào.</p>
          <p className="mt-1 text-sm text-muted">
            Mở trang một chiến dịch đang gây quỹ và chọn “Tạo link kêu gọi giúp chiến dịch” để nhận liên kết chia sẻ.
          </p>
          <div className="mt-4">
            <ButtonLink href="/campaigns" variant="secondary" size="sm">
              Khám phá chiến dịch
            </ButtonLink>
          </div>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-border card">
          {links.map((item) => (
            <AmbassadorLinkItem
              key={item.ref_code}
              item={item}
              origin={origin}
              copied={copiedCode === item.ref_code}
              failed={copyErrorCode === item.ref_code}
              onCopy={handleCopy}
              toggleLeaderboardAction={toggleLeaderboardAction}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
