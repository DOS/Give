import { describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call } from "@/test/fake-db"

import {
  accountProblemLabel,
  canPostUpdate,
  categoriesFor,
  DEFAULT_DISCOVERY,
  DISCOVERY_MAX_PAGE,
  discoveryHref,
  fundingModelFor,
  isEditableStatus,
  isPublicStatus,
  listPublicCampaigns,
  listWaitingForAccount,
  waitingAdvice,
  normalizeSearch,
  organizerCanCancel,
  parseDiscoveryFilters,
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

describe("parseDiscoveryFilters", () => {
  it("defaults to live campaigns, featured first, page 1", () => {
    expect(parseDiscoveryFilters({})).toEqual(DEFAULT_DISCOVERY)
    expect(DEFAULT_DISCOVERY).toEqual({
      type: null,
      category: null,
      q: null,
      status: "live",
      sort: "featured",
      page: 1,
    })
  })

  it("reads valid filters", () => {
    expect(
      parseDiscoveryFilters({
        type: "back",
        category: "film-video",
        q: "phim",
        status: "ended",
        sort: "near_goal",
        page: "3",
      })
    ).toEqual({ type: "back", category: "film-video", q: "phim", status: "ended", sort: "near_goal", page: 3 })
  })

  it("reads every status and sort", () => {
    for (const status of ["live", "ended", "all"] as const)
      expect(parseDiscoveryFilters({ status }).status).toBe(status)
    for (const sort of ["featured", "newest", "ending", "near_goal"] as const)
      expect(parseDiscoveryFilters({ sort }).sort).toBe(sort)
  })

  it("drops invalid values to their defaults", () => {
    expect(
      parseDiscoveryFilters({
        type: "equity",
        category: "Bad Slug!",
        q: "*",
        status: "soon",
        sort: "random",
        page: "abc",
      })
    ).toEqual(DEFAULT_DISCOVERY)
  })

  it("is strict about case and spelling", () => {
    expect(parseDiscoveryFilters({ status: "LIVE", sort: "Newest" })).toMatchObject({
      status: "live",
      sort: "featured",
    })
    expect(parseDiscoveryFilters({ sort: "near-goal" }).sort).toBe("featured")
    expect(parseDiscoveryFilters({ status: "", sort: "" })).toMatchObject({ status: "live", sort: "featured" })
  })

  it("reads only positive whole page numbers and caps them", () => {
    const page = (value: string) => parseDiscoveryFilters({ page: value }).page
    expect(page("2")).toBe(2)
    expect(page(String(DISCOVERY_MAX_PAGE))).toBe(DISCOVERY_MAX_PAGE)
    expect(page(String(DISCOVERY_MAX_PAGE + 1))).toBe(DISCOVERY_MAX_PAGE)
    expect(page("99999999999999999999999")).toBe(DISCOVERY_MAX_PAGE)
    for (const bad of ["0", "-1", "1.5", "1e3", "02", " 2", "2 ", "", "Infinity", "0x10"]) expect(page(bad)).toBe(1)
  })

  it("takes the first of repeated params", () => {
    expect(
      parseDiscoveryFilters({
        type: ["give", "back"],
        status: ["all", "ended"],
        sort: ["ending", "newest"],
        page: ["2", "5"],
      })
    ).toMatchObject({ type: "give", status: "all", sort: "ending", page: 2 })
  })
})

describe("discoveryHref", () => {
  it("omits empty and default filters", () => {
    expect(discoveryHref({})).toBe("/campaigns")
    expect(discoveryHref({ type: null, category: null, q: null })).toBe("/campaigns")
    expect(discoveryHref(DEFAULT_DISCOVERY)).toBe("/campaigns")
  })

  it("encodes the query", () => {
    expect(discoveryHref({ type: "give", category: "healthcare", q: "lũ lụt" })).toBe(
      "/campaigns?type=give&category=healthcare&q=l%C5%A9+l%E1%BB%A5t"
    )
  })

  it("keeps status, sort and page when they are not the defaults, and appends a hash", () => {
    expect(discoveryHref({ ...DEFAULT_DISCOVERY, status: "ended", sort: "ending", page: 2 }, "chien-dich-25")).toBe(
      "/campaigns?status=ended&sort=ending&page=2#chien-dich-25"
    )
  })

  it("round-trips through parseDiscoveryFilters", () => {
    const filters = {
      type: "back",
      category: "film-video",
      q: "phim ngắn",
      status: "all",
      sort: "near_goal",
      page: 4,
    } as const
    const query = new URL(discoveryHref(filters), "https://give.test").searchParams
    expect(parseDiscoveryFilters(Object.fromEntries(query))).toEqual(filters)
  })
})

describe("listPublicCampaigns", () => {
  const A = "1060c000-0000-4000-8000-000000000001"
  const B = "1060c000-0000-4000-8000-000000000002"
  // The database returns B before A: the page must keep that order.
  const found = (call: Call) =>
    call.target === "rpc:discover_campaigns"
      ? {
          data: [
            { campaign_id: B, total_count: "7" },
            { campaign_id: A, total_count: "7" },
          ],
        }
      : call.target === "campaigns"
        ? {
            data: [
              { id: A, title: "A" },
              { id: B, title: "B" },
            ],
          }
        : undefined

  it("passes the filters, sort and limit to give.discover_campaigns", async () => {
    const log: Call[] = []
    const category = { id: "cat-1", slug: "healthcare" } as Category
    await listPublicCampaigns(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fakeDb(found, log) as any,
      { type: "give", category: "healthcare", q: "tim", status: "ended", sort: "near_goal" },
      [category],
      48
    )
    expect(log[0].target).toBe("rpc:discover_campaigns")
    expect(op(log[0], "args")).toEqual([
      {
        p_status: "ended",
        p_type: "give",
        p_category_id: "cat-1",
        p_search: "tim",
        p_sort: "near_goal",
        p_limit: 48,
      },
    ])
  })

  it("reads 24 by default, with nulls for the filters not set", async () => {
    const log: Call[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await listPublicCampaigns(fakeDb(found, log) as any, DEFAULT_DISCOVERY, [])
    expect(op(log[0], "args")).toEqual([
      { p_status: "live", p_type: null, p_category_id: null, p_search: null, p_sort: "featured", p_limit: 24 },
    ])
  })

  it("returns nothing for an unknown category without asking the database", async () => {
    const log: Call[] = []
    expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await listPublicCampaigns(fakeDb(found, log) as any, { ...DEFAULT_DISCOVERY, category: "no-such" }, [])
    ).toEqual({ campaigns: [], total: 0 })
    expect(log).toHaveLength(0)
  })

  it("reads only the public campaign columns of the returned ids and keeps the database's order and count", async () => {
    const log: Call[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await listPublicCampaigns(fakeDb(found, log) as any, DEFAULT_DISCOVERY, [])
    const read = log.find((c) => c.target === "campaigns")
    const columns = String(op(read, "select")?.[0])
    expect(columns).not.toMatch(/\*|organizer_id|review_note|organizers/)
    expect(op(read, "in")).toEqual(["id", [B, A]])
    expect(page.total).toBe(7)
    expect(page.campaigns.map((c) => c.id)).toEqual([B, A])
  })

  it("drops an id whose row is no longer readable", async () => {
    const db = fakeDb((call) => (call.target === "campaigns" ? { data: [{ id: A, title: "A" }] } : found(call)))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await listPublicCampaigns(db as any, DEFAULT_DISCOVERY, [])
    expect(page.campaigns.map((c) => c.id)).toEqual([A])
    expect(page.total).toBe(7)
  })

  it("adds each campaign's organizer from one public_campaign_organizers call, with the public card fields only", async () => {
    const log: Call[] = []
    const db = fakeDb((call) => {
      if (call.target === "rpc:public_campaign_organizers")
        return {
          data: [
            {
              campaign_id: A,
              display_name: "Quỹ Ánh Sáng",
              kind: "organization",
              verification_status: "verified",
              // Anything else the RPC might return must not reach the page.
              legal_name: "Pháp nhân",
              phone: "0900000001",
              user_id: "u-1",
            },
          ],
        }
      return found(call)
    }, log)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await listPublicCampaigns(db as any, DEFAULT_DISCOVERY, [])
    expect(log.map((c) => c.target)).toEqual(["rpc:discover_campaigns", "campaigns", "rpc:public_campaign_organizers"])
    expect(op(log[2], "args")).toEqual([{ p_campaign_ids: [B, A] }])
    expect(page.campaigns).toEqual([
      { id: B, title: "B", organizer: null },
      {
        id: A,
        title: "A",
        organizer: { display_name: "Quỹ Ánh Sáng", kind: "organization", verification_status: "verified" },
      },
    ])
  })

  it("reads rows and organizers 100 ids at a time", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `1060d000-0000-4000-8000-${String(i).padStart(12, "0")}`)
    const log: Call[] = []
    const db = fakeDb((call) => {
      if (call.target === "rpc:discover_campaigns")
        return { data: ids.map((id) => ({ campaign_id: id, total_count: 101 })) }
      if (call.target === "campaigns") return { data: (op(call, "in")?.[1] as string[]).map((id) => ({ id })) }
      const asked = (op(call, "args")?.[0] as { p_campaign_ids: string[] }).p_campaign_ids
      return {
        data: asked.map((id) => ({
          campaign_id: id,
          display_name: "X",
          kind: "individual",
          verification_status: "verified",
        })),
      }
    }, log)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await listPublicCampaigns(db as any, DEFAULT_DISCOVERY, [], 101)
    expect(log.filter((c) => c.target === "campaigns").map((c) => op(c, "in")?.[1])).toEqual([
      ids.slice(0, 100),
      ids.slice(100),
    ])
    const calls = log.filter((c) => c.target === "rpc:public_campaign_organizers")
    expect(calls.map((c) => (op(c, "args")?.[0] as { p_campaign_ids: string[] }).p_campaign_ids)).toEqual([
      ids.slice(0, 100),
      ids.slice(100),
    ])
    expect(page.campaigns.map((c) => c.id)).toEqual(ids)
    expect(page.campaigns.every((c) => c.organizer?.display_name === "X")).toBe(true)
  })

  it("skips the other reads when nothing matches", async () => {
    const log: Call[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await listPublicCampaigns(fakeDb(() => ({ data: [] }), log) as any, DEFAULT_DISCOVERY, [])).toEqual({
      campaigns: [],
      total: 0,
    })
    expect(log).toHaveLength(1)
  })

  it("keeps the cards without organizers when the organizer lookup fails, and throws when a list read fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const db = fakeDb((call) =>
      call.target === "rpc:public_campaign_organizers"
        ? { error: { code: "PGRST202", message: "function not found" } }
        : found(call)
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await listPublicCampaigns(db as any, DEFAULT_DISCOVERY, [])
    expect(page.campaigns.map((c) => [c.id, c.organizer])).toEqual([
      [B, null],
      [A, null],
    ])
    expect(error).toHaveBeenCalledOnce()
    error.mockRestore()

    const refused = fakeDb(() => ({ error: { code: "42501", message: "permission denied" } }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(listPublicCampaigns(refused as any, DEFAULT_DISCOVERY, [])).rejects.toMatchObject({ code: "42501" })
    const rowsRefused = fakeDb((call) =>
      call.target === "campaigns" ? { error: { code: "42501", message: "permission denied" } } : found(call)
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(listPublicCampaigns(rowsRefused as any, DEFAULT_DISCOVERY, [])).rejects.toMatchObject({
      code: "42501",
    })
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
  const PAST = "2026-11-01T00:00:00Z"
  const row = (
    account_problem: string,
    overrides: Partial<{ money: boolean; ends_at: string | null; verified: boolean }> = {}
  ) => ({
    account_problem,
    account_has_transactions: overrides.money ?? false,
    ends_at: overrides.ends_at === undefined ? "2026-12-01T00:00:00Z" : overrides.ends_at,
    organizer: { verification_status: overrides.verified === false ? ("pending" as const) : ("verified" as const) },
  })
  const advise = (...args: Parameters<typeof row>) => waitingAdvice(row(...args), now)

  it("sends back to replace an unusable account", () => {
    const disabled = advise("account_not_verified")
    expect(disabled.note).toBeNull()
    expect(disabled.sendBackReason).toBe(
      "Tài khoản nhận tiền đang gắn không còn dùng được. Hãy nhả tài khoản đang gắn, gắn một tài khoản đã xác minh đứng tên pháp lý hiện tại của bạn rồi gửi duyệt lại. Nếu không nhả được tài khoản, hãy liên hệ đội ngũ Give."
    )
    expect(advise("name_mismatch").sendBackReason).toMatch(/^Tên chủ tài khoản nhận tiền đang gắn không còn trùng/)
    expect(advise("something_new").sendBackReason).toContain("Hãy nhả tài khoản đang gắn")
  })

  it("does not send back what heals without the organizer editing", () => {
    const unbound = advise("no_account")
    expect(unbound.sendBackReason).toBeNull()
    expect(unbound.note).toContain("trang sửa chiến dịch")
    for (const problem of ["organizer_not_verified", "account_not_verified", "no_account"]) {
      const unverified = advise(problem, { verified: false })
      expect(unverified.sendBackReason).toBeNull()
      expect(unverified.note).toContain("xác minh lại hồ sơ")
    }
    const money = advise("account_not_verified", { money: true })
    expect(money.sendBackReason).toBeNull()
    expect(money.note).toContain("bộ phận tài chính để mở lại tài khoản")
  })

  it("leaves no way forward for an account with money history and another problem", () => {
    for (const problem of ["name_mismatch", "account_not_owned", "something_new"]) {
      const advice = advise(problem, { money: true })
      expect(advice.sendBackReason).toBeNull()
      expect(advice.note).toContain("quản trị viên hệ thống")
    }
    expect(advise("name_mismatch", { money: true, ends_at: PAST }).note).toContain("sẽ không bao giờ tự mở")
    expect(advise("organizer_not_verified", { money: true, verified: false }).note).toContain("xác minh lại hồ sơ")
  })

  it("sends back a foreign account for staff to release", () => {
    const advice = advise("account_not_owned")
    expect(advice.sendBackReason).toMatch(/^Tài khoản nhận tiền đang gắn không đứng tên bạn\. Hãy chờ đội ngũ Give nhả/)
    expect(advice.note).toContain("nhờ bộ phận tài chính hoặc quản trị viên nhả tài khoản đó")
    expect(advice.sendBackReason).not.toMatch(/rồi .* rồi /)
    const unverified = advise("account_not_owned", { verified: false })
    expect(unverified.sendBackReason).toContain("cần được xác minh lại")
    expect(unverified.note).not.toContain("tự mở")
    expect(advise("account_not_owned", { ends_at: PAST }).sendBackReason).toContain(
      "Hãy sửa ngày kết thúc, chờ đội ngũ Give nhả tài khoản không đứng tên bạn"
    )
  })

  it("does not promise a replaceable account heals by re-verifying the organizer", () => {
    for (const problem of ["account_not_verified", "name_mismatch"]) {
      const advice = advise(problem, { verified: false })
      expect(advice.sendBackReason).toBeNull()
      expect(advice.note).toContain("nếu tài khoản vẫn không dùng được, hãy yêu cầu chỉnh sửa")
      expect(advice.note).not.toContain("tự mở")
    }
    const ended = advise("name_mismatch", { verified: false, ends_at: PAST })
    expect(ended.sendBackReason).toContain("sửa ngày kết thúc")
    expect(ended.note).not.toContain("nếu tài khoản vẫn không dùng được")
    expect(advise("no_account", { verified: false }).note).toContain("chiến dịch tự mở")
  })

  it("trusts the queue when the organizer row already reads verified", () => {
    const advice = advise("organizer_not_verified")
    expect(advice.sendBackReason).toBeNull()
    expect(advice.note).toContain("tài khoản đang gắn dùng được trở lại")
    expect(advise("no_account", { verified: false }).note).toContain("gắn tài khoản trong trang sửa chiến dịch")
    expect(advise("account_not_verified", { verified: false }).note).not.toContain("dùng được trở lại")
  })

  it("always sends back an ended campaign to fix its dates, saying what else it needs", () => {
    const ended = advise("account_not_verified", { ends_at: PAST })
    expect(ended.sendBackReason).toContain("Hãy sửa ngày kết thúc, nhả tài khoản đang gắn")
    expect(ended.sendBackReason).toContain("hủy chiến dịch")
    expect(ended.note).toContain("không tự mở")

    const unverified = advise("organizer_not_verified", { ends_at: PAST, verified: false })
    expect(unverified.sendBackReason).toContain("Hãy sửa ngày kết thúc rồi gửi duyệt lại.")
    expect(unverified.sendBackReason).toContain("cần được xác minh lại")
    expect(unverified.note).toContain("xác minh lại hồ sơ")

    const money = advise("account_not_verified", { ends_at: PAST, money: true })
    expect(money.sendBackReason).toContain("bộ phận tài chính mở lại tài khoản")
    expect(money.sendBackReason).not.toContain("nhả tài khoản đang gắn")
    expect(money.note).toContain("bộ phận tài chính")

    expect(advise("no_account", { ends_at: PAST }).sendBackReason).toContain(
      "Hãy sửa ngày kết thúc, gắn một tài khoản đã xác minh đứng tên bạn rồi gửi duyệt lại."
    )
  })
})
