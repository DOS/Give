// @vitest-environment happy-dom
import { Window } from "happy-dom"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { CampaignStatus, CampaignType } from "@/lib/campaigns"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const MILESTONE_1 = "33333333-3333-4333-8333-333333333333"
const MILESTONE_2 = "44444444-4444-4444-8444-444444444444"
/** Give's contact address as the page renders it (DOS/Give#205). */
const LINK = '<a href="mailto:hi@give.vn" class="font-medium underline">hi@give.vn</a>'

const state = vi.hoisted(() => ({
  handler: (() => undefined) as Handler,
  serviceHandler: (() => undefined) as Handler,
  calls: [] as Call[],
  serviceCalls: [] as Call[],
}))

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
  redirect: vi.fn(),
  usePathname: () => `/me/campaigns/${CAMPAIGN}`,
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => ({ user: { id: USER, email: null, name: null }, accessToken: "token" })),
  requireSession: vi.fn(async () => ({ user: { id: USER, email: null, name: null }, accessToken: "token" })),
}))
vi.mock("@/lib/supabase", () => ({
  MEDIA_BUCKET: "give-media",
  dbAs: () => fakeDb((call) => state.handler(call), state.calls),
  dbService: () => fakeDb((call) => state.serviceHandler(call), state.serviceCalls),
}))

const { default: EditCampaignPage } = await import("./page")

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

function campaignRow(status: CampaignStatus, type: CampaignType) {
  return {
    id: CAMPAIGN,
    organizer_id: USER,
    slug: "chien-dich-a",
    title: "Chiến dịch thử nghiệm",
    type,
    status,
    category_id: "cat-1",
    summary: "Tóm tắt chiến dịch",
    story: "Câu chuyện dài ít nhất một trăm ký tự để kiểm tra trang chỉnh sửa chiến dịch khi tài khoản nhận gặp sự cố.",
    beneficiary_name: "Người thụ hưởng",
    beneficiary_relation: "Cộng đồng",
    goal_amount: 10_000_000,
    stretch_goal_amount: null,
    min_contribution: 20_000,
    payment_window_days: 7,
    starts_at: null,
    ends_at: "2026-12-31T00:00:00.000Z",
    review_note: "Cần cập nhật lại tài khoản",
    display_options: {},
    cover: null,
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z",
  }
}

function accountWithDisabledBinding() {
  return [
    {
      id: "acc-1",
      owner_user_id: USER,
      channel: "statement_import",
      bank_bin: "970436",
      account_number: "0011012345678",
      account_name: "NGUYEN THI DAO",
      account_kind: "standard",
      public_statement_url: null,
      verification_status: "disabled",
      verification_code: "GIVEV123",
      review_note: null,
      verified_at: "2026-11-01T00:00:00.000Z",
      created_at: "2026-11-01T00:00:00.000Z",
      updated_at: "2026-11-01T00:00:00.000Z",
      bindings: [{ id: "b-1", campaign_id: CAMPAIGN, bound_at: "2026-11-01T00:00:00.000Z", released_at: null }],
    },
  ]
}

function setupUnusableWithTransactions(status: CampaignStatus, type: CampaignType) {
  state.handler = (call) => {
    if (call.target === "rpc:managed_campaigns") return { data: campaignRow(status, type) }
    if (call.target === "categories") return { data: [] }
    if (call.target === "campaign_milestones") return { data: [] }
    if (call.target === "campaign_updates") return { data: [] }
    if (call.target === "reward_tiers") return { data: [] }
    if (call.target === "receiving_accounts") return { data: accountWithDisabledBinding() }
    if (call.target === "organizers") return { data: { legal_name: "Nguyễn Thị Đào", verification_status: "verified" } }
    if (call.target === "bank_transactions") return { data: [{ id: "tx-1" }] }
    if (call.target === "account_swap_requests") return { data: [] }
    return undefined
  }
}

beforeEach(() => {
  state.calls.length = 0
  state.serviceCalls.length = 0
  state.serviceHandler = () => undefined
})

describe("EditCampaignPage unusable bound account with recorded transactions (DOS/Give#77)", () => {
  it("guides a sent-back give campaign to the finance-approved swap and hides early release", async () => {
    setupUnusableWithTransactions("changes_requested", "give")
    const html = renderToStaticMarkup(await EditCampaignPage({ params: Promise.resolve({ id: CAMPAIGN }) }))
    expect(html).not.toContain(">Nhả tài khoản<")
    expect(html).toContain("đề nghị đổi tài khoản bên dưới")
    expect(html).toContain(">Đổi tài khoản nhận</h3>")
    expect(html).toContain("gửi yêu cầu đổi tài khoản trong mục")
    expect(html).not.toContain("để được hỗ trợ")
  })

  it("hides early release and directs a draft give campaign to contact Give without offering a swap", async () => {
    setupUnusableWithTransactions("draft", "give")
    const html = renderToStaticMarkup(await EditCampaignPage({ params: Promise.resolve({ id: CAMPAIGN }) }))
    expect(html).not.toContain(">Nhả tài khoản<")
    expect(html).not.toContain("Đổi tài khoản nhận")
    expect(html).not.toContain("đề nghị đổi tài khoản bên dưới")
    expect(html).toContain(`nếu nó không dùng được nữa, hãy liên hệ đội ngũ Give qua email ${LINK}.`)
    expect(html).toContain(`hãy liên hệ đội ngũ Give qua email ${LINK} để được hỗ trợ.`)
  })

  it("hides early release and directs a sent-back back campaign to contact Give without offering a swap", async () => {
    setupUnusableWithTransactions("changes_requested", "back")
    const html = renderToStaticMarkup(await EditCampaignPage({ params: Promise.resolve({ id: CAMPAIGN }) }))
    expect(html).not.toContain(">Nhả tài khoản<")
    expect(html).not.toContain("Đổi tài khoản nhận")
    expect(html).toContain(`nếu nó không dùng được nữa, hãy liên hệ đội ngũ Give qua email ${LINK}.`)
    expect(html).toContain(`hãy liên hệ đội ngũ Give qua email ${LINK} để được hỗ trợ.`)
  })
})

// The summary is shown in the campaign story, while cards omit descriptions.
describe("EditCampaignPage summary guidance (DOS/Give#228)", () => {
  it("describes the summary's actual placement and keeps its accessible hint", async () => {
    setupUnusableWithTransactions("draft", "give")
    const doc = new Window().document
    doc.body.innerHTML = renderToStaticMarkup(await EditCampaignPage({ params: Promise.resolve({ id: CAMPAIGN }) }))
    const summary = doc.querySelector('textarea[name="summary"]')!
    const hintId = summary.getAttribute("aria-describedby")!
    const hints = doc.querySelectorAll(`[id="${hintId}"]`)

    expect(summary.getAttribute("maxlength")).toBe("200")
    expect(hints).toHaveLength(1)
    expect(hints[0].textContent).toBe("Tối đa 200 ký tự, hiện ở đầu phần Câu chuyện trên trang chiến dịch.")
  })
})

function publicTotals(overrides: Record<string, unknown> = {}) {
  return {
    id: CAMPAIGN,
    goal_amount: 10_000_000,
    paid_amount: 12_000_000,
    pledged_amount: 12_000_000,
    refunded_amount: 0,
    disbursed_amount: 0,
    other_in_amount: 0,
    unexplained_out_count: 0,
    refund_owed_amount: 0,
    supporters_count: 0,
    backers_count: 15,
    payments_stopped_at: null,
    payments_stopped_note: null,
    own_transfer_amount: 0,
    ...overrides,
  }
}

describe("EditCampaignPage stopped payments, post-live StatusNotice, and form/milestone a11y (DOS/Give#241)", () => {
  it.each([
    ["settling", "back", "bg-surface", "Dự án đã hết thời gian nhận cam kết và đang tất toán kết quả."],
    [
      "succeeded",
      "back",
      "bg-primary-soft",
      "Dự án đã gây quỹ thành công. Người ủng hộ đang thanh toán cam kết; bạn vẫn đăng cập nhật, giải trình chi và cập nhật giao quà được.",
    ],
    [
      "failed",
      "back",
      "bg-surface",
      "Dự án đã kết thúc mà chưa đạt mục tiêu. Các cam kết đã được hủy; người ủng hộ không phải thanh toán.",
    ],
    [
      "closed",
      "give",
      "bg-surface",
      "Chiến dịch đã kết thúc nhận ủng hộ. Sao kê vẫn công khai; bạn vẫn đăng cập nhật và giải trình chi được.",
    ],
  ] as const)("renders StatusNotice for post-live %s (%s) campaigns", async (status, type, toneClass, expectedText) => {
    state.handler = (call) => {
      if (call.target === "rpc:managed_campaigns") return { data: campaignRow(status, type) }
      if (call.target === "public_campaigns") return { data: publicTotals() }
      if (call.target === "categories") return { data: [] }
      if (call.target === "campaign_milestones") return { data: [] }
      if (call.target === "campaign_updates") return { data: [] }
      if (call.target === "reward_tiers") return { data: [] }
      if (call.target === "receiving_accounts") return { data: [] }
      return undefined
    }

    const html = renderToStaticMarkup(await EditCampaignPage({ params: Promise.resolve({ id: CAMPAIGN }) }))
    expect(html).toContain(toneClass)
    expect(html).toContain(expectedText)
    expect(html).not.toContain("Give đang tạm dừng yêu cầu thanh toán")
  })

  it("surfaces a warning Callout when totals.payments_stopped_at is set (with and without payments_stopped_note)", async () => {
    state.handler = (call) => {
      if (call.target === "rpc:managed_campaigns") return { data: campaignRow("succeeded", "back") }
      if (call.target === "public_campaigns") {
        return {
          data: publicTotals({
            payments_stopped_at: "2026-11-16T03:30:00.000Z",
            payments_stopped_note: "Tạm dừng để đối chiếu chứng từ xưởng sản xuất.",
          }),
        }
      }
      if (call.target === "categories") return { data: [] }
      if (call.target === "campaign_milestones") return { data: [] }
      if (call.target === "campaign_updates") return { data: [] }
      if (call.target === "reward_tiers") return { data: [] }
      if (call.target === "receiving_accounts") return { data: [] }
      return undefined
    }

    const withNoteHtml = renderToStaticMarkup(await EditCampaignPage({ params: Promise.resolve({ id: CAMPAIGN }) }))
    expect(withNoteHtml).toContain("bg-warning-soft")
    expect(withNoteHtml).toContain("Give đang tạm dừng yêu cầu thanh toán của dự án này từ")
    expect(withNoteHtml).toContain("Tạm dừng để đối chiếu chứng từ xưởng sản xuất.")
    expect(withNoteHtml).toContain(LINK)
    expect(withNoteHtml).not.toContain("Người ủng hộ đang thanh toán cam kết")

    state.handler = (call) => {
      if (call.target === "rpc:managed_campaigns") return { data: campaignRow("succeeded", "back") }
      if (call.target === "public_campaigns") {
        return {
          data: publicTotals({
            payments_stopped_at: "2026-11-16T03:30:00.000Z",
            payments_stopped_note: null,
          }),
        }
      }
      if (call.target === "categories") return { data: [] }
      if (call.target === "campaign_milestones") return { data: [] }
      if (call.target === "campaign_updates") return { data: [] }
      if (call.target === "reward_tiers") return { data: [] }
      if (call.target === "receiving_accounts") return { data: [] }
      return undefined
    }

    const withoutNoteHtml = renderToStaticMarkup(await EditCampaignPage({ params: Promise.resolve({ id: CAMPAIGN }) }))
    expect(withoutNoteHtml).toContain("Give đang tạm dừng yêu cầu thanh toán của dự án này từ")
    expect(withoutNoteHtml).not.toContain("Tạm dừng để đối chiếu chứng từ")
  })

  it("marks payment_window_days required on back campaigns", async () => {
    setupUnusableWithTransactions("draft", "back")
    const doc = new Window().document
    doc.body.innerHTML = renderToStaticMarkup(await EditCampaignPage({ params: Promise.resolve({ id: CAMPAIGN }) }))
    const input = doc.querySelector('#payment_window_days[name="payment_window_days"]')
    expect(input).not.toBeNull()
    expect(input?.hasAttribute("required")).toBe(true)
    expect(input?.getAttribute("min")).toBe("1")
    expect(input?.getAttribute("max")).toBe("30")
  })

  it("guards deleteMilestone with window.confirm and includes milestone.title in each delete button's accessible name", async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    state.handler = (call) => {
      if (call.target === "rpc:managed_campaigns") {
        return { data: { ...campaignRow("draft", "give"), cover_media_id: null } }
      }
      if (call.target === "categories") return { data: [] }
      if (call.target === "campaign_milestones") {
        return op(call, "delete")
          ? { data: [{ id: MILESTONE_1 }] }
          : {
              data: [
                {
                  id: MILESTONE_1,
                  campaign_id: CAMPAIGN,
                  title: "Mua vật liệu",
                  description: null,
                  target_amount: 3_000_000,
                  unlock_note: null,
                  sort_order: 0,
                },
                {
                  id: MILESTONE_2,
                  campaign_id: CAMPAIGN,
                  title: "Lắp đặt tại điểm trường",
                  description: null,
                  target_amount: 10_000_000,
                  unlock_note: null,
                  sort_order: 1,
                },
              ],
            }
      }
      if (call.target === "campaign_updates") return { data: [] }
      if (call.target === "receiving_accounts") return { data: [] }
      return undefined
    }

    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)
    const originalConfirm = window.confirm
    const confirmMock = vi.fn<(message?: string) => boolean>()
    window.confirm = confirmMock

    try {
      const pageElement = await EditCampaignPage({ params: Promise.resolve({ id: CAMPAIGN }) })
      await act(async () => {
        root.render(pageElement)
      })

      const milestoneButtons = [
        ...container.querySelectorAll<HTMLButtonElement>('#milestones ol button[type="submit"]'),
      ]
      const deleteButtons = milestoneButtons.filter((button) => button.textContent?.startsWith("Xóa"))
      const saveButtons = milestoneButtons.filter((button) => button.textContent?.startsWith("Lưu mốc"))
      expect(deleteButtons).toHaveLength(2)
      expect(deleteButtons[0].textContent).toBe("Xóa mốc Mua vật liệu")
      expect(deleteButtons[0].querySelector(".sr-only")?.textContent).toBe(" mốc Mua vật liệu")
      expect(deleteButtons[1].textContent).toBe("Xóa mốc Lắp đặt tại điểm trường")
      expect(saveButtons).toHaveLength(2)
      expect(saveButtons[0].textContent).toBe("Lưu mốc: Mua vật liệu")
      expect(saveButtons[1].textContent).toBe("Lưu mốc: Lắp đặt tại điểm trường")

      // Declining confirmation prevents deleteMilestone from executing.
      state.calls.length = 0
      confirmMock.mockReturnValueOnce(false)
      await act(async () => {
        deleteButtons[0].click()
      })
      expect(confirmMock).toHaveBeenCalledWith("Xóa mốc “Mua vật liệu”?")
      expect(state.calls).toHaveLength(0)

      // Accepting confirmation submits deleteMilestone for MILESTONE_1.
      confirmMock.mockReturnValueOnce(true)
      await act(async () => {
        deleteButtons[0].click()
      })
      expect(state.calls.some((c) => c.target === "campaign_milestones" && Boolean(op(c, "delete")))).toBe(true)
    } finally {
      window.confirm = originalConfirm
      act(() => root.unmount())
      container.remove()
    }
  })
})

describe("EditCampaignPage YouTube pitch video and inline milestone editing (DOS/Give#269)", () => {
  it("renders editable #pitch-video form without remove button when no video exists, and read-only states when locked", async () => {
    setupUnusableWithTransactions("draft", "give")
    const emptyDraftDoc = new Window().document
    emptyDraftDoc.body.innerHTML = renderToStaticMarkup(
      await EditCampaignPage({ params: Promise.resolve({ id: CAMPAIGN }) })
    )

    expect(emptyDraftDoc.querySelector('nav a[href="#pitch-video"]')?.textContent).toBe("Video giới thiệu")
    const ytInput = emptyDraftDoc.querySelector('#pitch-video input#youtube_id[name="youtube_id"]')
    expect(ytInput).not.toBeNull()
    expect(ytInput?.getAttribute("aria-describedby")).toBe("youtube_id_hint")
    expect(emptyDraftDoc.querySelector("#youtube_id_hint")?.textContent).toContain("11 ký tự")
    expect(emptyDraftDoc.querySelector('#pitch-video input#youtube_alt[name="alt"]')?.getAttribute("maxlength")).toBe(
      "200"
    )
    expect(emptyDraftDoc.querySelector("#pitch-video")?.textContent).toContain("Lưu video")
    expect(emptyDraftDoc.querySelector("#pitch-video")?.textContent).not.toContain("Gỡ video")

    // Locked campaign with a saved YouTube video renders read-only summary link and hides edit/remove forms.
    state.handler = (call) => {
      if (call.target === "rpc:managed_campaigns") return { data: campaignRow("in_review", "give") }
      if (call.target === "categories") return { data: [] }
      if (call.target === "campaign_milestones") {
        return {
          data: [
            {
              id: MILESTONE_1,
              campaign_id: CAMPAIGN,
              title: "Mua vật liệu",
              description: " Xi măng và gạch ",
              target_amount: 3_000_000,
              unlock_note: "Đăng ảnh hóa đơn vật liệu",
              sort_order: 0,
            },
          ],
        }
      }
      if (call.target === "campaign_updates") return { data: [] }
      if (call.target === "receiving_accounts") return { data: [] }
      if (call.target === "campaign_media") {
        return { data: [{ id: "yt-1", youtube_id: "dQw4w9WgXcQ", alt: "Video khảo sát thực tế" }] }
      }
      return undefined
    }

    const lockedWithVideoDoc = new Window().document
    lockedWithVideoDoc.body.innerHTML = renderToStaticMarkup(
      await EditCampaignPage({ params: Promise.resolve({ id: CAMPAIGN }) })
    )
    const link = lockedWithVideoDoc.querySelector("#pitch-video a")
    expect(link?.getAttribute("href")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    expect(lockedWithVideoDoc.querySelector("#pitch-video")?.textContent).toContain("Mô tả: Video khảo sát thực tế")
    expect(lockedWithVideoDoc.querySelector('#pitch-video input[name="youtube_id"]')).toBeNull()
    expect(lockedWithVideoDoc.querySelector("#pitch-video")?.textContent).not.toContain("Gỡ video")
    expect(lockedWithVideoDoc.querySelector("#milestones")?.textContent).toContain(
      "Khi đạt mốc: Đăng ảnh hóa đơn vật liệu"
    )
    expect(lockedWithVideoDoc.querySelector("#milestones details")).toBeNull()

    // Failed campaign_media read degrades only #pitch-video with a danger Callout instead of crashing or lying.
    state.handler = (call) => {
      if (call.target === "rpc:managed_campaigns") return { data: campaignRow("draft", "give") }
      if (call.target === "categories") return { data: [] }
      if (call.target === "campaign_milestones") return { data: [] }
      if (call.target === "campaign_updates") return { data: [] }
      if (call.target === "receiving_accounts") return { data: [] }
      if (call.target === "campaign_media") return { error: { code: "57014", message: "timeout" } }
      return undefined
    }
    const degradedDoc = new Window().document
    degradedDoc.body.innerHTML = renderToStaticMarkup(
      await EditCampaignPage({ params: Promise.resolve({ id: CAMPAIGN }) })
    )
    expect(degradedDoc.querySelector("#pitch-video")?.textContent).toContain(
      "Không tải được video giới thiệu. Hãy tải lại trang."
    )
    expect(degradedDoc.querySelector('#pitch-video input[name="youtube_id"]')).toBeNull()
  })

  it("guards removeYoutubeVideo with window.confirm and submits inline milestone edits with unlock_note", async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    state.handler = (call) => {
      if (call.target === "rpc:managed_campaigns") {
        return { data: { ...campaignRow("draft", "give"), cover_media_id: null } }
      }
      if (call.target === "categories") return { data: [] }
      if (call.target === "campaign_milestones") {
        if (op(call, "update")) return { data: [{ id: MILESTONE_1 }] }
        return {
          data: [
            {
              id: MILESTONE_1,
              campaign_id: CAMPAIGN,
              title: "Mua vật liệu",
              description: "Đợt đầu",
              target_amount: 3_000_000,
              unlock_note: "Gửi biên nhận mua hàng",
              sort_order: 0,
            },
          ],
        }
      }
      if (call.target === "campaign_updates") return { data: [] }
      if (call.target === "receiving_accounts") return { data: [] }
      if (call.target === "campaign_media") {
        return { data: [{ id: "yt-1", youtube_id: "dQw4w9WgXcQ", alt: "Giới thiệu điểm trường" }] }
      }
      return undefined
    }

    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)
    const originalConfirm = window.confirm
    const confirmMock = vi.fn<(message?: string) => boolean>()
    window.confirm = confirmMock

    try {
      const pageElement = await EditCampaignPage({ params: Promise.resolve({ id: CAMPAIGN }) })
      await act(async () => {
        root.render(pageElement)
      })

      // Add-milestone form includes unlock_note field.
      const addUnlock = container.querySelector<HTMLTextAreaElement>(
        '#milestones #milestone_unlock_note[name="unlock_note"]'
      )
      expect(addUnlock).not.toBeNull()
      expect(addUnlock?.getAttribute("maxlength")).toBe("500")
      expect(addUnlock?.getAttribute("aria-describedby")).toBe("milestone_unlock_note_hint")

      // Inline <details> "Sửa mốc" renders contextualized summary and prefilled fields.
      const summary = container.querySelector("#milestones ol details summary")
      expect(summary?.textContent).toBe("Sửa mốc: Mua vật liệu")
      expect(summary?.querySelector(".sr-only")?.textContent).toBe(": Mua vật liệu")

      const editUnlock = container.querySelector<HTMLTextAreaElement>(
        `#milestones #milestone_${MILESTONE_1}_unlock_note[name="unlock_note"]`
      )
      expect(editUnlock?.value).toBe("Gửi biên nhận mua hàng")

      // Submit inline milestone edit form.
      const saveMilestoneBtn = [
        ...container.querySelectorAll<HTMLButtonElement>('#milestones ol details button[type="submit"]'),
      ][0]
      state.calls.length = 0
      await act(async () => {
        saveMilestoneBtn.click()
      })
      const updateCall = state.calls.find((c) => c.target === "campaign_milestones" && Boolean(op(c, "update")))
      expect(op(updateCall, "update")).toEqual([
        {
          title: "Mua vật liệu",
          target_amount: 3_000_000,
          description: "Đợt đầu",
          unlock_note: "Gửi biên nhận mua hàng",
        },
      ])
      expect(updateCall?.ops).toContainEqual(["eq", "id", MILESTONE_1])
      expect(updateCall?.ops).toContainEqual(["eq", "campaign_id", CAMPAIGN])

      // Guard removeYoutubeVideo with window.confirm.
      const removeBtn = [...container.querySelectorAll<HTMLButtonElement>('#pitch-video button[type="submit"]')].find(
        (b) => b.textContent === "Gỡ video"
      )!
      expect(removeBtn).toBeDefined()

      state.calls.length = 0
      state.serviceCalls.length = 0
      confirmMock.mockReturnValueOnce(false)
      await act(async () => {
        removeBtn.click()
      })
      expect(confirmMock).toHaveBeenCalledWith("Gỡ video giới thiệu khỏi chiến dịch?")
      expect(state.serviceCalls).toHaveLength(0)

      confirmMock.mockReturnValueOnce(true)
      await act(async () => {
        removeBtn.click()
      })
      expect(state.serviceCalls).toHaveLength(1)
      expect(state.serviceCalls[0].target).toBe("campaign_media")
      expect(state.serviceCalls[0].ops).toContainEqual(["eq", "campaign_id", CAMPAIGN])
      expect(state.serviceCalls[0].ops).toContainEqual(["eq", "kind", "youtube"])
    } finally {
      window.confirm = originalConfirm
      act(() => root.unmount())
      container.remove()
    }
  })
})
