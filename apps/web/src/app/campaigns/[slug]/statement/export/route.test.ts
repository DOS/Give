import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { CampaignStatus } from "@/lib/campaigns"
import {
  STATEMENT_CSV_HEADERS,
  STATEMENT_EXPORT_MAX_ROWS,
  STATEMENT_PAGE_SIZE,
  type StatementRow,
} from "@/lib/statement"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const CAMPAIGN_ID = "22222222-2222-4222-8222-222222222222"
const SLUG = "xay-truong-ban-may"

const state = vi.hoisted(() => ({
  anonHandler: (() => undefined) as Handler,
  anonCalls: [] as Call[],
  dbAsTokens: [] as (string | undefined)[],
  dbServiceCalls: 0,
}))

vi.mock("@/lib/supabase", () => ({
  dbAs: (token?: string) => {
    state.dbAsTokens.push(token)
    return fakeDb((call) => state.anonHandler(call), state.anonCalls)
  },
  dbService: () => {
    state.dbServiceCalls += 1
    throw new Error("dbService must not be called in public statement export")
  },
}))

const { GET, dynamic } = await import("./route")

function campaignRow(status: CampaignStatus = "live", extra: Record<string, unknown> = {}) {
  return {
    id: CAMPAIGN_ID,
    slug: SLUG,
    type: "give",
    status,
    title: "Xây trường Bản Mây",
    ...extra,
  }
}

const TOTALS_ROW = {
  id: CAMPAIGN_ID,
  type: "give",
  asset: "VND",
  goal_amount: 50_000_000,
  pledged_amount: 0,
  paid_amount: 1_500_000,
  disbursable_amount: 1_500_000,
  disbursed_amount: 500_000,
  refunded_amount: 0,
  unexplained_out_amount: 0,
  unexplained_out_count: 0,
  supporters_count: 2,
  other_in_amount: 0,
  refund_owed_amount: 0,
  backers_count: 0,
  payments_stopped_at: null,
  payments_stopped_note: null,
  own_transfer_amount: 0,
}

function statementRow(overrides: Partial<StatementRow> = {}): StatementRow {
  return {
    id: "tx-1",
    direction: "in",
    asset: "VND",
    amount: 500_000,
    booked_at: "2026-11-10T02:30:00.000Z",
    booked_date_only: false,
    after_close: false,
    matched: true,
    counterparty_account_masked: null,
    explained: null,
    purpose: null,
    category: null,
    recipient: null,
    is_refund: null,
    explained_at: null,
    donor_name: "Cô Ba",
    donor_anonymous: false,
    in_explanation: null,
    in_explained_at: null,
    own_transfer_id: null,
    own_transfer_at: null,
    own_transfer_label: null,
    return_of: null,
    returned_by: null,
    returned_at: null,
    return_bank_fee: null,
    milestone_id: null,
    ...overrides,
  }
}

function makeRequest(slug = SLUG, query = "") {
  const suffix = query ? `?${query}` : ""
  return new NextRequest(`https://give.dos.me/campaigns/${encodeURIComponent(slug)}/statement/export${suffix}`)
}

beforeEach(() => {
  state.anonCalls.length = 0
  state.dbAsTokens.length = 0
  state.dbServiceCalls = 0
  state.anonHandler = (call) => {
    if (call.target === "campaigns") return { data: campaignRow("live") }
    if (call.target === "public_campaigns") return { data: TOTALS_ROW }
    if (call.target === "public_statement") {
      return { data: [statementRow()], count: 1 }
    }
    return undefined
  }
})

describe("GET /campaigns/[slug]/statement/export (DOS/Give#336)", () => {
  it("marks route dynamic and exports formula-safe CSV with UTF-8 BOM and public cache/security headers", async () => {
    expect(dynamic).toBe("force-dynamic")

    const rows: StatementRow[] = [
      statementRow({
        id: "tx-in",
        direction: "in",
        amount: 500_000,
        donor_name: "=cmd|'/C calc'!A0",
        donor_anonymous: false,
      }),
      statementRow({
        id: "tx-anon",
        direction: "in",
        amount: 200_000,
        donor_name: "Secret Leak Name",
        donor_anonymous: true,
      }),
      statementRow({
        id: "tx-out",
        direction: "out",
        amount: 350_000,
        matched: false,
        explained: true,
        category: "goods",
        recipient: "  =SUM(1,2)",
        purpose: 'Mua sách, "tập viết"\nđợt 1',
        counterparty_account_masked: "****1234",
        explained_at: "2026-11-11T03:00:00.000Z",
        donor_name: null,
        donor_anonymous: null,
      }),
      statementRow({
        id: "tx-refund",
        direction: "out",
        amount: 100_000,
        matched: false,
        explained: true,
        is_refund: true,
        category: "refund",
        recipient: "@attacker",
        purpose: "+123 refund note",
        counterparty_account_masked: "SHOULD_NOT_SHOW",
        explained_at: "2026-11-12T03:00:00.000Z",
        donor_name: null,
        donor_anonymous: null,
      }),
      statementRow({
        id: "tx-unexplained",
        direction: "out",
        amount: 150_000,
        matched: false,
        explained: false,
        donor_name: null,
        donor_anonymous: null,
      }),
      statementRow({
        id: "tx-own",
        direction: "out",
        amount: 1_000_000,
        matched: false,
        explained: true,
        own_transfer_id: "own-1",
        own_transfer_at: "2026-11-12T03:00:00.000Z",
        own_transfer_label: "Chuyển sang tài khoản mới",
        donor_name: null,
        donor_anonymous: null,
      }),
      statementRow({
        id: "tx-inbound-other",
        direction: "in",
        amount: 50_000,
        matched: false,
        in_explanation: "interest",
        in_explained_at: "2026-11-12T03:00:00.000Z",
        donor_name: null,
        donor_anonymous: null,
      }),
      statementRow({
        id: "tx-returned-in",
        direction: "in",
        amount: 95_000,
        matched: false,
        return_of: "tx-returned-out",
        returned_at: "2026-11-13T03:00:00.000Z",
        return_bank_fee: 5_000,
        donor_name: null,
        donor_anonymous: null,
      }),
    ]

    state.anonHandler = (call) => {
      if (call.target === "campaigns") return { data: campaignRow("live") }
      if (call.target === "public_campaigns") return { data: TOTALS_ROW }
      if (call.target === "public_statement") {
        if (op(call, "in")) {
          return {
            data: [
              {
                id: "tx-returned-out",
                direction: "out",
                is_refund: false,
                amount: 100_000,
                booked_at: "2026-11-12T03:00:00.000Z",
              },
            ],
          }
        }
        return { data: rows, count: rows.length }
      }
      return undefined
    }

    const res = await GET(makeRequest(), { params: Promise.resolve({ slug: SLUG }) })

    expect(res.status).toBe(200)
    expect(state.dbServiceCalls).toBe(0)
    expect(state.dbAsTokens).toEqual([undefined])
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8")
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename="sao-ke-${SLUG}.csv"`)
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=60, stale-while-revalidate=300")
    expect(res.headers.get("x-content-type-options")).toBe("nosniff")
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow")
    expect(res.headers.get("x-statement-truncated")).toBeNull()

    // Never queries private tables or public_disbursement_evidence.
    const targets = state.anonCalls.map((c) => c.target)
    expect(targets).not.toContain("public_disbursement_evidence")
    expect(targets).not.toContain("disbursement_evidence")
    expect(targets).not.toContain("contributions")
    expect(targets).not.toContain("bank_transactions")

    const bytes = new Uint8Array(await res.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const body = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes)
    expect(body.startsWith("\uFEFF")).toBe(true)
    const cleanBody = body.slice(1)

    // Header row exact match
    expect(cleanBody.split("\r\n")[0]).toBe(STATEMENT_CSV_HEADERS.join(","))

    // Neutralizes formula payloads
    expect(cleanBody).toContain("'=cmd|'/C calc'!A0")
    expect(cleanBody).toContain('"\'  =SUM(1,2) (TK ****1234)"')
    expect(cleanBody).toContain("'@attacker")
    expect(cleanBody).toContain("'+123 refund note")

    // Positive numeric VND amounts stay plain digits (no prefix quote)
    expect(cleanBody).toContain(",500000,")
    expect(cleanBody).toContain(",350000,")

    // Anonymous donor stays Ẩn danh; refund masked account does not leak
    expect(cleanBody).not.toContain("Secret Leak Name")
    expect(cleanBody).toContain("Ẩn danh")
    expect(cleanBody).not.toContain("SHOULD_NOT_SHOW")

    // Embedded quotes and newlines escaped per RFC-4180
    expect(cleanBody).toContain('"Mua sách, ""tập viết""\nđợt 1"')

    // Own transfer, inbound non-donation, and returned transfer labels included cleanly
    expect(cleanBody).toContain("Chuyển tài khoản")
    expect(cleanBody).toContain("Lãi ngân hàng")
    expect(cleanBody).toContain("Ngân hàng trả lại khoản chi")
    expect(cleanBody).toContain("Người tổ chức chưa giải trình khoản chi này.")
  })

  it.each([
    ["all", []],
    ["in", [["direction", "in"]]],
    ["out", [["direction", "out"]]],
    [
      "unexplained",
      [
        ["direction", "out"],
        ["explained", false],
      ],
    ],
    ["invalid-filter", []],
  ] as const)("parses filter=%s safely via parseStatementParams", async (filterParam, expectedEqs) => {
    await GET(makeRequest(SLUG, `filter=${filterParam}`), { params: Promise.resolve({ slug: SLUG }) })
    const stmtCall = state.anonCalls.find((c) => c.target === "public_statement")
    const eqs = stmtCall?.ops.filter(([name]) => name === "eq").map((o) => o.slice(1))
    expect(eqs).toEqual([["campaign_id", CAMPAIGN_ID], ...expectedEqs])
  })

  it.each([
    ["invalid uppercase slug", "INVALID"],
    ["too long slug", "a".repeat(81)],
    ["path traversal slug", "../secret"],
  ])("returns 404 without querying DB for %s", async (_label, badSlug) => {
    const res = await GET(makeRequest(badSlug), { params: Promise.resolve({ slug: badSlug }) })
    expect(res.status).toBe(404)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(state.anonCalls).toHaveLength(0)
  })

  it.each(["draft", "in_review", "changes_requested", "approved", "suspended", "cancelled"] as const)(
    "returns 404 for non-public campaign status %s (including pre-launch approved teasers)",
    async (status) => {
      state.anonHandler = (call) => {
        if (call.target === "campaigns") {
          return { data: campaignRow(status, status === "approved" ? { prelaunch_public: true } : {}) }
        }
        return undefined
      }
      const res = await GET(makeRequest(), { params: Promise.resolve({ slug: SLUG }) })
      expect(res.status).toBe(404)
      expect(res.headers.get("cache-control")).toBe("no-store")
      expect(state.anonCalls.some((c) => c.target === "public_statement")).toBe(false)
    }
  )

  it("returns 404 when campaign is missing or getMoneyTotals returns null", async () => {
    state.anonHandler = () => ({ data: null })
    const missing = await GET(makeRequest(), { params: Promise.resolve({ slug: SLUG }) })
    expect(missing.status).toBe(404)

    state.anonHandler = (call) => {
      if (call.target === "campaigns") return { data: campaignRow("live") }
      if (call.target === "public_campaigns") return { data: null }
      if (call.target === "public_statement") return { data: [], count: 0 }
      return undefined
    }
    const noTotals = await GET(makeRequest(), { params: Promise.resolve({ slug: SLUG }) })
    expect(noTotals.status).toBe(404)
  })

  it("paginates across pages and caps at 5,000 rows with X-Statement-Truncated header when total > 5,000", async () => {
    const total = STATEMENT_EXPORT_MAX_ROWS + 250
    let statementCalls = 0
    state.anonHandler = (call) => {
      if (call.target === "campaigns") return { data: campaignRow("succeeded") }
      if (call.target === "public_campaigns") return { data: TOTALS_ROW }
      if (call.target === "public_statement") {
        statementCalls += 1
        const [from, to] = op(call, "range") as [number, number]
        const countOnPage = Math.min(STATEMENT_PAGE_SIZE, total - from)
        const pageRows = Array.from({ length: Math.max(0, countOnPage) }, (_, idx) =>
          statementRow({ id: `tx-${from + idx}`, amount: 1000 + from + idx })
        )
        expect(to - from + 1).toBe(STATEMENT_PAGE_SIZE)
        return { data: pageRows, count: total }
      }
      return undefined
    }

    const res = await GET(makeRequest(), { params: Promise.resolve({ slug: SLUG }) })
    expect(res.status).toBe(200)
    expect(res.headers.get("x-statement-truncated")).toBe("true")
    expect(statementCalls).toBe(STATEMENT_EXPORT_MAX_ROWS / STATEMENT_PAGE_SIZE)

    const bytes = new Uint8Array(await res.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const body = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes)
    const lines = body.slice(1).split("\r\n")
    // 1 header row + 5,000 data rows
    expect(lines).toHaveLength(STATEMENT_EXPORT_MAX_ROWS + 1)
    expect(lines[0]).toBe(STATEMENT_CSV_HEADERS.join(","))
  })

  it("returns 503 with no-store when database query fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    state.anonHandler = () => ({ error: { code: "57014", message: "timeout" } })
    const res = await GET(makeRequest(), { params: Promise.resolve({ slug: SLUG }) })
    expect(res.status).toBe(503)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(await res.text()).toBe("")
    log.mockRestore()
  })

  it("exports BOM + header only without truncation header for an empty statement", async () => {
    state.anonHandler = (call) => {
      if (call.target === "campaigns") return { data: campaignRow("live") }
      if (call.target === "public_campaigns") return { data: TOTALS_ROW }
      if (call.target === "public_statement") return { data: [], count: 0 }
      return undefined
    }

    const res = await GET(makeRequest(), { params: Promise.resolve({ slug: SLUG }) })
    expect(res.status).toBe(200)
    expect(res.headers.get("x-statement-truncated")).toBeNull()
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const body = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes)
    expect(body).toBe(`\uFEFF${STATEMENT_CSV_HEADERS.join(",")}`)
  })

  it("omits X-Statement-Truncated at exact 5,000-row boundary and handles partial last page cleanly", async () => {
    const runWithTotal = async (total: number) => {
      let calls = 0
      state.anonHandler = (call) => {
        if (call.target === "campaigns") return { data: campaignRow("live") }
        if (call.target === "public_campaigns") return { data: TOTALS_ROW }
        if (call.target === "public_statement") {
          calls += 1
          const [from] = op(call, "range") as [number, number]
          const countOnPage = Math.min(STATEMENT_PAGE_SIZE, total - from)
          const pageRows = Array.from({ length: Math.max(0, countOnPage) }, (_, idx) =>
            statementRow({ id: `tx-${from + idx}`, amount: 1000 + from + idx })
          )
          return { data: pageRows, count: total }
        }
        return undefined
      }
      const res = await GET(makeRequest(), { params: Promise.resolve({ slug: SLUG }) })
      const body = new TextDecoder("utf-8", { ignoreBOM: true }).decode(new Uint8Array(await res.arrayBuffer()))
      return { res, calls, lines: body.slice(1).split("\r\n") }
    }

    const partial = await runWithTotal(75)
    expect(partial.res.status).toBe(200)
    expect(partial.res.headers.get("x-statement-truncated")).toBeNull()
    expect(partial.calls).toBe(2)
    expect(partial.lines).toHaveLength(76)

    const exactMax = await runWithTotal(STATEMENT_EXPORT_MAX_ROWS)
    expect(exactMax.res.status).toBe(200)
    expect(exactMax.res.headers.get("x-statement-truncated")).toBeNull()
    expect(exactMax.calls).toBe(STATEMENT_EXPORT_MAX_ROWS / STATEMENT_PAGE_SIZE)
    expect(exactMax.lines).toHaveLength(STATEMENT_EXPORT_MAX_ROWS + 1)
  })

  it("deduplicates shifted boundary rows and fetches trailing page when total grows mid-export", async () => {
    const dataset = Array.from({ length: 101 }, (_, idx) => statementRow({ id: `tx-${idx + 1}`, amount: 10_000 + idx }))
    let pageCalls = 0
    state.anonHandler = (call) => {
      if (call.target === "campaigns") return { data: campaignRow("live") }
      if (call.target === "public_campaigns") return { data: TOTALS_ROW }
      if (call.target === "public_statement") {
        pageCalls += 1
        const [from, to] = op(call, "range") as [number, number]
        if (from === 0) {
          return { data: dataset.slice(1, 51), count: 100 }
        }
        return { data: dataset.slice(from, to + 1), count: 101 }
      }
      return undefined
    }

    const res = await GET(makeRequest(), { params: Promise.resolve({ slug: SLUG }) })
    expect(res.status).toBe(200)
    expect(res.headers.get("x-statement-truncated")).toBeNull()
    expect(pageCalls).toBe(3)
    const body = new TextDecoder("utf-8", { ignoreBOM: true }).decode(new Uint8Array(await res.arrayBuffer()))
    const dataLines = body.slice(1).split("\r\n").slice(1)
    expect(dataLines).toHaveLength(100)
    const amounts = dataLines.map((line) => line.split(",")[3])
    expect(new Set(amounts).size).toBe(100)
    expect(amounts.at(-1)).toBe(String(10_000 + 100))
  })

  it("stops cleanly if rows shrink and subsequent page returns PGRST103", async () => {
    state.anonHandler = (call) => {
      if (call.target === "campaigns") return { data: campaignRow("live") }
      if (call.target === "public_campaigns") return { data: TOTALS_ROW }
      if (call.target === "public_statement") {
        const range = op(call, "range") as [number, number] | undefined
        if (!range) return { count: 40 }
        if (range[0] === 0) {
          return {
            data: Array.from({ length: 40 }, (_, i) => statementRow({ id: `tx-${i}` })),
            count: 75,
          }
        }
        return { error: { code: "PGRST103", message: "Requested range not satisfiable" } }
      }
      return undefined
    }

    const res = await GET(makeRequest(), { params: Promise.resolve({ slug: SLUG }) })
    expect(res.status).toBe(200)
    expect(res.headers.get("x-statement-truncated")).toBeNull()
    const body = new TextDecoder("utf-8", { ignoreBOM: true }).decode(new Uint8Array(await res.arrayBuffer()))
    expect(body.slice(1).split("\r\n")).toHaveLength(41)
  })

  it("chunks returned-transfer pair queries in batches of 100 and degrades gracefully on pair lookup failure", async () => {
    const returnedRows = Array.from({ length: 125 }, (_, i) =>
      statementRow({
        id: `in-${i}`,
        direction: "in",
        matched: false,
        return_of: `out-${i}`,
        donor_name: null,
        donor_anonymous: null,
      })
    )
    const pairInBatchSizes: number[] = []
    state.anonHandler = (call) => {
      if (call.target === "campaigns") return { data: campaignRow("live") }
      if (call.target === "public_campaigns") return { data: TOTALS_ROW }
      if (call.target === "public_statement") {
        const inArgs = op(call, "in")?.[1] as string[] | undefined
        if (inArgs) {
          pairInBatchSizes.push(inArgs.length)
          return { error: { code: "57014", message: "pair timeout" } }
        }
        const [from, to] = op(call, "range") as [number, number]
        return { data: returnedRows.slice(from, to + 1), count: returnedRows.length }
      }
      return undefined
    }

    const res = await GET(makeRequest(), { params: Promise.resolve({ slug: SLUG }) })
    expect(res.status).toBe(200)
    expect(pairInBatchSizes).toEqual([100, 25])
    const body = new TextDecoder("utf-8", { ignoreBOM: true }).decode(new Uint8Array(await res.arrayBuffer()))
    expect(body.slice(1).split("\r\n")).toHaveLength(126)
  })
})
