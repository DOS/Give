/**
 * Covers the `/admin` moderator review queue RSC (`AdminReviewPage`,
 * DOS/Give#218): `requireSession("/admin")` and finance/non-staff routing,
 * `listWaitingForAccount` error isolation, `EmptyState` rendering across
 * `#queue`, `#waiting` and `#organizers`, self-review UI guards,
 * `waitingAdvice` notes and `from_status="approved"` send-back forms, and
 * `#organizers` concurrency hidden fields.
 */
import { Window } from "happy-dom"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  accountProblemLabel,
  waitingAdvice,
  type Organizer,
  type ReviewItem,
  type WaitingForAccount,
} from "@/lib/campaigns"
import { FINANCE_ROLES } from "@/lib/receiving-accounts"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const STAFF_USER = "11111111-1111-4111-8111-111111111111"
const OTHER_USER = "22222222-2222-4222-8222-222222222222"
const THIRD_USER = "33333333-3333-4333-8333-333333333333"

const state = vi.hoisted(() => ({
  handler: (() => undefined) as Handler,
  calls: [] as Call[],
}))

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  })
)

const notFoundMock = vi.hoisted(() =>
  vi.fn((): never => {
    throw new Error("NEXT_NOT_FOUND")
  })
)

const requireSessionMock = vi.hoisted(() =>
  vi.fn(async (_next?: string) => ({
    user: { id: STAFF_USER, email: "mod@dos.me", name: "Kiểm duyệt viên" },
    accessToken: "mod-access-token",
  }))
)

const dbAsMock = vi.hoisted(() => vi.fn((_token?: string) => fakeDb((call) => state.handler(call), state.calls)))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  notFound: notFoundMock,
}))
vi.mock("@/lib/auth/session", () => ({
  requireSession: requireSessionMock,
  getSession: vi.fn(async () => null),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: dbAsMock,
}))

const { default: AdminReviewPage, metadata } = await import("./page")

function reviewRow(id: string, overrides: Partial<ReviewItem> = {}): ReviewItem {
  const organizerId = overrides.organizer_id ?? OTHER_USER
  return {
    id,
    slug: `chien-dich-${id.slice(0, 4)}`,
    type: "give",
    funding_model: "flexible",
    organizer_id: organizerId,
    category_id: "cat-1",
    title: `Chiến dịch ${id.slice(0, 4)}`,
    summary: "Tóm tắt chiến dịch gửi kiểm duyệt.",
    story: "Câu chuyện chi tiết của chiến dịch.",
    beneficiary_name: "Trường Tiểu học Bản Mây",
    beneficiary_relation: "Đơn vị thụ hưởng",
    cover_media_id: null,
    asset: "VND",
    goal_amount: 50_000_000,
    min_contribution: 20_000,
    stretch_goal_amount: null,
    display_options: { progress_bar: true, backers_count: true, time_remaining: true },
    starts_at: null,
    ends_at: "2099-12-31T00:00:00.000Z",
    payment_window_days: 7,
    status: "in_review",
    review_note: null,
    submitted_at: "2026-11-10T08:00:00.000Z",
    approved_at: null,
    outcome_at: null,
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-10T08:00:00.000Z",
    category: { id: "cat-1", slug: "giao-duc", name: "Giáo dục", icon: "📚", color: null },
    cover: null,
    organizer: {
      user_id: organizerId,
      kind: "organization",
      legal_name: "Quỹ Bản Mây",
      display_name: "Bản Mây",
      verification_status: "verified",
    },
    ...overrides,
  }
}

function waitingRow(id: string, problem: string, overrides: Partial<WaitingForAccount> = {}): WaitingForAccount {
  return {
    ...reviewRow(id, {
      status: "approved",
      approved_at: "2026-11-12T09:00:00.000Z",
      ...overrides,
    }),
    account_problem: problem,
    account_has_transactions: overrides.account_has_transactions ?? false,
  }
}

function organizerRow(userId: string, overrides: Partial<Organizer> = {}): Organizer {
  return {
    user_id: userId,
    kind: "individual",
    legal_name: "Nguyễn Văn Minh",
    display_name: "Minh Nguyễn",
    phone: "0901234567",
    verification_status: "pending",
    verified_at: null,
    created_at: "2026-11-05T00:00:00.000Z",
    ...overrides,
  }
}

function setupAdmin({
  moderates = true,
  reviewsAccounts = false,
  queue = [] as ReviewItem[],
  waiting = [] as WaitingForAccount[],
  waitingError = null as { code?: string; message?: string } | null,
  organizers = [] as Organizer[],
} = {}) {
  state.handler = (call) => {
    if (call.target === "rpc:is_admin") {
      const roles = (op(call, "args")?.[0] as { p_roles: readonly string[] } | undefined)?.p_roles ?? []
      return { data: roles === FINANCE_ROLES || roles.includes("finance") ? reviewsAccounts : moderates }
    }
    if (call.target === "rpc:campaigns_waiting_for_account") {
      if (waitingError) return { error: waitingError }
      return {
        data: waiting.map((w) => ({
          campaign_id: w.id,
          account_problem: w.account_problem,
          account_has_transactions: w.account_has_transactions,
        })),
      }
    }
    if (call.target === "rpc:managed_campaigns") {
      if (op(call, "eq")?.[0] === "status") return { data: queue }
      if (op(call, "in")?.[0] === "id") {
        return {
          data: waiting.map(({ account_problem: _p, account_has_transactions: _t, ...campaign }) => campaign),
        }
      }
    }
    if (call.target === "organizers") return { data: organizers }
    return undefined
  }
}

const parser = new new Window().DOMParser()

async function renderAdmin() {
  const element = await AdminReviewPage()
  const html = renderToStaticMarkup(element).replace(/\u00a0/g, " ")
  const doc = parser.parseFromString(html, "text/html")
  return {
    html,
    doc,
    queueSection: doc.querySelector('section[aria-labelledby="queue"]')!,
    waitingSection: doc.querySelector('section[aria-labelledby="waiting"]')!,
    organizersSection: doc.querySelector('section[aria-labelledby="organizers"]')!,
  }
}

beforeEach(() => {
  state.calls.length = 0
  redirectMock.mockClear()
  notFoundMock.mockClear()
  requireSessionMock.mockClear()
  dbAsMock.mockClear()
  setupAdmin()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("AdminReviewPage (/admin, DOS/Give#218)", () => {
  it("exports noindex metadata for the moderation queue", () => {
    expect(metadata).toEqual({ title: "Kiểm duyệt", robots: { index: false } })
  })

  describe("session and staff role gating", () => {
    it("calls requireSession('/admin') and authenticates dbAs with the caller's accessToken", async () => {
      const { doc } = await renderAdmin()

      expect(requireSessionMock).toHaveBeenCalledWith("/admin")
      expect(dbAsMock).toHaveBeenCalledWith("mod-access-token")
      expect(doc.querySelector("h1")?.textContent.trim()).toBe("Kiểm duyệt")
    })

    it("redirects finance-only staff (!moderates && reviewsAccounts) to /admin/accounts without querying review queues", async () => {
      setupAdmin({ moderates: false, reviewsAccounts: true })

      await expect(AdminReviewPage()).rejects.toThrow("NEXT_REDIRECT:/admin/accounts")
      expect(redirectMock).toHaveBeenCalledWith("/admin/accounts")
      expect(notFoundMock).not.toHaveBeenCalled()
      expect(state.calls.map((c) => c.target)).toEqual(["rpc:is_admin", "rpc:is_admin"])
    })

    it("calls notFound() when neither moderator nor finance role holds", async () => {
      setupAdmin({ moderates: false, reviewsAccounts: false })

      await expect(AdminReviewPage()).rejects.toThrow("NEXT_NOT_FOUND")
      expect(notFoundMock).toHaveBeenCalledTimes(1)
      expect(redirectMock).not.toHaveBeenCalled()
      expect(state.calls.map((c) => c.target)).toEqual(["rpc:is_admin", "rpc:is_admin"])
    })
  })

  describe("EmptyState across all three sections", () => {
    it("renders EmptyState in #queue, #waiting and #organizers when all three lists are empty", async () => {
      setupAdmin({ queue: [], waiting: [], organizers: [] })
      const { queueSection, waitingSection, organizersSection } = await renderAdmin()

      expect(queueSection.querySelector("h3")?.textContent.trim()).toBe("Không có chiến dịch nào chờ duyệt.")
      expect(queueSection.textContent).toContain(
        "Chiến dịch người tổ chức gửi duyệt sẽ hiện ở đây, gửi sớm nhất ở trên cùng."
      )
      expect(queueSection.querySelector("h2")?.textContent).toContain("0")

      expect(waitingSection.querySelector("h3")?.textContent.trim()).toBe(
        "Không có chiến dịch đã duyệt nào đang chờ tài khoản nhận."
      )
      expect(waitingSection.querySelector("h2")?.textContent).toContain("0")

      expect(organizersSection.querySelector("h3")?.textContent.trim()).toBe("Không có hồ sơ nào chờ xác minh.")
      expect(organizersSection.querySelector("h2")?.textContent).toContain("0")
    })
  })

  describe("listWaitingForAccount error isolation", () => {
    it("renders the danger Callout in #waiting when listWaitingForAccount fails while still rendering #queue and #organizers", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      const queued = reviewRow("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", { title: "Áo ấm vùng cao" })
      const org = organizerRow(OTHER_USER, { display_name: "Nhóm Thiện Nguyện Xanh" })
      setupAdmin({
        queue: [queued],
        waitingError: { code: "42501", message: "permission denied" },
        organizers: [org],
      })

      const { queueSection, waitingSection, organizersSection } = await renderAdmin()

      expect(errorSpy).toHaveBeenCalledWith("campaigns_waiting_for_account failed", "42501", "permission denied")

      // #waiting shows the isolated danger Callout without a count badge.
      const dangerBox = waitingSection.querySelector(".bg-danger-soft")
      expect(dangerBox).toBeTruthy()
      expect(dangerBox?.querySelector("p.font-semibold")?.textContent.trim()).toBe("Chưa tải được danh sách này.")
      expect(dangerBox?.textContent).toContain("Các phần khác của trang vẫn dùng được. Hãy tải lại trang sau.")
      expect(waitingSection.querySelector("h2")?.textContent.trim()).toBe("Đã duyệt, chờ tài khoản nhận")

      // #queue and #organizers continue to render normally.
      expect(queueSection.textContent).toContain("Áo ấm vùng cao")
      expect(organizersSection.textContent).toContain("Nhóm Thiện Nguyện Xanh")
    })
  })

  describe("self-review UI guards, waitingAdvice forms/notes and organizer concurrency fields", () => {
    it("enforces self-review guards in #queue, #waiting and #organizers and renders action forms and hidden fields for other organizers", async () => {
      const otherQueue = reviewRow("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", {
        organizer_id: OTHER_USER,
        title: "Xây cầu Kênh Tẻ",
      })
      const ownQueue = reviewRow("cccccccc-cccc-4ccc-8ccc-cccccccccccc", {
        organizer_id: STAFF_USER,
        title: "Chiến dịch của kiểm duyệt viên",
      })

      // account_not_owned produces BOTH a waitingAdvice note AND a non-null sendBackReason.
      const otherWaitingSendBack = waitingRow("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "account_not_owned", {
        organizer_id: OTHER_USER,
        title: "Sách cho em",
      })
      // Verified organizer + no_account (unended) produces a waitingAdvice note with sendBackReason === null.
      const otherWaitingNoSendBack = waitingRow("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", "no_account", {
        organizer_id: THIRD_USER,
        title: "Thư viện vùng biên",
      })
      // Moderator's own waiting campaign where sendBackReason !== null triggers the self-review guard.
      const ownWaiting = waitingRow("ffffffff-ffff-4fff-8fff-ffffffffffff", "name_mismatch", {
        organizer_id: STAFF_USER,
        title: "Bếp ăn yêu thương",
      })

      const otherOrganizer = organizerRow(OTHER_USER, {
        kind: "organization",
        legal_name: "Công ty TNHH Ánh Dương",
        display_name: "Quỹ Ánh Dương",
      })
      const ownOrganizer = organizerRow(STAFF_USER, {
        kind: "individual",
        legal_name: "Trần Kiểm Duyệt",
        display_name: "Kiểm Duyệt",
      })

      setupAdmin({
        queue: [otherQueue, ownQueue],
        waiting: [otherWaitingSendBack, otherWaitingNoSendBack, ownWaiting],
        organizers: [otherOrganizer, ownOrganizer],
      })

      const { queueSection, waitingSection, organizersSection } = await renderAdmin()

      // --- #queue ---
      const queueCards = Array.from(queueSection.querySelectorAll("li"))
      expect(queueCards).toHaveLength(2)

      // Other organizer's campaign in #queue gets approve + requestChanges (from_status="in_review").
      expect(queueCards[0]!.textContent).toContain("Xây cầu Kênh Tẻ")
      expect(queueCards[0]!.textContent).toContain("Trường Tiểu học Bản Mây (Đơn vị thụ hưởng)")
      expect(
        Array.from(queueCards[0]!.querySelectorAll('button[type="submit"]')).map((b) => b.textContent.trim())
      ).toEqual(["Duyệt", "Gửi yêu cầu"])
      expect(queueCards[0]!.querySelector('input[name="from_status"]')?.getAttribute("value")).toBe("in_review")
      expect(queueCards[0]!.querySelector(`textarea#reason-${otherQueue.id}[name="reason"]`)).toBeTruthy()

      // Moderator's own campaign in #queue shows warning Callout instead of action forms.
      expect(queueCards[1]!.textContent).toContain("Chiến dịch của kiểm duyệt viên")
      expect(queueCards[1]!.textContent).toContain("Đây là chiến dịch của bạn; một kiểm duyệt viên khác cần duyệt.")
      expect(queueCards[1]!.querySelectorAll("form")).toHaveLength(0)

      // --- #waiting ---
      const waitingCards = Array.from(waitingSection.querySelectorAll("li"))
      expect(waitingCards).toHaveLength(3)

      // 1) Other organizer with actionable send-back + waitingAdvice note:
      const expectedAdvice = waitingAdvice(otherWaitingSendBack)
      expect(expectedAdvice.note).toBeTruthy()
      expect(expectedAdvice.sendBackReason).toBeTruthy()
      expect(waitingCards[0]!.textContent).toContain("Sách cho em")
      expect(waitingCards[0]!.textContent).toContain(accountProblemLabel("account_not_owned"))
      expect(waitingCards[0]!.textContent).toContain(expectedAdvice.note!)
      expect(waitingCards[0]!.querySelector('input[name="from_status"]')?.getAttribute("value")).toBe("approved")
      const waitingTextarea = waitingCards[0]!.querySelector(
        `textarea#waiting-reason-${otherWaitingSendBack.id}[name="reason"]`
      )
      expect(waitingTextarea?.textContent).toBe(expectedAdvice.sendBackReason)
      expect(waitingCards[0]!.querySelector('button[type="submit"]')?.textContent.trim()).toBe("Gửi yêu cầu")

      // 2) Other organizer where waitingAdvice.sendBackReason === null: renders note only, no form.
      const noSendBackAdvice = waitingAdvice(otherWaitingNoSendBack)
      expect(noSendBackAdvice.sendBackReason).toBeNull()
      expect(waitingCards[1]!.textContent).toContain("Thư viện vùng biên")
      expect(waitingCards[1]!.textContent).toContain(noSendBackAdvice.note!)
      expect(waitingCards[1]!.querySelectorAll("form")).toHaveLength(0)
      expect(waitingCards[1]!.textContent).not.toContain("Đây là chiến dịch của bạn")

      // 3) Moderator's own campaign in #waiting: shows self-review Callout instead of send-back form.
      expect(waitingCards[2]!.textContent).toContain("Bếp ăn yêu thương")
      expect(waitingCards[2]!.textContent).toContain("Đây là chiến dịch của bạn; một kiểm duyệt viên khác cần xử lý.")
      expect(waitingCards[2]!.querySelectorAll("form")).toHaveLength(0)

      // --- #organizers ---
      const organizerItems = Array.from(organizersSection.querySelectorAll("li"))
      expect(organizerItems).toHaveLength(2)

      // Other organizer gets "Xác minh" and "Từ chối" forms with concurrency hidden fields.
      expect(organizerItems[0]!.textContent).toContain("Quỹ Ánh Dương")
      expect(organizerItems[0]!.textContent).toContain("Tên pháp lý: Công ty TNHH Ánh Dương · Tổ chức")
      const verifyForms = Array.from(organizerItems[0]!.querySelectorAll("form"))
      expect(verifyForms).toHaveLength(2)
      expect(
        verifyForms.map((form) => ({
          button: form.querySelector('button[type="submit"]')?.textContent.trim(),
          inputs: Object.fromEntries(
            Array.from(form.querySelectorAll('input[type="hidden"]')).map((i) => [
              i.getAttribute("name"),
              i.getAttribute("value"),
            ])
          ),
        }))
      ).toEqual([
        {
          button: "Xác minh",
          inputs: {
            status: "verified",
            expected_legal_name: "Công ty TNHH Ánh Dương",
            expected_display_name: "Quỹ Ánh Dương",
            expected_kind: "organization",
          },
        },
        {
          button: "Từ chối",
          inputs: {
            status: "rejected",
            expected_legal_name: "Công ty TNHH Ánh Dương",
            expected_display_name: "Quỹ Ánh Dương",
            expected_kind: "organization",
          },
        },
      ])

      // Moderator's own organizer profile omits both "Xác minh" and "Từ chối".
      expect(organizerItems[1]!.textContent).toContain("Kiểm Duyệt")
      expect(organizerItems[1]!.textContent).toContain("Tên pháp lý: Trần Kiểm Duyệt · Cá nhân")
      expect(organizerItems[1]!.querySelectorAll("form")).toHaveLength(0)
      expect(organizerItems[1]!.textContent).not.toContain("Xác minh")
      expect(organizerItems[1]!.textContent).not.toContain("Từ chối")
    })
  })
})
