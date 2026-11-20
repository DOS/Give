import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { CampaignStatus } from "@/lib/campaigns"
import { formatDate } from "@/lib/format"
import { fakeDb, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const NOW = new Date("2026-11-20T00:00:00.000Z")
const FUTURE = "2026-12-31T00:00:00.000Z"
const PAST = "2026-11-01T00:00:00.000Z"

const state = vi.hoisted(() => ({
  serviceHandler: (() => undefined) as Handler,
  serviceCalls: [] as Call[],
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn(), requireSession: vi.fn() }))
vi.mock("@/lib/supabase", () => ({
  MEDIA_BUCKET: "give-media",
  dbAs: vi.fn(),
  dbService: () => fakeDb((call) => state.serviceHandler(call), state.serviceCalls),
}))

const { campaignAllowsMonthly, loadPlanSupporters, MONTHLY_OFF_WARNING, MonthlySection, showMonthlySection } =
  await import("./MonthlySection")
type Supporter = Awaited<ReturnType<typeof loadPlanSupporters>>[number]

function render({
  status = "live",
  endsAt = FUTURE,
  allowMonthly = false,
  supporters = [],
}: {
  status?: CampaignStatus
  endsAt?: string | null
  allowMonthly?: boolean
  supporters?: Supporter[] | null
}): string {
  return renderToStaticMarkup(
    createElement(MonthlySection, { campaignId: CAMPAIGN, status, endsAt, allowMonthly, supporters, now: NOW })
  ).replace(/ /g, " ")
}

function submitButton(html: string): string {
  return html.match(/<button[^>]*type="submit"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? ""
}

beforeEach(() => {
  state.serviceCalls.length = 0
  state.serviceHandler = () => undefined
})

describe("MonthlySection (DOS/Give#276)", () => {
  it("explains plan A to the organizer: new code every month, no charge, more transfers, ends with the campaign", () => {
    const html = render({})
    expect(html).toContain('id="monthly"')
    expect(html).toContain("Ủng hộ hằng tháng")
    expect(html).toContain("Mỗi tháng Give gửi cho họ một mã ủng hộ mới")
    expect(html).toContain("Give không tự trừ tiền của ai")
    expect(html).toContain("một khoản ủng hộ bình thường vào tài khoản nhận của chiến dịch")
    expect(html).toContain("nhiều khoản chuyển nhỏ cần đối chiếu")
    expect(html).toContain("mặc định tắt")
    expect(html).toContain("mọi kế hoạch tự dừng khi chiến dịch kết thúc")
  })

  it("offers to turn it on when off and the campaign has a future end date", () => {
    const html = render({ allowMonthly: false })
    expect(html).toContain(">Đang tắt<")
    expect(html).toContain('<input type="hidden" name="enabled" value="true"/>')
    const button = submitButton(html)
    expect(button).toContain("Bật ủng hộ hằng tháng")
    expect(button).not.toContain("disabled")
    expect(html).not.toContain("chỉ bật được cho chiến dịch có ngày kết thúc.")
    // No supporters list while off.
    expect(html).not.toContain("người ủng hộ hằng tháng.")
    expect(html).not.toContain("Chưa có ai đăng ký")
  })

  it.each([
    ["draft", true],
    ["changes_requested", true],
    ["live", false],
  ] as const)(
    "disables turning on with the reason when the campaign has no end date (%s)",
    (status, pointsToContent) => {
      const html = render({ status, endsAt: null })
      const button = submitButton(html)
      expect(button).toContain("Bật ủng hộ hằng tháng")
      expect(button).toContain('disabled=""')
      expect(html).toContain("Ủng hộ hằng tháng chỉ bật được cho chiến dịch có ngày kết thúc.")
      expect(html.includes("Đặt ngày kết thúc ở mục Nội dung")).toBe(pointsToContent)
    }
  )

  it("when on, shows the count and display names, 'Ẩn danh' for anonymous, and never an amount or email", () => {
    const html = render({
      allowMonthly: true,
      supporters: [
        { display_name: "Chị Lan", is_anonymous: false, since: "2026-11-02T03:00:00.000Z" },
        { display_name: null, is_anonymous: true, since: "2026-11-05T03:00:00.000Z" },
        { display_name: "Anh Minh", is_anonymous: false, since: "2026-11-10T03:00:00.000Z" },
      ],
    })
    expect(html).toContain(">Đang bật<")
    expect(html).toMatch(/Đang có <span[^>]*>3<\/span> người ủng hộ hằng tháng\./)
    const items = [...html.matchAll(/<li[\s\S]*?<\/li>/g)].map((m) => m[0])
    expect(items).toHaveLength(3)
    expect(items[0]).toContain("Chị Lan")
    expect(items[0]).toContain(`từ ${formatDate("2026-11-02T03:00:00.000Z")}`)
    expect(items[1]).toContain("Ẩn danh")
    expect(items[2]).toContain("Anh Minh")
    expect(html).not.toContain("₫")
    expect(html).not.toContain("@")
  })

  it("shows 'Ẩn danh' for an anonymous row even if a name came back", () => {
    const html = render({
      allowMonthly: true,
      supporters: [{ display_name: "Không được lộ", is_anonymous: true, since: "2026-11-02T03:00:00.000Z" }],
    })
    expect(html).toContain("Ẩn danh")
    expect(html).not.toContain("Không được lộ")
  })

  it("says nobody has subscribed yet when on with no supporters", () => {
    const html = render({ allowMonthly: true, supporters: [] })
    expect(html).toContain("Chưa có ai đăng ký ủng hộ hằng tháng.")
  })

  it("shows a danger notice when the supporters could not be read, and still offers to turn it off", () => {
    const html = render({ allowMonthly: true, supporters: null })
    expect(html).toContain("bg-danger-soft")
    expect(html).toContain("Không tải được danh sách người ủng hộ hằng tháng. Hãy tải lại trang.")
    expect(submitButton(html)).toContain("Tắt ủng hộ hằng tháng")
  })

  it("warns that turning off stops every donor's plan while this month's code stays valid", () => {
    const html = render({ allowMonthly: true })
    expect(html).toContain('<input type="hidden" name="enabled" value="false"/>')
    expect(submitButton(html)).toContain("Tắt ủng hộ hằng tháng")
    expect(MONTHLY_OFF_WARNING).toContain("dừng kế hoạch của mọi người đang ủng hộ hằng tháng")
    expect(MONTHLY_OFF_WARNING).toContain("Mã ủng hộ của tháng này vẫn dùng được.")
    // Shown inline (the confirm dialog needs JavaScript).
    expect(html).toContain(MONTHLY_OFF_WARNING)
  })

  it("tells an editable campaign that the end date cannot be cleared while on", () => {
    expect(render({ status: "draft", allowMonthly: true })).toContain(
      "Khi đang bật, bạn không bỏ được ngày kết thúc của chiến dịch."
    )
    expect(render({ status: "live", allowMonthly: true })).not.toContain("không bỏ được ngày kết thúc")
  })

  it.each([false, true])("offers no toggle once the end date has passed (allowMonthly=%s)", (allowMonthly) => {
    const html = render({ endsAt: PAST, allowMonthly })
    expect(html).not.toContain("<form")
    expect(html).not.toContain('name="enabled"')
    expect(html).toContain("Chiến dịch đã quá ngày kết thúc nên không đổi được ủng hộ hằng tháng")
  })
})

describe("showMonthlySection", () => {
  it.each(["draft", "changes_requested", "in_review", "approved", "live", "suspended"] as const)(
    "shows it for a give campaign in %s",
    (status) => {
      expect(showMonthlySection("give", status)).toBe(true)
    }
  )

  it.each(["closed", "cancelled"] as const)("hides it for a give campaign in %s", (status) => {
    expect(showMonthlySection("give", status)).toBe(false)
  })

  it("hides it for back projects", () => {
    expect(showMonthlySection("back", "live")).toBe(false)
    expect(showMonthlySection("back", "draft")).toBe(false)
  })
})

describe("campaignAllowsMonthly", () => {
  it("is true only for allow_monthly === true", () => {
    expect(campaignAllowsMonthly({ allow_monthly: true })).toBe(true)
    expect(campaignAllowsMonthly({ allow_monthly: false })).toBe(false)
    expect(campaignAllowsMonthly({ allow_monthly: "true" })).toBe(false)
    expect(campaignAllowsMonthly({})).toBe(false)
  })
})

describe("loadPlanSupporters", () => {
  it("calls give.campaign_plan_supporters with the service role and the organizer as actor", async () => {
    const rows = [{ display_name: "Chị Lan", is_anonymous: false, since: "2026-11-02T03:00:00.000Z" }]
    state.serviceHandler = (call) => (call.target === "rpc:campaign_plan_supporters" ? { data: rows } : undefined)
    expect(await loadPlanSupporters(CAMPAIGN, USER)).toEqual(rows)
    expect(state.serviceCalls).toHaveLength(1)
    expect(state.serviceCalls[0].ops).toEqual([["args", { p_campaign_id: CAMPAIGN, p_actor: USER }]])
  })

  it("returns [] for no rows and throws on error", async () => {
    expect(await loadPlanSupporters(CAMPAIGN, USER)).toEqual([])
    state.serviceHandler = () => ({ error: { code: "P0002", message: "GIVE_CAMPAIGN_NOT_FOUND" } })
    await expect(loadPlanSupporters(CAMPAIGN, USER)).rejects.toMatchObject({ message: "GIVE_CAMPAIGN_NOT_FOUND" })
  })
})
