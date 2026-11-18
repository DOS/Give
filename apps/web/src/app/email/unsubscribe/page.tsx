import type { Metadata } from "next"

import { Button, ButtonLink } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { isUuid } from "@/lib/ids"

export const metadata: Metadata = {
  title: "Hủy nhận email tổng kết",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

/**
 * The unsubscribe link of Give's notification emails (DOS/Give#254). It asks
 * before unsubscribing, so a link scanner that opens it changes nothing; the
 * form posts to /api/email/unsubscribe, which answers back here.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const token = typeof params.t === "string" && isUuid(params.t) ? params.t : null
  const result = typeof params.result === "string" ? params.result : null

  if (result === "done") {
    return (
      <EmptyState
        level={1}
        title="Đã hủy nhận email tổng kết"
        action={<ButtonLink href="/campaigns">Khám phá chiến dịch</ButtonLink>}
      >
        Give không gửi email tổng kết chiến dịch tới địa chỉ này nữa. Email giao dịch (biên nhận, yêu cầu thanh toán,
        quyết định kiểm duyệt) vẫn được gửi.
      </EmptyState>
    )
  }
  if (result === "error" && token) {
    return (
      <EmptyState
        level={1}
        title="Chưa hủy được"
        action={
          <form method="post" action="/api/email/unsubscribe">
            <input type="hidden" name="t" value={token} />
            <Button type="submit">Thử lại</Button>
          </form>
        }
      >
        Give tạm thời chưa xử lý được yêu cầu. Hãy thử lại sau ít phút.
      </EmptyState>
    )
  }
  if (!token) {
    return (
      <EmptyState
        level={1}
        title="Đường dẫn hủy đăng ký không hợp lệ"
        action={<ButtonLink href="/campaigns">Khám phá chiến dịch</ButtonLink>}
      >
        Hãy mở lại đường dẫn &ldquo;Hủy đăng ký&rdquo; trong email bạn nhận được từ Give.
      </EmptyState>
    )
  }
  return (
    <EmptyState
      level={1}
      title="Hủy nhận email tổng kết?"
      action={
        <form method="post" action="/api/email/unsubscribe">
          <input type="hidden" name="t" value={token} />
          <Button type="submit">Hủy nhận email tổng kết</Button>
        </form>
      }
    >
      Give sẽ không gửi email tổng kết chiến dịch tới địa chỉ đã nhận email này nữa. Email giao dịch (biên nhận, yêu cầu
      thanh toán, quyết định kiểm duyệt) vẫn được gửi.
    </EmptyState>
  )
}
