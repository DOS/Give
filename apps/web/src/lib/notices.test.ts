import { describe, expect, it } from "vitest"

import { fakeDb, op, type Call } from "@/test/fake-db"

import { countUnreadNotices, describeNotice, listNotices, NOTICE_PAGE_SIZE, unreadBadge, type Notice } from "./notices"

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

  it("links a payment notice to the donation page of its reference code", () => {
    const view = describeNotice(
      notice({
        kind: "payment_due",
        payload: { amount: 500000, reference_code: "GVAB12CD", due_at: "2026-11-09T00:00:00Z" },
      })
    )
    expect(view.title).toBe("Đến hạn thanh toán cam kết")
    expect(view.body).toContain("09/11/2026")
    expect(view.href).toBe("/donations/GVAB12CD")
    expect(describeNotice(notice({ kind: "payment_reminder", payload: {} })).href).toBeNull()
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
