// @vitest-environment happy-dom
/**
 * Covers the finance review notice of the `/me/statements` RSC (DOS/Give#57):
 * shown with the threshold to a user uploading for an account they own,
 * hidden from staff uploading only for other people's accounts, and hidden
 * when the threshold cannot be read.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { UploadAccount } from "@/lib/statement-import"

const VIEWER = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"

const state = vi.hoisted(() => ({
  settings: { thresholdVnd: 20000000, dailyLimitVnd: 100000000 } as {
    thresholdVnd: number
    dailyLimitVnd: number
  } | null,
  accounts: [] as unknown[],
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn(), usePathname: () => "/me/statements" }))
vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(async () => ({ user: { id: VIEWER, email: null, name: null }, accessToken: "token" })),
  getSession: vi.fn(async () => null),
}))
vi.mock("@/lib/supabase", () => ({ dbAs: vi.fn(() => ({})) }))
vi.mock("@/lib/campaigns", async (original) => ({
  ...(await original<typeof import("@/lib/campaigns")>()),
  isStaff: vi.fn(async () => false),
}))
vi.mock("@/lib/statement-import", async (original) => ({
  ...(await original<typeof import("@/lib/statement-import")>()),
  listUploadAccounts: vi.fn(async () => state.accounts),
  listBatches: vi.fn(async () => []),
  countWaitingRows: vi.fn(async () => new Map()),
  accountLabels: vi.fn(async () => new Map()),
  getReviewSettings: vi.fn(async () => state.settings),
}))
vi.mock("./actions", () => ({ uploadStatement: vi.fn(async () => null) }))

const { default: StatementsPage } = await import("./page")

function account(owner: string): UploadAccount {
  return {
    id: "bbbbbbbb-0000-4000-8000-000000000001",
    owner_user_id: owner,
    bank_bin: "970407",
    account_number: "19000000000001",
    account_name: "NGUYEN VAN A",
    verification_status: "verified",
  }
}

async function text(): Promise<string> {
  const html = renderToStaticMarkup(await StatementsPage())
  return new DOMParser().parseFromString(html, "text/html").body.textContent ?? ""
}

beforeEach(() => {
  state.settings = { thresholdVnd: 20000000, dailyLimitVnd: 100000000 }
  state.accounts = [account(VIEWER)]
})

describe("StatementsPage finance review notice (DOS/Give#57)", () => {
  it("tells an account owner which uploads wait for finance, with the threshold", async () => {
    const page = await text()
    expect(page).toContain("chỉ được ghi khi đội tài chính của Give đã đối chiếu")
    expect(page).toContain("20.000.000")
    expect(page).toContain("100.000.000")
  })

  it("is not shown to staff uploading only for other people's accounts", async () => {
    state.accounts = [account(OTHER)]
    expect(await text()).not.toContain("đội tài chính của Give đã đối chiếu")
  })

  it("is not shown when the threshold cannot be read", async () => {
    state.settings = null
    expect(await text()).not.toContain("đội tài chính của Give đã đối chiếu")
  })
})
