import type { Metadata } from "next"

import { Button, ButtonLink } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { formatVnd } from "@/lib/format"
import { STOP_TOKEN_PARAM } from "@/lib/plans"
import { SLUG_PATTERN } from "@/lib/slug"
import { dbService } from "@/lib/supabase"
import { byteaHex, verifiedStopTokenHash } from "@/server/plans/stop-link"

export const metadata: Metadata = {
  title: "Dừng ủng hộ hằng tháng",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

/**
 * The stop link of monthly plan reminders (DOS/Give#276, design 4.3.4). No
 * sign-in. Opening it only reads (give.plan_stop_token_status) and asks
 * before stopping, so a link scanner that opens it changes nothing; the form
 * posts to /api/plans/stop, which answers back here with ?result=. A link
 * whose signature does not check out never reaches the database.
 */

interface TokenStatus {
  state: "active" | "stopped" | "expired" | "invalid"
  campaign_title: string | null
  campaign_slug: string | null
  amount: number | null
}

const STATES = new Set<TokenStatus["state"]>(["active", "stopped", "expired", "invalid"])

/** The link's status, or null when the database could not be read. */
async function tokenStatus(hash: string): Promise<TokenStatus | null> {
  const { data, error } = await dbService().rpc("plan_stop_token_status", { p_token_hash: byteaHex(hash) })
  if (error) {
    console.error("plan_stop_token_status failed", error.code, error.message)
    return null
  }
  const row = (Array.isArray(data) ? data[0] : data) as Partial<TokenStatus> | null | undefined
  const state = row?.state && STATES.has(row.state) ? row.state : "invalid"
  const amount = Number(row?.amount)
  return {
    state,
    campaign_title: typeof row?.campaign_title === "string" && row.campaign_title.trim() ? row.campaign_title : null,
    campaign_slug:
      typeof row?.campaign_slug === "string" && SLUG_PATTERN.test(row.campaign_slug) ? row.campaign_slug : null,
    amount: Number.isSafeInteger(amount) && amount > 0 ? amount : null,
  }
}

/** " cho chiến dịch “…”", or nothing when the title is unknown. */
function forCampaign(status: TokenStatus | null): string {
  return status?.campaign_title ? ` cho chiến dịch “${status.campaign_title}”` : ""
}

function StopForm({ token, label }: { token: string; label: string }) {
  return (
    <form method="post" action="/api/plans/stop">
      <input type="hidden" name={STOP_TOKEN_PARAM} value={token} />
      <Button type="submit">{label}</Button>
    </form>
  )
}

const contributionsLink = <ButtonLink href="/me/contributions">Mở trang Ủng hộ của tôi</ButtonLink>

function Invalid() {
  return (
    <EmptyState level={1} title="Đường dẫn không hợp lệ" action={contributionsLink}>
      Hãy mở lại đường dẫn &ldquo;Dừng ủng hộ hằng tháng&rdquo; trong email nhắc mới nhất của Give, hoặc đăng nhập và
      dừng kế hoạch ở trang Ủng hộ của tôi.
    </EmptyState>
  )
}

function Expired() {
  return (
    <EmptyState level={1} title="Đường dẫn đã hết hạn" action={contributionsLink}>
      Đường dẫn dừng trong email chỉ dùng được trong 60 ngày. Hãy đăng nhập Give và dừng kế hoạch ở trang Ủng hộ của
      tôi.
    </EmptyState>
  )
}

export default async function PlanStopPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const raw = params[STOP_TOKEN_PARAM]
  const token = typeof raw === "string" ? raw : null
  const result = typeof params.result === "string" ? params.result : null

  if (result === "done") {
    return (
      <EmptyState
        level={1}
        title="Đã dừng ủng hộ hằng tháng"
        action={<ButtonLink href="/campaigns">Khám phá chiến dịch</ButtonLink>}
      >
        Give sẽ không tạo mã ủng hộ mới và không nhắc bạn cho kế hoạch này nữa. Nếu bạn đã lưu mẫu chuyển tiền trong app
        ngân hàng, hãy xóa mẫu đó.
      </EmptyState>
    )
  }
  if (result === "expired") return <Expired />
  if (result === "invalid") return <Invalid />

  const hash = verifiedStopTokenHash(token)
  if (!token || !hash) return <Invalid />

  if (result === "error") {
    return (
      <EmptyState level={1} title="Chưa dừng được" action={<StopForm token={token} label="Thử lại" />}>
        Give tạm thời chưa xử lý được yêu cầu. Hãy thử lại sau ít phút.
      </EmptyState>
    )
  }

  const status = await tokenStatus(hash)
  if (status?.state === "invalid") return <Invalid />
  if (status?.state === "expired") return <Expired />
  if (status?.state === "stopped") {
    return (
      <EmptyState
        level={1}
        title="Kế hoạch đã dừng"
        action={
          status.campaign_slug ? (
            <ButtonLink href={`/campaigns/${status.campaign_slug}`}>Xem trang chiến dịch</ButtonLink>
          ) : (
            <ButtonLink href="/campaigns">Khám phá chiến dịch</ButtonLink>
          )
        }
      >
        Kế hoạch ủng hộ hằng tháng{forCampaign(status)} đã dừng. Give không tạo mã mới và không nhắc bạn nữa.
      </EmptyState>
    )
  }
  // Active, or the status could not be read: the POST checks the token again.
  return (
    <EmptyState
      level={1}
      title="Dừng ủng hộ hằng tháng?"
      action={<StopForm token={token} label="Dừng ủng hộ hằng tháng" />}
    >
      {status?.amount
        ? `Bạn đang ủng hộ ${formatVnd(status.amount)} mỗi tháng${forCampaign(status)}.`
        : `Bạn đang ủng hộ hằng tháng${forCampaign(status)}.`}{" "}
      Sau khi dừng, Give không tạo mã ủng hộ mới và không nhắc bạn nữa; các khoản bạn đã ủng hộ vẫn giữ nguyên.
    </EmptyState>
  )
}
