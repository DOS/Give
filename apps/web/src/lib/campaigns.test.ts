import { describe, expect, it } from "vitest"

import { fakeDb, op, type Call } from "@/test/fake-db"

import {
  accountProblemLabel,
  canPostUpdate,
  categoriesFor,
  discoveryHref,
  fundingModelFor,
  isEditableStatus,
  isPublicStatus,
  listWaitingForAccount,
  waitingAdvice,
  normalizeSearch,
  organizerCanCancel,
  parseDiscoveryFilters,
  searchFilter,
  STATUS_LABELS,
  type CampaignStatus,
  type Category,
} from "./campaigns"

const ALL_STATUSES = Object.keys(STATUS_LABELS) as CampaignStatus[]

describe("status rules", () => {
  it("matches give.is_public_status", () => {
    expect(ALL_STATUSES.filter(isPublicStatus)).toEqual(["live", "settling", "succeeded", "failed", "closed"])
  })

  it("matches give.is_editable_status", () => {
    expect(ALL_STATUSES.filter(isEditableStatus)).toEqual(["draft", "changes_requested"])
  })

  it("lets organizers cancel only before going live (transition_campaign)", () => {
    expect(ALL_STATUSES.filter(organizerCanCancel)).toEqual(["draft", "in_review", "changes_requested", "approved"])
  })

  it("blocks updates on cancelled and suspended campaigns", () => {
    expect(ALL_STATUSES.filter((s) => !canPostUpdate(s))).toEqual(["suspended", "cancelled"])
  })

  it("pairs each type with its funding model", () => {
    expect(fundingModelFor("give")).toBe("flexible")
    expect(fundingModelFor("back")).toBe("all_or_nothing")
  })
})

describe("categoriesFor", () => {
  const category = (slug: string, applies_to: Category["applies_to"]): Category => ({
    id: slug,
    slug,
    name: slug,
    description: null,
    icon: null,
    color: null,
    applies_to,
    sort_order: 0,
  })
  const categories = [category("health", "give"), category("tech", "back"), category("local", "both")]

  it("keeps the type's own categories and shared ones", () => {
    expect(categoriesFor(categories, "give").map((c) => c.slug)).toEqual(["health", "local"])
    expect(categoriesFor(categories, "back").map((c) => c.slug)).toEqual(["tech", "local"])
  })
})

describe("normalizeSearch", () => {
  it("keeps Vietnamese letters and digits", () => {
    expect(normalizeSearch("  Xây trường  2026 ")).toBe("Xây trường 2026")
  })

  it("strips PostgREST and LIKE syntax", () => {
    expect(normalizeSearch('a%b_c,d(e)f."g\\h*')).toBe("a b c d e f g h")
    expect(normalizeSearch("x),id.eq.1")).toBe("x id eq 1")
  })

  it("normalizes decomposed input to NFC", () => {
    expect(normalizeSearch("Lũ")).toBe("Lũ")
  })

  it("rejects searches with fewer than 2 characters left", () => {
    expect(normalizeSearch("")).toBeNull()
    expect(normalizeSearch("%")).toBeNull()
    expect(normalizeSearch("a")).toBeNull()
  })

  it("caps the length at 80", () => {
    expect(normalizeSearch("a".repeat(200))).toHaveLength(80)
  })
})

describe("searchFilter", () => {
  it("quotes both ilike values", () => {
    expect(searchFilter("lũ lụt")).toBe('title.ilike."%lũ lụt%",summary.ilike."%lũ lụt%"')
  })
})

describe("parseDiscoveryFilters", () => {
  it("reads valid filters", () => {
    expect(parseDiscoveryFilters({ type: "back", category: "film-video", q: "phim" })).toEqual({
      type: "back",
      category: "film-video",
      q: "phim",
    })
  })

  it("drops invalid values", () => {
    expect(parseDiscoveryFilters({ type: "equity", category: "Bad Slug!", q: "*" })).toEqual({
      type: null,
      category: null,
      q: null,
    })
  })

  it("takes the first of repeated params", () => {
    expect(parseDiscoveryFilters({ type: ["give", "back"] }).type).toBe("give")
  })
})

describe("discoveryHref", () => {
  it("omits empty filters", () => {
    expect(discoveryHref({})).toBe("/campaigns")
    expect(discoveryHref({ type: null, category: null, q: null })).toBe("/campaigns")
  })

  it("encodes the query", () => {
    expect(discoveryHref({ type: "give", category: "healthcare", q: "lũ lụt" })).toBe(
      "/campaigns?type=give&category=healthcare&q=l%C5%A9+l%E1%BB%A5t"
    )
  })
})

describe("listWaitingForAccount", () => {
  const A = "6a7e64c0-0000-4000-8000-000000000001"
  const B = "6a7e64c0-0000-4000-8000-000000000002"

  it("keeps the database's order and reasons, with the campaign rows from managed_campaigns", async () => {
    const log: Call[] = []
    const db = fakeDb((call) => {
      if (call.target === "rpc:campaigns_waiting_for_account")
        return {
          data: [
            { campaign_id: B, account_problem: "no_account", account_has_transactions: false },
            { campaign_id: A, account_problem: "account_not_verified", account_has_transactions: true },
          ],
        }
      if (call.target === "rpc:managed_campaigns")
        return {
          data: [
            { id: A, title: "A" },
            { id: B, title: "B" },
          ],
        }
    }, log)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = await listWaitingForAccount(db as any)
    expect(list.map((c) => [c.title, c.account_problem, c.account_has_transactions])).toEqual([
      ["B", "no_account", false],
      ["A", "account_not_verified", true],
    ])
    expect(op(log[1], "in")).toEqual(["id", [B, A]])
  })

  it("skips the campaign read when nothing waits, and throws when the database refuses", async () => {
    const log: Call[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await listWaitingForAccount(fakeDb(() => ({ data: [] }), log) as any)).toEqual([])
    expect(log).toHaveLength(1)
    const refused = fakeDb(() => ({ error: { code: "42883", message: "function not found" } }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(listWaitingForAccount(refused as any)).rejects.toMatchObject({ code: "42883" })
  })

  it("labels every reason in Vietnamese, with a fallback for an unknown one", () => {
    expect(accountProblemLabel("organizer_not_verified")).toContain("đặt lại trạng thái xác minh")
    expect(accountProblemLabel("account_not_verified")).toContain("bị bộ phận tài chính khóa")
    expect(accountProblemLabel("name_mismatch")).toContain("không còn trùng tên pháp lý")
    expect(accountProblemLabel("something_new")).toBe("Tài khoản nhận tiền không dùng được.")
  })
})

describe("waitingAdvice", () => {
  const now = new Date("2026-11-10T00:00:00Z")
  const row = (
    account_problem: string,
    overrides: Partial<{ account_has_transactions: boolean; ends_at: string | null; verified: boolean }> = {}
  ) => ({
    account_problem,
    account_has_transactions: overrides.account_has_transactions ?? false,
    ends_at: overrides.ends_at === undefined ? "2026-12-01T00:00:00Z" : overrides.ends_at,
    organizer: { verification_status: overrides.verified === false ? ("pending" as const) : ("verified" as const) },
  })

  it("prefills a send-back reason when the organizer can replace the account", () => {
    const disabled = waitingAdvice(row("account_not_verified"), now)
    expect(disabled.note).toBeNull()
    expect(disabled.sendBackReason).toContain("Hãy nhả tài khoản đó")
    expect(disabled.sendBackReason).toContain("liên hệ đội ngũ Give")
    expect(waitingAdvice(row("name_mismatch"), now).sendBackReason).toContain("tên pháp lý hiện tại")
    expect(waitingAdvice(row("something_new"), now).sendBackReason).toContain("không còn dùng được")
  })

  it("lets the organizer bind in the editor when no account is bound", () => {
    const advice = waitingAdvice(row("no_account"), now)
    expect(advice.sendBackReason).toBeNull()
    expect(advice.note).toContain("trang sửa chiến dịch")
  })

  it("asks to re-verify the organizer before anything else", () => {
    for (const problem of ["organizer_not_verified", "account_not_verified", "no_account"]) {
      const advice = waitingAdvice(row(problem, { verified: false }), now)
      expect(advice.sendBackReason).toBeNull()
      expect(advice.note).toContain("xác minh lại hồ sơ")
    }
  })

  it("sends an ended campaign back to fix its dates, never promising it opens by itself", () => {
    const ended = waitingAdvice(row("account_not_verified", { ends_at: "2026-11-01T00:00:00Z" }), now)
    expect(ended.sendBackReason).toContain("sửa ngày kết thúc")
    expect(ended.note).toBeNull()
    const unverified = waitingAdvice(
      row("organizer_not_verified", { ends_at: "2026-11-01T00:00:00Z", verified: false }),
      now
    )
    expect(unverified.sendBackReason).toContain("sửa ngày kết thúc")
    expect(unverified.note).toContain("không tự mở")
    expect(unverified.note).not.toContain("chiến dịch tự mở")
  })

  it("offers no send-back when the account cannot be released", () => {
    const withMoney = waitingAdvice(row("account_not_verified", { account_has_transactions: true }), now)
    expect(withMoney.sendBackReason).toBeNull()
    expect(withMoney.note).toContain("30 ngày sau khi chiến dịch bị hủy hoặc kết thúc")
    const endedWithMoney = waitingAdvice(
      row("account_not_verified", { account_has_transactions: true, ends_at: "2026-11-01T00:00:00Z" }),
      now
    )
    expect(endedWithMoney.sendBackReason).toBeNull()
    const notOwned = waitingAdvice(row("account_not_owned"), now)
    expect(notOwned.sendBackReason).toBeNull()
    expect(notOwned.note).toContain("không thuộc người tổ chức")
  })
})
