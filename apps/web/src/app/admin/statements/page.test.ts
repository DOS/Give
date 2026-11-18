// @vitest-environment happy-dom
/**
 * Covers the finance review parts of the `/admin/statements` RSC
 * (DOS/Give#57): the review threshold section shows the stored threshold with
 * separators in the form, says so when it cannot be read, and a row waiting
 * for finance review offers rejection with review wording.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { QueueRow } from "@/lib/statement-import"

const VIEWER = "11111111-1111-4111-8111-111111111111"
const ACCOUNT = "bbbbbbbb-0000-4000-8000-000000000001"

const state = vi.hoisted(() => ({
  threshold: 20000000 as number | null,
  queue: [] as unknown[],
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({
  notFound: vi.fn((): never => {
    throw new Error("NEXT_NOT_FOUND")
  }),
  redirect: vi.fn(),
  usePathname: () => "/admin/statements",
}))
vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(async () => ({ user: { id: VIEWER, email: null, name: null }, accessToken: "token" })),
  getSession: vi.fn(async () => null),
}))
vi.mock("@/lib/supabase", () => ({ dbAs: vi.fn(() => ({})) }))
vi.mock("@/lib/campaigns", async (original) => ({
  ...(await original<typeof import("@/lib/campaigns")>()),
  isStaff: vi.fn(async () => true),
}))
vi.mock("@/lib/staff", () => ({ listStaff: vi.fn(async () => []) }))
vi.mock("@/lib/statement-import", async (original) => ({
  ...(await original<typeof import("@/lib/statement-import")>()),
  listAmbiguousRows: vi.fn(async () => ({ rows: state.queue, total: state.queue.length })),
  listResolvedRows: vi.fn(async () => []),
  getReviewThreshold: vi.fn(async () => state.threshold),
  getCandidateRows: vi.fn(async () => ({ rows: new Map(), voidIds: new Set() })),
  accountOwners: vi.fn(async () => new Map()),
  listAccountBindings: vi.fn(async () => []),
  listDuplicateTargets: vi.fn(async () => ({ shown: [], total: 0 })),
  accountLabels: vi.fn(async () => new Map()),
  listReconciliationAudit: vi.fn(async () => []),
}))
vi.mock("./actions", () => ({
  resolveStatementRow: vi.fn(async () => null),
  setReviewThreshold: vi.fn(async () => null),
}))

const { default: AdminStatementsPage } = await import("./page")

function row(overrides: Partial<QueueRow> = {}): QueueRow {
  return {
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    import_batch_id: "cccccccc-0000-4000-8000-000000000001",
    row_no: 1,
    booked_at: "2026-10-01T02:00:00Z",
    booked_date_only: false,
    direction: "in",
    amount: 25000000,
    description: "ung ho",
    counterparty_name: null,
    counterparty_account_masked: null,
    balance_after: 26000000,
    provider_tx_id: null,
    status: "ambiguous",
    ambiguous_reason: "finance_review",
    bank_transaction_id: null,
    duplicate_of_row_id: null,
    candidate_row_id: null,
    resolution: null,
    resolved_at: null,
    resolution_note: null,
    batch: {
      id: "cccccccc-0000-4000-8000-000000000001",
      batch_no: 7,
      receiving_account_id: ACCOUNT,
      parser: "tcb-business",
      period_from: "2026-10-01",
      period_to: "2026-10-01",
      row_count: 1,
      staged_at: "2026-10-02T01:00:00Z",
      imported_at: "2026-10-02T01:00:00Z",
    },
    ...overrides,
  }
}

async function render(): Promise<Document> {
  const html = renderToStaticMarkup(await AdminStatementsPage())
  return new DOMParser().parseFromString(html, "text/html") as unknown as Document
}

beforeEach(() => {
  state.threshold = 20000000
  state.queue = []
})

describe("AdminStatementsPage finance review (DOS/Give#57)", () => {
  it("shows the threshold, and puts it in the form with separators", async () => {
    const doc = await render()
    const section = doc.querySelector('section[aria-labelledby="review-threshold"]')
    expect(section?.textContent).toContain("Ngưỡng duyệt sao kê")
    expect(section?.textContent).toContain("20.000.000")
    const input = doc.querySelector<HTMLInputElement>("#review-threshold-amount")
    expect(input?.getAttribute("value")).toBe("20.000.000")
    expect(Number(input?.getAttribute("maxlength"))).toBeGreaterThanOrEqual("9.999.999.999.999".length)
    expect(doc.querySelector("#review-threshold-note")?.hasAttribute("required")).toBe(true)
  })

  it("says so when the threshold cannot be read, without a form", async () => {
    state.threshold = null
    const doc = await render()
    expect(doc.querySelector('section[aria-labelledby="review-threshold"]')?.textContent).toContain(
      "Chưa đọc được ngưỡng duyệt"
    )
    expect(doc.querySelector("#review-threshold-amount")).toBeNull()
  })

  it("offers approval and rejection of a row waiting for finance review", async () => {
    state.queue = [row()]
    const text = (await render()).body.textContent ?? ""
    expect(text).toContain("Chờ đội tài chính duyệt")
    expect(text).toContain("Nhập thành giao dịch mới")
    expect(text).toContain("Không phải giao dịch thật")
    expect(text).toContain("Từ chối: chỉ chọn khi dòng này không có trên sao kê của tài khoản")
  })

  it("keeps the dismissed-upload wording for a row of a dismissed upload", async () => {
    state.queue = [row({ ambiguous_reason: "event_dismissed" })]
    const text = (await render()).body.textContent ?? ""
    expect(text).toContain("ví dụ file thử, tải nhầm tài khoản")
    expect(text).not.toContain("Từ chối:")
  })
})
