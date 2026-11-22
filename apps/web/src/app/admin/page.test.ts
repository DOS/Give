// @vitest-environment happy-dom
/**
 * Covers the `/admin` moderator review queue RSC (`AdminReviewPage`,
 * DOS/Give#218, #242): `requireSession("/admin")` and finance/non-staff routing,
 * `listWaitingForAccount` error isolation, `EmptyState` rendering across
 * `#queue`, `#waiting` and `#organizers`, self-review UI guards,
 * `waitingAdvice` notes and `from_status="approved"` send-back forms,
 * `<Field>` + `space-y-6` rhythm, contextualized preview/action labels, and
 * `#organizers` secondary hierarchy, rejected button hiding, and `confirm` guard.
 */
import { act } from "react"
import { Window } from "happy-dom"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  accountProblemLabel,
  recoveryAdvice,
  STATUS_LABELS,
  waitingAdvice,
  type Organizer,
  type RecoveryCampaign,
  type RecoveryKind,
  type ReviewItem,
  type WaitingForAccount,
} from "@/lib/campaigns"
import type { CampaignStatusEvent } from "@/components/campaign/StatusHistory"
import { formatDateTime } from "@/lib/format"
import { FINANCE_ROLES } from "@/lib/receiving-accounts"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const STAFF_USER = "11111111-1111-4111-8111-111111111111"
const OTHER_USER = "22222222-2222-4222-8222-222222222222"
const THIRD_USER = "33333333-3333-4333-8333-333333333333"
const REJECTED_USER = "44444444-4444-4444-8444-444444444444"

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

const sessionValue = {
  user: { id: STAFF_USER, email: "mod@dos.me", name: "Kiểm duyệt viên" },
  accessToken: "mod-access-token",
}

const requireSessionMock = vi.hoisted(() => vi.fn(async (_next?: string) => sessionValue))

const getSessionMock = vi.hoisted(() => vi.fn(async () => sessionValue))

const dbAsMock = vi.hoisted(() => vi.fn((_token?: string) => fakeDb((call) => state.handler(call), state.calls)))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  notFound: notFoundMock,
}))
vi.mock("@/lib/auth/session", () => ({
  requireSession: requireSessionMock,
  getSession: getSessionMock,
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

function recoveryRow(
  id: string,
  kind: RecoveryKind,
  problem: string | null,
  overrides: Partial<RecoveryCampaign> = {}
): RecoveryCampaign {
  return {
    ...reviewRow(id, {
      status: kind === "suspended_before_start" ? "suspended" : "approved",
      approved_at: "2026-11-12T09:00:00.000Z",
      starts_at: kind === "suspended_before_start" ? "2099-01-01T00:00:00.000Z" : "2026-10-01T00:00:00.000Z",
      ends_at: kind === "suspended_before_start" ? "2099-02-01T00:00:00.000Z" : "2026-11-01T00:00:00.000Z",
      ...overrides,
    }),
    recovery_kind: kind,
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
  recovery = [] as RecoveryCampaign[],
  recoveryError = null as { code?: string; message?: string } | null,
  organizers = [] as Organizer[],
  statusEvents = [] as CampaignStatusEvent[],
  statusEventsError = null as { code?: string; message?: string } | null,
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
    if (call.target === "rpc:campaigns_needing_recovery") {
      if (recoveryError) return { error: recoveryError }
      return {
        data: recovery.map((r) => ({
          campaign_id: r.id,
          recovery_kind: r.recovery_kind,
          account_problem: r.account_problem,
          account_has_transactions: r.account_has_transactions,
        })),
      }
    }
    if (call.target === "rpc:managed_campaigns") {
      if (op(call, "eq")?.[0] === "status") return { data: queue }
      if (op(call, "in")?.[0] === "id") {
        const ids = (op(call, "in")?.[1] ?? []) as string[]
        const pool = [
          ...waiting.map(({ account_problem: _p, account_has_transactions: _t, ...campaign }) => campaign),
          ...recovery.map(
            ({ recovery_kind: _k, account_problem: _p, account_has_transactions: _t, ...campaign }) => campaign
          ),
        ]
        return { data: pool.filter((c) => ids.includes(c.id)) }
      }
    }
    if (call.target === "campaign_status_events") {
      if (statusEventsError) return { error: statusEventsError }
      const ids = (op(call, "in")?.[1] ?? []) as string[]
      return { data: statusEvents.filter((event) => ids.includes(event.campaign_id)) }
    }
    if (call.target === "organizers") {
      const inStatuses = op(call, "in")?.[1] as string[] | undefined
      const eqStatus = op(call, "eq")?.[1] as string | undefined
      const lim = (op(call, "limit")?.[0] as number | undefined) ?? organizers.length
      const filtered = inStatuses
        ? organizers.filter((o) => inStatuses.includes(o.verification_status))
        : eqStatus
          ? organizers.filter((o) => o.verification_status === eqStatus)
          : organizers
      return { data: filtered.slice(0, lim) }
    }
    if (call.target === "rpc:set_organizer_verification") return { data: null }
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
    recoverySection: doc.querySelector('section[aria-labelledby="recovery"]')!,
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
      const rejectedOrganizer = organizerRow(REJECTED_USER, {
        kind: "individual",
        legal_name: "Lê Văn Bị Từ Chối",
        display_name: "Hồ Sơ Cần Sửa",
        verification_status: "rejected",
      })

      setupAdmin({
        queue: [otherQueue, ownQueue],
        waiting: [otherWaitingSendBack, otherWaitingNoSendBack, ownWaiting],
        organizers: [otherOrganizer, ownOrganizer, rejectedOrganizer],
      })

      const { queueSection, waitingSection, organizersSection } = await renderAdmin()

      // --- #queue ---
      const queueCards = Array.from(queueSection.querySelectorAll("li"))
      expect(queueCards).toHaveLength(2)

      // Other organizer's campaign in #queue gets contextualized preview link, approve + Field/space-y-6 requestChanges.
      expect(queueCards[0]!.textContent).toContain("Xây cầu Kênh Tẻ")
      expect(queueCards[0]!.querySelector('a[href="/campaigns/chien-dich-bbbb"]')?.textContent).toBe(
        "Xem trước: Xây cầu Kênh Tẻ (mở thẻ mới)"
      )
      expect(queueCards[0]!.textContent).toContain("Trường Tiểu học Bản Mây (Đơn vị thụ hưởng)")
      expect(
        Array.from(queueCards[0]!.querySelectorAll('button[type="submit"]')).map((b) => b.textContent.trim())
      ).toEqual(["Duyệt", "Gửi yêu cầu"])
      const queueRequestForm = queueCards[0]!.querySelectorAll("form")[1]!
      expect(queueRequestForm.className).toContain("space-y-6")
      expect(queueRequestForm.querySelector('input[name="from_status"]')?.getAttribute("value")).toBe("in_review")
      const queueTextarea = queueRequestForm.querySelector(`textarea#reason-${otherQueue.id}[name="reason"]`)!
      expect(queueTextarea).toBeTruthy()
      expect(queueTextarea.parentElement?.tagName).toBe("DIV")
      expect(queueTextarea.parentElement?.querySelector(`label[for="reason-${otherQueue.id}"]`)?.textContent).toBe(
        "Yêu cầu chỉnh sửa"
      )

      // Moderator's own campaign in #queue shows warning Callout instead of action forms.
      expect(queueCards[1]!.textContent).toContain("Chiến dịch của kiểm duyệt viên")
      expect(queueCards[1]!.querySelector('a[href="/campaigns/chien-dich-cccc"]')?.textContent).toBe(
        "Xem trước: Chiến dịch của kiểm duyệt viên (mở thẻ mới)"
      )
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
      expect(waitingCards[0]!.querySelector('a[href="/campaigns/chien-dich-dddd"]')?.textContent).toBe(
        "Xem trước: Sách cho em (mở thẻ mới)"
      )
      expect(waitingCards[0]!.textContent).toContain(accountProblemLabel("account_not_owned"))
      expect(waitingCards[0]!.textContent).toContain(expectedAdvice.note!)
      const waitingRequestForm = waitingCards[0]!.querySelector("form")!
      expect(waitingRequestForm.className).toContain("space-y-6")
      expect(waitingRequestForm.querySelector('input[name="from_status"]')?.getAttribute("value")).toBe("approved")
      const waitingTextarea = waitingRequestForm.querySelector(
        `textarea#waiting-reason-${otherWaitingSendBack.id}[name="reason"]`
      )!
      expect(waitingTextarea.textContent).toBe(expectedAdvice.sendBackReason)
      expect(waitingTextarea.parentElement?.tagName).toBe("DIV")
      expect(
        waitingTextarea.parentElement?.querySelector(`label[for="waiting-reason-${otherWaitingSendBack.id}"]`)
          ?.textContent
      ).toBe("Yêu cầu chỉnh sửa")
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
      // DESIGN.md 6 "One primary per view": zero .btn-primary buttons inside #organizers.
      expect(organizersSection.querySelectorAll(".btn-primary")).toHaveLength(0)

      const organizerItems = Array.from(organizersSection.querySelectorAll("li"))
      expect(organizerItems).toHaveLength(3)

      // 1) Actionable other organizer gets secondary "Xác minh: ..." and danger "Từ chối: ..." forms.
      expect(organizerItems[0]!.textContent).toContain("Quỹ Ánh Dương")
      expect(organizerItems[0]!.textContent).toContain("Tên pháp lý: Công ty TNHH Ánh Dương · Tổ chức")
      const verifyForms = Array.from(organizerItems[0]!.querySelectorAll("form"))
      expect(verifyForms).toHaveLength(2)
      expect(
        verifyForms.map((form) => {
          const btn = form.querySelector('button[type="submit"]')!
          return {
            button: btn.textContent.trim(),
            srOnly: btn.querySelector(".sr-only")?.textContent,
            className: btn.className,
            inputs: Object.fromEntries(
              Array.from(form.querySelectorAll('input[type="hidden"]')).map((i) => [
                i.getAttribute("name"),
                i.getAttribute("value"),
              ])
            ),
          }
        })
      ).toEqual([
        {
          button: "Xác minh: Quỹ Ánh Dương",
          srOnly: ": Quỹ Ánh Dương",
          className: "btn-secondary",
          inputs: {
            status: "verified",
            expected_legal_name: "Công ty TNHH Ánh Dương",
            expected_display_name: "Quỹ Ánh Dương",
            expected_kind: "organization",
          },
        },
        {
          button: "Từ chối: Quỹ Ánh Dương",
          srOnly: ": Quỹ Ánh Dương",
          className: "btn-danger",
          inputs: {
            status: "rejected",
            expected_legal_name: "Công ty TNHH Ánh Dương",
            expected_display_name: "Quỹ Ánh Dương",
            expected_kind: "organization",
          },
        },
      ])

      // 2) Moderator's own organizer profile shows explicit warning Callout and zero forms.
      expect(organizerItems[1]!.textContent).toContain("Kiểm Duyệt")
      expect(organizerItems[1]!.textContent).toContain("Tên pháp lý: Trần Kiểm Duyệt · Cá nhân")
      expect(organizerItems[1]!.textContent).toContain("Đây là hồ sơ của bạn; một kiểm duyệt viên khác cần xác minh.")
      expect(organizerItems[1]!.querySelector(".bg-warning-soft")).toBeTruthy()
      expect(organizerItems[1]!.querySelectorAll("form")).toHaveLength(0)

      // 3) Already-rejected organizer profile (sorted after actionable ones) hides the no-op "Từ chối" button.
      expect(organizerItems[2]!.textContent).toContain("Hồ Sơ Cần Sửa")
      const rejectedForms = Array.from(organizerItems[2]!.querySelectorAll("form"))
      expect(rejectedForms).toHaveLength(1)
      expect(rejectedForms[0]!.querySelector('button[type="submit"]')?.textContent.trim()).toBe(
        "Xác minh: Hồ Sơ Cần Sửa"
      )
      expect(rejectedForms[0]!.querySelector('input[name="status"]')?.getAttribute("value")).toBe("verified")
      expect(organizerItems[2]!.textContent).not.toContain("Từ chối:")
    })

    it("prompts window.confirm before rejecting an organizer and skips confirm when verifying", async () => {
      ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
      const org = organizerRow(OTHER_USER, {
        kind: "organization",
        legal_name: "Công ty TNHH Ánh Dương",
        display_name: "Quỹ Ánh Dương",
      })
      setupAdmin({ organizers: [org] })

      const container = document.createElement("div")
      document.body.append(container)
      const root = createRoot(container)
      const originalConfirm = window.confirm
      const confirmMock = vi.fn<(message?: string) => boolean>()
      window.confirm = confirmMock

      try {
        const element = await AdminReviewPage()
        await act(async () => {
          root.render(element)
        })

        const buttons = [
          ...container.querySelectorAll<HTMLButtonElement>(
            'section[aria-labelledby="organizers"] button[type="submit"]'
          ),
        ]
        expect(buttons.map((b) => b.textContent?.trim())).toEqual(["Xác minh: Quỹ Ánh Dương", "Từ chối: Quỹ Ánh Dương"])

        // Declining confirmation cancels rejection before calling the RPC.
        state.calls.length = 0
        confirmMock.mockReturnValueOnce(false)
        await act(async () => {
          buttons[1]!.click()
        })
        expect(confirmMock).toHaveBeenCalledWith("Từ chối xác minh hồ sơ “Quỹ Ánh Dương”?")
        expect(state.calls.filter((c) => c.target === "rpc:set_organizer_verification")).toHaveLength(0)

        // Accepting confirmation submits set_organizer_verification with p_status = "rejected".
        confirmMock.mockReturnValueOnce(true)
        await act(async () => {
          buttons[1]!.click()
        })
        const rejectCalls = state.calls.filter((c) => c.target === "rpc:set_organizer_verification")
        expect(rejectCalls).toHaveLength(1)
        expect(op(rejectCalls[0], "args")?.[0]).toMatchObject({
          p_user_id: OTHER_USER,
          p_status: "rejected",
          p_expected_legal_name: "Công ty TNHH Ánh Dương",
          p_expected_display_name: "Quỹ Ánh Dương",
          p_expected_kind: "organization",
        })

        // Clicking "Xác minh" submits without prompting window.confirm.
        confirmMock.mockClear()
        state.calls.length = 0
        await act(async () => {
          buttons[0]!.click()
        })
        expect(confirmMock).not.toHaveBeenCalled()
        const verifyCalls = state.calls.filter((c) => c.target === "rpc:set_organizer_verification")
        expect(verifyCalls).toHaveLength(1)
        expect(op(verifyCalls[0], "args")?.[0]).toMatchObject({
          p_user_id: OTHER_USER,
          p_status: "verified",
        })
      } finally {
        window.confirm = originalConfirm
        act(() => root.unmount())
        container.remove()
      }
    })
  })

  describe("campaign status & review history disclosure (DOS/Give#282)", () => {
    it("batch-loads campaign_status_events across #queue and #waiting without actor_id and renders <StatusHistory> only where events exist", async () => {
      const queuedWithHistory = reviewRow("12121212-1212-4212-8212-121212121212", {
        title: "Xây lớp học Điểm Cao",
      })
      const queuedWithoutHistory = reviewRow("34343434-3434-4434-8434-343434343434", {
        title: "Giếng nước sạch Bản Xa",
      })
      const waitingWithHistory = waitingRow("56565656-5656-4656-8656-565656565656", "account_not_owned", {
        title: "Sách giáo khoa vùng lũ",
      })

      setupAdmin({
        queue: [queuedWithHistory, queuedWithoutHistory],
        waiting: [waitingWithHistory],
        statusEvents: [
          {
            id: 30,
            campaign_id: queuedWithHistory.id,
            from_status: "changes_requested",
            to_status: "in_review",
            reason: "Đã đính kèm văn bản xác nhận của xã.",
            created_at: "2026-11-18T06:00:00.000Z",
          },
          {
            id: 22,
            campaign_id: queuedWithHistory.id,
            from_status: "in_review",
            to_status: "changes_requested",
            reason: "Bổ sung dự toán vật tư.\nNêu rõ đơn vị thi công.",
            created_at: "2026-11-17T02:30:00.000Z",
          },
          {
            id: 18,
            campaign_id: waitingWithHistory.id,
            from_status: "in_review",
            to_status: "approved",
            reason: null,
            created_at: "2026-11-12T09:00:00.000Z",
          },
        ],
      })

      const { queueSection, waitingSection } = await renderAdmin()

      const historyCalls = state.calls.filter((c) => c.target === "campaign_status_events")
      expect(historyCalls).toHaveLength(1)
      const selectCols = String(op(historyCalls[0], "select")?.[0] ?? "")
      expect(selectCols).toBe("id, campaign_id, from_status, to_status, reason, created_at")
      expect(selectCols).not.toContain("actor_id")
      expect(op(historyCalls[0], "in")).toEqual([
        "campaign_id",
        [queuedWithHistory.id, queuedWithoutHistory.id, waitingWithHistory.id],
      ])
      expect(op(historyCalls[0], "order")).toEqual(["id", { ascending: false }])

      const queueCards = Array.from(queueSection.querySelector("ul")!.children)
      expect(queueCards).toHaveLength(2)

      // Queued campaign with 2 events renders <details> with sr-only title, transitions and multiline reason.
      const qDetails = queueCards[0]!.querySelector("details")!
      expect(qDetails).toBeTruthy()
      expect(qDetails.querySelector("summary")?.textContent).toContain("Lịch sử trạng thái (2): Xây lớp học Điểm Cao")
      expect(qDetails.querySelector("summary .sr-only")?.textContent).toBe(": Xây lớp học Điểm Cao")
      const qEvents = Array.from(qDetails.querySelectorAll("ol > li"))
      expect(qEvents).toHaveLength(2)
      expect(qEvents[0]!.textContent).toContain(`${STATUS_LABELS.changes_requested} → ${STATUS_LABELS.in_review}`)
      expect(qEvents[0]!.textContent).toContain(formatDateTime("2026-11-18T06:00:00.000Z"))
      expect(qEvents[1]!.textContent).toContain(`${STATUS_LABELS.in_review} → ${STATUS_LABELS.changes_requested}`)
      const qReason = qEvents[1]!.querySelector("p")!
      expect(qReason.className).toContain("whitespace-pre-line")
      expect(qReason.className).toContain("max-w-[68ch]")
      expect(qReason.textContent).toBe("Bổ sung dự toán vật tư.\nNêu rõ đơn vị thi công.")

      // Queued campaign with 0 events renders no <details>.
      expect(queueCards[1]!.querySelector("details")).toBeNull()

      // Waiting campaign with 1 event renders <details>.
      const waitingCards = Array.from(waitingSection.querySelector("ul")!.children)
      const wDetails = waitingCards[0]!.querySelector("details")!
      expect(wDetails).toBeTruthy()
      expect(wDetails.querySelector("summary")?.textContent).toContain("Lịch sử trạng thái (1): Sách giáo khoa vùng lũ")
      expect(wDetails.textContent).toContain(`${STATUS_LABELS.in_review} → ${STATUS_LABELS.approved}`)
    })

    it("keeps /admin usable when campaign_status_events fails (.catch(() => new Map()))", async () => {
      const queued = reviewRow("78787878-7878-4878-8878-787878787878", { title: "Áo mưa cho học trò" })
      const waitingItem = waitingRow("90909090-9090-4090-8090-909090909090", "account_not_owned", {
        title: "Cầu dân sinh Xóm Bến",
      })
      setupAdmin({
        queue: [queued],
        waiting: [waitingItem],
        statusEventsError: { code: "42501", message: "permission denied" },
      })

      const { queueSection, waitingSection } = await renderAdmin()

      expect(queueSection.textContent).toContain("Áo mưa cho học trò")
      expect(queueSection.querySelector("details")).toBeNull()
      expect(waitingSection.textContent).toContain("Cầu dân sinh Xóm Bến")
      expect(waitingSection.querySelector("details")).toBeNull()
    })
  })

  describe("pre-launch recovery section (#recovery, DOS/Give#77)", () => {
    it("renders EmptyState when no campaign needs pre-launch recovery and isolates RPC errors", async () => {
      setupAdmin({ recovery: [] })
      const { recoverySection } = await renderAdmin()
      expect(recoverySection.querySelector("h2")?.textContent).toContain("0")
      expect(recoverySection.querySelector("h3")?.textContent.trim()).toBe(
        "Không có chiến dịch nào cần xử lý trước khi mở."
      )

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      const queued = reviewRow("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", { title: "Áo ấm vùng cao" })
      setupAdmin({
        queue: [queued],
        recoveryError: { code: "42501", message: "permission denied" },
      })
      const rendered = await renderAdmin()
      expect(errorSpy).toHaveBeenCalledWith("campaigns_needing_recovery failed", "42501", "permission denied")
      expect(rendered.recoverySection.querySelector(".bg-danger-soft")?.textContent).toContain(
        "Chưa tải được danh sách này."
      )
      expect(rendered.queueSection.textContent).toContain("Áo ấm vùng cao")
    })

    it("renders approved_past_end and suspended_before_start items with from_status guards, self-review guards, and StatusHistory", async () => {
      const pastEnd = recoveryRow("77111111-1111-4111-8111-111111111111", "approved_past_end", null, {
        title: "Học bổng mùa thu",
      })
      const suspendedDisabled = recoveryRow(
        "77222222-2222-4222-8222-222222222222",
        "suspended_before_start",
        "account_not_verified",
        {
          title: "Trạm nước sạch",
          review_note: "Kiểm tra lại giấy tờ thụ hưởng.",
        }
      )
      const suspendedUsable = recoveryRow("77333333-3333-4333-8333-333333333333", "suspended_before_start", null, {
        title: "Tủ sách bản cao",
      })
      const suspendedBackWithTx = recoveryRow(
        "77444444-4444-4444-8444-444444444444",
        "suspended_before_start",
        "account_not_verified",
        {
          type: "back",
          funding_model: "all_or_nothing",
          title: "Sách ảnh thủ công",
          account_has_transactions: true,
        }
      )
      const ownSuspended = recoveryRow("77555555-5555-4555-8555-555555555555", "suspended_before_start", "no_account", {
        organizer_id: STAFF_USER,
        title: "Chiến dịch tạm dừng của kiểm duyệt viên",
      })

      setupAdmin({
        recovery: [pastEnd, suspendedDisabled, suspendedUsable, suspendedBackWithTx, ownSuspended],
        statusEvents: [
          {
            id: 99,
            campaign_id: suspendedDisabled.id,
            from_status: "approved",
            to_status: "suspended",
            reason: "Kiểm tra lại giấy tờ thụ hưởng.",
            created_at: "2026-11-19T10:00:00.000Z",
          },
        ],
      })

      const { recoverySection } = await renderAdmin()
      expect(recoverySection.querySelector("h2")?.textContent).toContain("5")
      expect(recoverySection.querySelectorAll(".btn-primary")).toHaveLength(0)

      const cards = Array.from(recoverySection.querySelectorAll("ul > li"))
      expect(cards).toHaveLength(5)

      // 1) approved_past_end -> from_status="approved" + prefilled reason
      expect(cards[0]!.textContent).toContain("Học bổng mùa thu")
      expect(cards[0]!.textContent).toContain("Đã duyệt nhưng quá ngày kết thúc")
      const pastEndForm = cards[0]!.querySelector("form")!
      expect(pastEndForm.querySelector('input[name="from_status"]')?.getAttribute("value")).toBe("approved")
      expect(pastEndForm.querySelector("textarea")?.textContent).toBe(recoveryAdvice(pastEnd).sendBackReason)

      // 2) suspended_before_start with disabled account -> from_status="suspended", shows review_note + StatusHistory
      expect(cards[1]!.textContent).toContain("Trạm nước sạch")
      expect(cards[1]!.textContent).toContain("Tạm dừng trước ngày bắt đầu")
      expect(cards[1]!.textContent).toContain(accountProblemLabel("account_not_verified"))
      expect(cards[1]!.textContent).toContain("Kiểm tra lại giấy tờ thụ hưởng.")
      expect(cards[1]!.querySelector("details summary")?.textContent).toContain(
        "Lịch sử trạng thái (1): Trạm nước sạch"
      )
      const suspendedForm = cards[1]!.querySelector("form")!
      expect(suspendedForm.querySelector('input[name="from_status"]')?.getAttribute("value")).toBe("suspended")
      expect(suspendedForm.querySelector("textarea")?.textContent).toBe(
        recoveryAdvice(suspendedDisabled).sendBackReason
      )

      // 3) suspended_before_start with usable account -> empty textarea with placeholder, from_status="suspended"
      const usableForm = cards[2]!.querySelector("form")!
      expect(usableForm.querySelector('input[name="from_status"]')?.getAttribute("value")).toBe("suspended")
      expect(usableForm.querySelector("textarea")?.textContent).toBe("")
      expect(usableForm.querySelector("textarea")?.getAttribute("placeholder")).toContain("Người tổ chức cần sửa gì")

      // 4) back campaign with transactions -> guidance Callout only, no send-back form
      expect(cards[3]!.textContent).toContain("dự án có quà tặng chưa hỗ trợ đổi tài khoản")
      expect(cards[3]!.querySelectorAll("form")).toHaveLength(0)

      // 5) moderator's own suspended campaign -> self-review guard, no form
      expect(cards[4]!.textContent).toContain("Đây là chiến dịch của bạn; một kiểm duyệt viên khác cần xử lý.")
      expect(cards[4]!.querySelectorAll("form")).toHaveLength(0)
    })
  })
})
