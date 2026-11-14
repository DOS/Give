import { describe, expect, it } from "vitest"

import { formatVnd } from "@/lib/format"
import { fakeDb, op, type Call } from "@/test/fake-db"

import {
  countUnreadNotices,
  describeNotice,
  listNotices,
  NOTICE_PAGE_SIZE,
  stoppedNoticeCampaigns,
  unreadBadge,
  type Notice,
} from "./notices"

const USER = "11111111-1111-4111-8111-111111111111"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asDb = (db: ReturnType<typeof fakeDb>) => db as any

function notice(overrides: Partial<Notice> = {}): Notice {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    kind: "explain_spending",
    campaign_id: CAMPAIGN,
    payload: {},
    created_at: "2026-11-02T02:00:00Z",
    read_at: null,
    ...overrides,
  }
}

describe("listNotices", () => {
  it("reads the user's notices newest first, without the dedupe key", async () => {
    const calls: Call[] = []
    const rows = [notice(), notice({ id: "44444444-4444-4444-8444-444444444444", read_at: "2026-11-02T03:00:00Z" })]
    const db = fakeDb((call) => (call.target === "notices" ? { data: rows } : undefined), calls)
    expect(await listNotices(asDb(db), USER)).toEqual(rows)
    const [call] = calls
    expect(op(call, "select")?.[0]).not.toContain("dedupe_key")
    expect(op(call, "eq")).toEqual(["user_id", USER])
    expect(op(call, "order")).toEqual(["created_at", { ascending: false }])
    expect(op(call, "limit")).toEqual([NOTICE_PAGE_SIZE])
  })

  it("throws a database error to the error page", async () => {
    const db = fakeDb(() => ({ error: { code: "PGRST301", message: "JWT expired" } }))
    await expect(listNotices(asDb(db), USER)).rejects.toMatchObject({ code: "PGRST301" })
  })
})

describe("stoppedNoticeCampaigns (DOS/Give#93)", () => {
  const OTHER = "55555555-5555-4555-8555-555555555555"

  it("does not query campaigns when no notice asks the user to pay", async () => {
    const calls: Call[] = []
    const db = fakeDb(() => ({ data: [] }), calls)
    const stopped = await stoppedNoticeCampaigns(asDb(db), [
      notice({ kind: "explain_spending" }),
      notice({ kind: "payment_requests_stopped", payload: { reference_code: "GVAB12CD" } }),
      notice({ kind: "payment_requests_resumed", payload: { campaign_slug: "den-ngu" } }),
      notice({ kind: "payment_due", campaign_id: null }),
    ])
    expect(stopped.size).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it("looks up unique campaigns of payment notices with public columns only and returns stopped ones", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      () => ({
        data: [
          { id: CAMPAIGN, payments_stopped_at: "2026-11-05T00:00:00Z" },
          { id: OTHER, payments_stopped_at: null },
        ],
      }),
      calls
    )
    const stopped = await stoppedNoticeCampaigns(asDb(db), [
      notice({ kind: "payment_due", campaign_id: CAMPAIGN }),
      notice({ kind: "payment_reminder", campaign_id: CAMPAIGN }),
      notice({ kind: "payment_requests_resumed", campaign_id: OTHER, payload: { reference_code: "GVAB12CD" } }),
    ])
    expect([...stopped]).toEqual([CAMPAIGN])
    expect(calls).toHaveLength(1)
    expect(calls[0].target).toBe("campaigns")
    expect(op(calls[0], "select")).toEqual(["id, payments_stopped_at"])
    expect(op(calls[0], "in")).toEqual(["id", [CAMPAIGN, OTHER]])
  })

  it("propagates database errors so stopped campaigns never fall back to 'pay'", async () => {
    const db = fakeDb(() => ({ error: { code: "42501", message: "denied" } }))
    await expect(stoppedNoticeCampaigns(asDb(db), [notice({ kind: "payment_due" })])).rejects.toMatchObject({
      code: "42501",
    })
  })
})

describe("countUnreadNotices", () => {
  it("counts unread notices with a head request", async () => {
    const calls: Call[] = []
    const db = fakeDb(() => ({ count: 4 }), calls)
    expect(await countUnreadNotices(asDb(db), USER)).toBe(4)
    expect(op(calls[0], "select")).toEqual(["id", { count: "exact", head: true }])
    expect(op(calls[0], "eq")).toEqual(["user_id", USER])
    expect(op(calls[0], "is")).toEqual(["read_at", null])
  })

  it("is 0 on any error, so the header never breaks a page", async () => {
    const db = fakeDb(() => ({ error: { code: "PGRST205", message: "Could not find the table give.notices" } }))
    expect(await countUnreadNotices(asDb(db), USER)).toBe(0)
  })
})

describe("unreadBadge", () => {
  it.each([
    [0, null],
    [1, "1"],
    [9, "9"],
    [10, "9+"],
  ])("%i unread -> %s", (n, badge) => {
    expect(unreadBadge(n)).toBe(badge)
  })
})

describe("describeNotice", () => {
  it("asks the organizer to explain spending and links to the campaign's disbursements", () => {
    const view = describeNotice(
      notice({
        payload: { campaign_title: "Quỹ học bổng", unexplained_count: 2, unexplained_amount: 350000, overdue_count: 1 },
      })
    )
    expect(view.title).toBe("Cần giải trình khoản chi")
    expect(view.body).toContain("2 khoản chi của chiến dịch “Quỹ học bổng” chưa được giải trình")
    expect(view.body).toMatch(/350\.000/)
    expect(view.body).toContain("1 khoản đã quá 7 ngày.")
    expect(view.href).toBe(`/me/campaigns/${CAMPAIGN}/disbursements`)
  })

  it("does not mention overdue spending when there is none, and tolerates a sparse payload", () => {
    const view = describeNotice(notice({ payload: { unexplained_count: "2", overdue_count: 0 } }))
    expect(view.body).toContain("Có khoản chi của chiến dịch của bạn chưa được giải trình.")
    expect(view.body).not.toContain("quá 7 ngày")
  })

  it("links a payment notice to the backer's pledge page with the amount still due", () => {
    // Payload of give.pledge_notice_payload (DOS-Me 20261105150000).
    const payload = {
      campaign_title: "Đèn ngủ gỗ",
      reference_code: "GVAB12CD",
      intended_amount: 500_000,
      received_amount: 200_000,
      payment_due_at: "2026-11-09T03:00:00Z",
    }
    const due = describeNotice(notice({ kind: "payment_due", payload }))
    expect(due.title).toBe("Đến hạn thanh toán cam kết")
    expect(due.body).toContain("Dự án “Đèn ngủ gỗ” đã đạt mục tiêu")
    expect(due.body).toContain(formatVnd(300_000))
    expect(due.body).toContain("09/11/2026")
    expect(due.href).toBe("/me/pledges/GVAB12CD")

    const reminder = describeNotice(
      notice({ kind: "payment_reminder", payload: { ...payload, amount_due: 100_000, day: 3 } })
    )
    expect(reminder.title).toBe("Nhắc thanh toán cam kết")
    expect(reminder.body).toContain(formatVnd(100_000))
    expect(reminder.body).toContain("đừng chuyển lại")
    expect(due.body).not.toContain("đừng chuyển lại")
    expect(describeNotice(notice({ kind: "payment_reminder", payload: {} })).href).toBeNull()
    expect(describeNotice(notice({ kind: "payment_due", payload: { reference_code: "../x" } })).href).toBeNull()
  })

  it("covers the end of a pledge: cancelled, lapsed, refund due and refund owed", () => {
    const payload = {
      campaign_title: "Đèn",
      reference_code: "GVAB12CD",
      received_amount: 150_000,
      refund_due_at: "2026-11-20T00:00:00Z",
    }
    const failed = describeNotice(
      notice({ kind: "pledge_cancelled", payload: { ...payload, reason: "campaign_failed" } })
    )
    expect(failed.body).toContain("không đạt mục tiêu")
    expect(failed.body).toContain("không phải trả tiền")
    expect(
      describeNotice(notice({ kind: "pledge_cancelled", payload: { reason: "campaign_cancelled" } })).body
    ).toContain("đã bị hủy")
    expect(describeNotice(notice({ kind: "pledge_lapsed", payload })).href).toBe("/me/pledges/GVAB12CD")

    const refund = describeNotice(notice({ kind: "refund_due", payload }))
    expect(refund.body).toContain(formatVnd(150_000))
    expect(refund.body).toContain("20/11/2026")

    const owed = describeNotice(notice({ kind: "refund_owed", payload }))
    expect(owed.title).toBe("Cần hoàn tiền cho người ủng hộ")
    expect(owed.body).toContain("mã GVAB12CD")
    expect(owed.href).toBe(`/me/campaigns/${notice({}).campaign_id}/disbursements`)
  })

  it("words refunds net of what was already refunded, and an overpayment (DOS/Give#89)", () => {
    const payload = {
      campaign_title: "Đèn",
      reference_code: "GVAB12CD",
      received_amount: 150_000,
      refunded_amount: 50_000,
      refund_amount: 100_000,
      reason: "pledge_ended",
      refund_due_at: "2026-11-20T00:00:00Z",
    }
    const refund = describeNotice(notice({ kind: "refund_due", payload }))
    expect(refund.body).toContain(formatVnd(100_000))
    expect(refund.body).not.toContain(formatVnd(150_000))
    const owed = describeNotice(notice({ kind: "refund_owed", payload }))
    expect(owed.body).toContain(formatVnd(100_000))
    expect(owed.body).toContain("không còn hiệu lực")

    const over = describeNotice(
      notice({
        kind: "refund_owed",
        payload: { ...payload, reason: "overpaid", refund_amount: 60_000, refund_due_at: null },
      })
    )
    expect(over.body).toContain("đã chuyển nhiều hơn số cam kết")
    expect(over.body).toContain(`phần thừa ${formatVnd(60_000)}`)
    expect(over.body).not.toContain("không còn hiệu lực")
    expect(over.href).toBe(`/me/campaigns/${CAMPAIGN}/disbursements`)

    const reminder = describeNotice(
      notice({
        kind: "payment_reminder",
        payload: { intended_amount: 200_000, received_amount: 100_000, refunded_amount: 50_000 },
      })
    )
    expect(reminder.body).toContain(formatVnd(150_000))
  })

  it("covers a stop and a resume of payment requests (DOS/Give#89)", () => {
    const base = { campaign_title: "Đèn", campaign_slug: "den-ngu", public_note: "Give đang xác minh." }
    const backer = describeNotice(
      notice({ kind: "payment_requests_stopped", payload: { ...base, reference_code: "GVAB12CD" } })
    )
    expect(backer.title).toBe("Tạm dừng yêu cầu thanh toán")
    expect(backer.body).toContain("Đừng chuyển tiền")
    expect(backer.body).toContain("Ghi chú của Give: Give đang xác minh.")
    expect(backer.href).toBe("/me/pledges/GVAB12CD")
    const withDue = describeNotice(
      notice({
        kind: "payment_requests_stopped",
        payload: { ...base, reference_code: "GVAB12CD", payment_due_at: "2026-11-12T05:00:00Z" },
      })
    )
    expect(withDue.body).toContain("không tính vào hạn thanh toán")
    expect(withDue.body).toContain("lùi thêm đúng số ngày đã tạm dừng")

    const creator = describeNotice(notice({ kind: "payment_requests_stopped", payload: base }))
    expect(creator.body).toContain("trang thanh toán đã ẩn")
    expect(creator.href).toBe("/campaigns/den-ngu")
    expect(
      describeNotice(notice({ kind: "payment_requests_stopped", payload: { campaign_slug: "../x" } })).href
    ).toBeNull()

    const resumed = describeNotice(
      notice({
        kind: "payment_requests_resumed",
        payload: { ...base, reference_code: "GVAB12CD", payment_due_at: "2026-11-12T05:00:00Z" },
      })
    )
    expect(resumed.title).toBe("Mở lại yêu cầu thanh toán")
    expect(resumed.body).toContain("12/11/2026")
    expect(resumed.body).toContain("lùi thêm đúng thời gian tạm dừng")
    expect(resumed.href).toBe("/me/pledges/GVAB12CD")
    const creatorResumed = describeNotice(notice({ kind: "payment_requests_resumed", payload: base }))
    expect(creatorResumed.body).toContain("thấy lại thông tin chuyển khoản")
    expect(creatorResumed.href).toBe("/campaigns/den-ngu")
    expect(creatorResumed.linkLabel).toBe("Xem dự án")
  })

  it("renders older payment notices neutrally while payment requests are stopped (DOS/Give#93)", () => {
    const payload = {
      campaign_title: "Đèn ngủ gỗ",
      reference_code: "GVAB12CD",
      intended_amount: 500_000,
      received_amount: 200_000,
      amount_due: 300_000,
      payment_due_at: "2026-11-09T03:00:00Z",
    }

    const due = describeNotice(notice({ kind: "payment_due", payload }), { paymentRequestsStopped: true })
    expect(due.title).toBe("Yêu cầu thanh toán đang tạm dừng")
    expect(due.body).toContain("Give đang tạm dừng yêu cầu thanh toán của dự án “Đèn ngủ gỗ”.")
    expect(due.body).toContain("đến hạn thanh toán")
    expect(due.body).not.toContain("Hãy thanh toán")
    expect(due.body).not.toContain(formatVnd(300_000))
    expect(due.body).not.toContain("09/11/2026")
    expect(due.href).toBe("/me/pledges/GVAB12CD")
    expect(due.linkLabel).toBe("Xem cam kết")

    const reminder = describeNotice(notice({ kind: "payment_reminder", payload }), { paymentRequestsStopped: true })
    expect(reminder.title).toBe("Yêu cầu thanh toán đang tạm dừng")
    expect(reminder.body).toContain("Give đang tạm dừng yêu cầu thanh toán của dự án “Đèn ngủ gỗ”.")
    expect(reminder.body).toContain("nhắc thanh toán")
    expect(reminder.body).not.toContain("Hãy thanh toán")
    expect(reminder.href).toBe("/me/pledges/GVAB12CD")
    expect(reminder.linkLabel).toBe("Xem cam kết")

    const resumedBeforeSecondStop = describeNotice(notice({ kind: "payment_requests_resumed", payload }), {
      paymentRequestsStopped: true,
    })
    expect(resumedBeforeSecondStop.title).toBe("Yêu cầu thanh toán đang tạm dừng")
    expect(resumedBeforeSecondStop.body).toContain("Give đang tạm dừng yêu cầu thanh toán")
    expect(resumedBeforeSecondStop.body).not.toContain("Hãy thanh toán")
    expect(resumedBeforeSecondStop.linkLabel).toBe("Xem cam kết")

    // Without a valid pledge code, no link is offered even while stopped.
    expect(
      describeNotice(notice({ kind: "payment_reminder", payload: {} }), { paymentRequestsStopped: true })
    ).toMatchObject({
      href: null,
      linkLabel: null,
    })

    // Once resumed (paymentRequestsStopped: false), the original payment wording returns.
    const active = describeNotice(notice({ kind: "payment_reminder", payload }), { paymentRequestsStopped: false })
    expect(active.body).toContain("Hãy thanh toán")
    expect(active.linkLabel).toBe("Thanh toán ngay")
  })

  it("covers account review results", () => {
    expect(describeNotice(notice({ kind: "account_verified", campaign_id: null })).href).toBe("/me/accounts")
    expect(describeNotice(notice({ kind: "account_rejected", payload: { reason: "Sai tên" } })).body).toContain(
      "Lý do: Sai tên"
    )
  })

  it("shows a generic notice for a kind this app does not know yet", () => {
    expect(describeNotice(notice({ kind: "something_new" })).title).toBe("Thông báo")
  })
})
