// @vitest-environment happy-dom
/**
 * Covers the public `"Báo cáo chiến dịch"` flow on `/campaigns/[slug]`
 * (`CampaignPage` + `ReportCampaign`, DOS/Give#98): signed-out login prompt,
 * signed-in report form with all structured reasons and secondary button
 * hierarchy, self-report hiding for the organizer, and hiding on non-public
 * preview statuses.
 */
import { Window } from "happy-dom"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { REPORT_REASON_LABELS, REPORT_REASONS } from "@/lib/campaign-reports"
import type { CampaignStatus, PublicCampaign } from "@/lib/campaigns"
import { fakeDb, type Call, type Handler } from "@/test/fake-db"

const VIEWER = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"
const CAMPAIGN = "33333333-3333-4333-8333-333333333333"
const SLUG = "xay-truong-ban-may"

const state = vi.hoisted(() => ({
  anonHandler: (() => undefined) as Handler,
  userHandler: (() => undefined) as Handler,
  serviceHandler: (() => undefined) as Handler,
  anonCalls: [] as Call[],
  userCalls: [] as Call[],
  serviceCalls: [] as Call[],
  session: null as { user: { id: string; email: string | null; name: string | null }; accessToken: string } | null,
}))

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>()
  return { ...actual, cache: <T extends (...args: never[]) => unknown>(fn: T): T => fn }
})
vi.mock("next/navigation", () => ({
  notFound: vi.fn((): never => {
    throw new Error("NEXT_NOT_FOUND")
  }),
  usePathname: () => `/campaigns/${SLUG}`,
}))
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => state.session),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: (token?: string) =>
    token
      ? fakeDb((call) => state.userHandler(call), state.userCalls)
      : fakeDb((call) => state.anonHandler(call), state.anonCalls),
  dbService: () => fakeDb((call) => state.serviceHandler(call), state.serviceCalls),
}))
vi.mock("./actions", () => ({ reportCampaign: vi.fn(async () => null) }))
vi.mock("./comment-actions", () => ({
  createComment: vi.fn(async () => null),
  editComment: vi.fn(async () => null),
  deleteComment: vi.fn(async () => null),
  hideCommentAsOrganizer: vi.fn(async () => null),
  reportComment: vi.fn(async () => null),
  moderateCommentFromCampaign: vi.fn(async () => null),
}))
vi.mock("./wish-actions", () => ({
  toggleWishHeart: vi.fn(async () => ({ hearted: true, heartCount: 1 })),
  reportWish: vi.fn(async () => null),
  moderateWishFromCampaign: vi.fn(async () => null),
}))
vi.mock("@/app/(public)/donations/actions", () => ({ donate: vi.fn(async () => null) }))
vi.mock("./monthly-actions", () => ({ startMonthlyPlan: vi.fn(async () => null) }))

const { default: CampaignPage, generateMetadata } = await import("./page")

function campaignFixture(status: CampaignStatus = "live"): PublicCampaign {
  return {
    id: CAMPAIGN,
    slug: SLUG,
    type: "give",
    funding_model: "flexible",
    category_id: "cat-1",
    title: "Xây trường Bản Mây",
    summary: "Cùng dựng lớp học mới.",
    story: "Nội dung câu chuyện chi tiết của chiến dịch.",
    beneficiary_name: "Điểm trường Bản Mây",
    beneficiary_relation: "Đơn vị thụ hưởng",
    cover_media_id: null,
    asset: "VND",
    goal_amount: 100_000_000,
    min_contribution: 20_000,
    stretch_goal_amount: null,
    display_options: { progress_bar: true, backers_count: true, time_remaining: true },
    starts_at: null,
    ends_at: "2099-12-31T00:00:00.000Z",
    payment_window_days: 7,
    status,
    submitted_at: "2026-11-10T00:00:00.000Z",
    approved_at: "2026-11-11T00:00:00.000Z",
    outcome_at: null,
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-11T00:00:00.000Z",
    category: { id: "cat-1", slug: "giao-duc", name: "Giáo dục", icon: null, color: null },
    cover: null,
  }
}

function parseDoc(html: string) {
  const win = new Window()
  win.document.body.innerHTML = html
  return win.document
}

beforeEach(() => {
  state.anonCalls.length = 0
  state.userCalls.length = 0
  state.serviceCalls.length = 0
  state.session = null
  state.anonHandler = (call) => {
    if (call.target === "campaigns") return { data: campaignFixture("live") }
    if (
      call.target === "campaign_milestones" ||
      call.target === "campaign_updates" ||
      call.target === "campaign_media"
    ) {
      return { data: [] }
    }
    if (call.target === "rpc:public_organizer")
      return { data: [{ display_name: "Quỹ Bản Mây", kind: "organization", verification_status: "verified" }] }
    if (call.target === "public_campaigns")
      return {
        data: {
          campaign_id: CAMPAIGN,
          received_amount: 10_000_000,
          spent_amount: 0,
          refunded_amount: 0,
          supporters_count: 5,
          pledged_amount: 0,
          paid_amount: 0,
          refund_owed_amount: 0,
          backers_count: 0,
          payments_stopped_at: null,
          payments_stopped_note: null,
          own_transfer_amount: 0,
        },
      }
    if (call.target === "public_account_changes") return { data: [] }
    if (call.target === "public_statement") return { data: [], count: 0 }
    return undefined
  }
  state.userHandler = (call) => {
    if (call.target === "rpc:managed_campaigns") return { data: { organizer_id: OTHER } }
    return undefined
  }
  state.serviceHandler = (call) => {
    if (call.target === "rpc:payment_account")
      return { data: [{ bank_bin: "970436", account_number: "0123456789", account_name: "QUY BAN MAY" }] }
    return undefined
  }
})

describe("CampaignPage report flow (DOS/Give#98)", () => {
  it("shows the 'Báo cáo chiến dịch' disclosure with a sign-in link for signed-out visitors", async () => {
    const html = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
    const doc = parseDoc(html)

    const summary = [...doc.querySelectorAll("summary")].find((el) => el.textContent?.includes("Báo cáo chiến dịch"))
    expect(summary).toBeDefined()

    const details = summary!.closest("details")!
    expect(details.querySelector('select[name="reason_code"]')).toBeNull()
    const loginLink = details.querySelector('a[href^="/auth/login"]')
    expect(loginLink?.getAttribute("href")).toBe(`/auth/login?return_path=${encodeURIComponent(`/campaigns/${SLUG}`)}`)
    expect(loginLink?.textContent).toContain("Đăng nhập để báo cáo")
    expect(details.querySelector(`a[href="/campaigns/${SLUG}/statement?filter=out"]`)).not.toBeNull()
  })

  it("renders the structured report form with secondary button hierarchy for a signed-in non-organizer", async () => {
    state.session = {
      user: { id: VIEWER, email: "viewer@dos.me", name: "Người xem" },
      accessToken: "viewer-token",
    }

    const html = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
    const doc = parseDoc(html)

    const summary = [...doc.querySelectorAll("summary")].find((el) => el.textContent?.includes("Báo cáo chiến dịch"))
    expect(summary).toBeDefined()

    const details = summary!.closest("details")!
    const select = details.querySelector('select[name="reason_code"]') as HTMLSelectElement | null
    expect(select).not.toBeNull()
    const values = [...select!.querySelectorAll("option")]
      .map((opt) => opt.getAttribute("value"))
      .filter((v): v is string => Boolean(v))
    expect(values).toEqual([...REPORT_REASONS])
    for (const code of REPORT_REASONS) {
      expect(select!.textContent).toContain(REPORT_REASON_LABELS[code])
    }

    const textarea = details.querySelector('textarea[name="details"]')
    expect(textarea?.getAttribute("maxlength")).toBe("1000")

    const submit = details.querySelector('button[type="submit"]')
    expect(submit?.textContent).toBe("Gửi báo cáo")
    // Funding box keeps 'Ủng hộ' as sole primary CTA; report submit is secondary.
    expect(submit?.className).toContain("btn-secondary")
    expect(submit?.className).not.toContain("btn-primary")
  })

  it("associates report details with unique character-limit and privacy guidance (DOS/Give#228)", async () => {
    state.session = {
      user: { id: VIEWER, email: "viewer@dos.me", name: "Người xem" },
      accessToken: "viewer-token",
    }
    const doc = parseDoc(renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) })))
    const textarea = doc.querySelector('textarea[name="details"]')!
    const descriptionIds = textarea.getAttribute("aria-describedby")?.split(/\s+/)

    expect(descriptionIds).toEqual(["report-details-hint"])
    for (const id of descriptionIds!) {
      const matches = doc.querySelectorAll(`[id="${id}"]`)
      expect(matches).toHaveLength(1)
      expect(matches[0].textContent).toBe(
        "Tối đa 1000 ký tự. Báo cáo được giữ kín; người tổ chức không biết ai báo cáo."
      )
    }
  })

  it("hides 'Báo cáo chiến dịch' from the campaign's own organizer", async () => {
    state.session = {
      user: { id: VIEWER, email: "org@dos.me", name: "Người tổ chức" },
      accessToken: "org-token",
    }
    state.userHandler = (call) => {
      if (call.target === "rpc:managed_campaigns") return { data: { organizer_id: VIEWER } }
      return undefined
    }

    const html = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
    expect(html).not.toContain("Báo cáo chiến dịch")
  })

  it("hides 'Báo cáo chiến dịch' on non-public preview statuses", async () => {
    state.session = {
      user: { id: VIEWER, email: "mod@dos.me", name: "Kiểm duyệt viên" },
      accessToken: "mod-token",
    }
    state.anonHandler = () => ({ data: null })
    state.userHandler = (call) => {
      if (call.target === "campaigns") return { data: campaignFixture("in_review") }
      if (
        call.target === "campaign_milestones" ||
        call.target === "campaign_updates" ||
        call.target === "campaign_media"
      )
        return { data: [] }
      return undefined
    }

    const html = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
    expect(html).toContain("Bản xem trước")
    expect(html).not.toContain("Báo cáo chiến dịch")
    expect(state.userCalls.some((c) => c.target === "rpc:managed_campaigns")).toBe(false)
  })
})

describe("generateMetadata (/campaigns/[slug], DOS/Give#232, DOS/Give#313)", () => {
  it("emits canonical URL and OpenGraph metadata without overriding the dynamic opengraph-image route", async () => {
    state.anonHandler = (call) => {
      if (call.target === "campaigns") {
        return {
          data: {
            ...campaignFixture("live"),
            cover: { storage_path: "campaigns/3333/cover.jpg", alt: "Ảnh bìa Bản Mây" },
          },
        }
      }
      return undefined
    }

    const meta = await generateMetadata({ params: Promise.resolve({ slug: SLUG }) })

    expect(meta).toStrictEqual({
      title: "Xây trường Bản Mây",
      description: "Cùng dựng lớp học mới.",
      alternates: { canonical: `/campaigns/${SLUG}` },
      openGraph: {
        type: "website",
        siteName: "Give",
        locale: "vi_VN",
        title: "Xây trường Bản Mây",
        description: "Cùng dựng lớp học mới.",
        url: `/campaigns/${SLUG}`,
      },
    })
  })

  it("emits complete OpenGraph without images when a public campaign has no cover, and omits description when summary is null", async () => {
    const withoutCover = await generateMetadata({ params: Promise.resolve({ slug: SLUG }) })

    expect(withoutCover).toStrictEqual({
      title: "Xây trường Bản Mây",
      description: "Cùng dựng lớp học mới.",
      alternates: { canonical: `/campaigns/${SLUG}` },
      openGraph: {
        type: "website",
        siteName: "Give",
        locale: "vi_VN",
        title: "Xây trường Bản Mây",
        description: "Cùng dựng lớp học mới.",
        url: `/campaigns/${SLUG}`,
      },
    })

    state.anonHandler = (call) => {
      if (call.target === "campaigns") {
        return {
          data: {
            ...campaignFixture("succeeded"),
            slug: "du-an/ban-may",
            summary: null,
          },
        }
      }
      return undefined
    }

    const withoutSummary = await generateMetadata({ params: Promise.resolve({ slug: SLUG }) })

    expect(withoutSummary).toStrictEqual({
      title: "Xây trường Bản Mây",
      alternates: { canonical: "/campaigns/du-an%2Fban-may" },
      openGraph: {
        type: "website",
        siteName: "Give",
        locale: "vi_VN",
        title: "Xây trường Bản Mây",
        url: "/campaigns/du-an%2Fban-may",
      },
    })
  })

  it("sets noindex/nofollow and omits openGraph and alternates on preview campaigns even with a cover", async () => {
    state.session = {
      user: { id: VIEWER, email: "org@dos.me", name: "Người tổ chức" },
      accessToken: "org-token",
    }
    state.anonHandler = () => ({ data: null })
    state.userHandler = (call) => {
      if (call.target === "campaigns") {
        return {
          data: {
            ...campaignFixture("in_review"),
            cover: { storage_path: "campaigns/3333/cover.jpg", alt: "Ảnh bìa" },
          },
        }
      }
      return undefined
    }

    const meta = await generateMetadata({ params: Promise.resolve({ slug: SLUG }) })

    expect(meta).toStrictEqual({
      title: "Xây trường Bản Mây",
      description: "Cùng dựng lớp học mới.",
      robots: { index: false, follow: false },
    })
  })

  it("sets noindex/nofollow and omits openGraph and alternates when campaign status is suspended", async () => {
    state.session = {
      user: { id: VIEWER, email: "mod@dos.me", name: "Kiểm duyệt viên" },
      accessToken: "mod-token",
    }
    state.anonHandler = () => ({ data: null })
    state.userHandler = (call) => {
      if (call.target === "campaigns") {
        return {
          data: {
            ...campaignFixture("suspended"),
            cover: { storage_path: "campaigns/3333/cover.jpg", alt: "Ảnh bìa" },
          },
        }
      }
      return undefined
    }

    const signedInSuspended = await generateMetadata({ params: Promise.resolve({ slug: SLUG }) })

    expect(signedInSuspended).toStrictEqual({
      title: "Xây trường Bản Mây",
      description: "Cùng dựng lớp học mới.",
      robots: { index: false, follow: false },
    })

    state.session = null
    state.anonHandler = (call) => {
      if (call.target === "campaigns") return { data: campaignFixture("suspended") }
      return undefined
    }

    const signedOutSuspended = await generateMetadata({ params: Promise.resolve({ slug: SLUG }) })

    expect(signedOutSuspended).toStrictEqual({
      title: "Không tìm thấy",
      robots: { index: false, follow: false },
    })
  })

  it("sets noindex/nofollow and omits openGraph and alternates when the campaign is not found or slug is invalid", async () => {
    state.anonHandler = () => ({ data: null })

    const missing = await generateMetadata({ params: Promise.resolve({ slug: SLUG }) })

    expect(missing).toStrictEqual({
      title: "Không tìm thấy",
      robots: { index: false, follow: false },
    })

    state.anonCalls.length = 0
    const invalidSlug = await generateMetadata({ params: Promise.resolve({ slug: "INVALID SLUG" }) })

    expect(invalidSlug).toStrictEqual({
      title: "Không tìm thấy",
      robots: { index: false, follow: false },
    })
    expect(state.anonCalls).toHaveLength(0)
  })
})

describe("CampaignPage halted states, organizer resilience, and stats grid (DOS/Give#240)", () => {
  const TIER_FIXTURE = {
    id: "tier-1",
    campaign_id: CAMPAIGN,
    title: "Mức đồng hành",
    description: "Quà kỷ niệm.",
    min_amount: 200_000,
    quantity_limit: 50,
    quantity_claimed: 3,
    estimated_delivery: "2027-03-01",
    requires_shipping: false,
    shipping_note: null,
    status: "active" as const,
    sort_order: 1,
    retired_at: null,
  }

  it.each(["draft", "in_review", "changes_requested", "approved"] as const)(
    "keeps pre-launch preview banner and closedNote copy on %s campaigns (give and back)",
    async (status) => {
      state.session = {
        user: { id: VIEWER, email: "org@dos.me", name: "Người tổ chức" },
        accessToken: "org-token",
      }
      state.anonHandler = () => ({ data: null })

      state.userHandler = (call) => {
        if (call.target === "campaigns") return { data: campaignFixture(status) }
        if (
          call.target === "campaign_milestones" ||
          call.target === "campaign_updates" ||
          call.target === "campaign_media"
        )
          return { data: [] }
        return undefined
      }
      const giveHtml = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
      expect(giveHtml).toContain("Bản xem trước: chiến dịch đang ở trạng thái")
      expect(giveHtml).toContain("và chưa công khai.")
      expect(giveHtml).toContain("Give sắp mở nhận ủng hộ. Tiền sẽ đi thẳng vào tài khoản nhận của chiến dịch.")

      state.userHandler = (call) => {
        if (call.target === "campaigns") {
          return { data: { ...campaignFixture(status), type: "back", funding_model: "all_or_nothing" } }
        }
        if (
          call.target === "campaign_milestones" ||
          call.target === "campaign_updates" ||
          call.target === "campaign_media"
        )
          return { data: [] }
        if (call.target === "reward_tiers") return { data: [TIER_FIXTURE] }
        return undefined
      }
      const backHtml = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
      expect(backHtml).toContain("Bản xem trước: chiến dịch đang ở trạng thái")
      expect(backHtml).toContain("Give sắp mở nhận cam kết. Tiền sẽ đi thẳng vào tài khoản nhận của chiến dịch.")
      expect(backHtml).toContain("Bản xem trước: người ủng hộ chọn được mức khi dự án mở gây quỹ.")
    }
  )

  it("renders halted non-public copy instead of pre-launch preview promises on suspended and cancelled campaigns", async () => {
    state.session = {
      user: { id: VIEWER, email: "mod@dos.me", name: "Kiểm duyệt viên" },
      accessToken: "mod-token",
    }
    state.anonHandler = () => ({ data: null })

    for (const { status, badge, giveNote, backNote } of [
      {
        status: "suspended" as const,
        badge: "Tạm dừng",
        giveNote: "Chiến dịch đang tạm dừng nên không nhận ủng hộ.",
        backNote: "Dự án đang tạm dừng nên không nhận cam kết.",
      },
      {
        status: "cancelled" as const,
        badge: "Đã hủy",
        giveNote: "Chiến dịch đã hủy nên không nhận ủng hộ.",
        backNote: "Dự án đã hủy nên không nhận cam kết.",
      },
    ]) {
      state.userHandler = (call) => {
        if (call.target === "campaigns") return { data: campaignFixture(status) }
        if (
          call.target === "campaign_milestones" ||
          call.target === "campaign_updates" ||
          call.target === "campaign_media"
        )
          return { data: [] }
        return undefined
      }
      const giveHtml = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
      const giveDoc = parseDoc(giveHtml)
      expect(giveDoc.querySelector(".bg-warning-soft")?.textContent.replace(/\s+/g, " ").trim()).toBe(
        `Chiến dịch đang ở trạng thái ${badge} và không hiển thị công khai.`
      )
      expect(giveHtml).toContain(giveNote)
      expect(giveHtml).not.toContain("Bản xem trước")
      expect(giveHtml).not.toContain("chưa công khai")
      expect(giveHtml).not.toContain("Give sắp mở nhận")

      state.userHandler = (call) => {
        if (call.target === "campaigns") {
          return { data: { ...campaignFixture(status), type: "back", funding_model: "all_or_nothing" } }
        }
        if (
          call.target === "campaign_milestones" ||
          call.target === "campaign_updates" ||
          call.target === "campaign_media"
        )
          return { data: [] }
        if (call.target === "reward_tiers") return { data: [TIER_FIXTURE] }
        return undefined
      }
      const backHtml = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
      const backDoc = parseDoc(backHtml)
      expect(backDoc.querySelector(".bg-warning-soft")?.textContent.replace(/\s+/g, " ").trim()).toBe(
        `Chiến dịch đang ở trạng thái ${badge} và không hiển thị công khai.`
      )
      const rewardSection = backDoc.querySelector('section[aria-labelledby="reward-tiers"]')
      expect(rewardSection?.textContent).toContain(backNote)
      expect(backHtml).toContain(backNote)
      expect(backHtml).not.toContain("Bản xem trước")
      expect(backHtml).not.toContain("người ủng hộ chọn được mức khi dự án mở gây quỹ")
      expect(backHtml).not.toContain("Give sắp mở nhận")
    }
  })

  it("links the organizer display name to /u/<handle> when handle is present and keeps plain text otherwise", async () => {
    const baseAnon = state.anonHandler
    state.anonHandler = (call) => {
      if (call.target === "rpc:public_organizer") {
        return {
          data: [
            {
              display_name: "Quỹ Bản Mây",
              kind: "organization",
              verification_status: "verified",
              handle: "quy-ban-may",
            },
          ],
        }
      }
      return baseAnon(call)
    }

    const linkedDoc = parseDoc(renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) })))
    const profileLink = linkedDoc.querySelector('header a[href="/u/quy-ban-may"]')
    expect(profileLink?.textContent).toBe("Quỹ Bản Mây")

    state.anonHandler = (call) => {
      if (call.target === "rpc:public_organizer") {
        return {
          data: [
            {
              display_name: "Quỹ Bản Mây",
              kind: "organization",
              verification_status: "verified",
              handle: null,
            },
          ],
        }
      }
      return baseAnon(call)
    }

    const plainDoc = parseDoc(renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) })))
    expect(plainDoc.querySelector('header a[href^="/u/"]')).toBeNull()
    expect(plainDoc.querySelector("header")?.textContent).toContain("Quỹ Bản Mây")
  })

  it("omits the organizer block instead of crashing when getPublicOrganizer fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const baseAnon = state.anonHandler
    state.anonHandler = (call) => {
      if (call.target === "rpc:public_organizer") {
        return { data: null, error: { code: "57014", message: "statement timeout" } }
      }
      return baseAnon(call)
    }

    try {
      const html = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
      const doc = parseDoc(html)

      expect(doc.querySelector("h1")?.textContent).toBe("Xây trường Bản Mây")
      expect(html).not.toContain("Quỹ Bản Mây")
      expect(html).not.toContain("Tổ chức gây quỹ")
      // Beneficiary line on give campaigns still renders cleanly.
      expect(html).toContain("Điểm trường Bản Mây")
      expect(errorSpy).toHaveBeenCalledWith(
        "campaign page: public organizer lookup failed",
        expect.objectContaining({ message: "statement timeout" })
      )
    } finally {
      errorSpy.mockRestore()
    }
  })

  it("extracts organizer initials by Unicode code point without lone UTF-16 surrogates", async () => {
    const baseAnon = state.anonHandler
    for (const [displayName, expectedInitial] of [
      ["  𠀀 Quỹ Mùa Xuân", "𠀀"],
      ["🌱 Bản Xanh", "🌱"],
      ["đồng hành vùng cao", "Đ"],
    ] as const) {
      state.anonHandler = (call) => {
        if (call.target === "rpc:public_organizer") {
          return { data: [{ display_name: displayName, kind: "organization", verification_status: "verified" }] }
        }
        return baseAnon(call)
      }

      const html = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
      const doc = parseDoc(html)
      const tile = doc.querySelector("header span.size-9")
      expect(tile?.textContent).toBe(expectedInitial)
      expect(html).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/)
    }
  })

  it("sizes the funding box <dl> grid tracks dynamically for 3, 2, 1, and 0 stats", async () => {
    const baseAnon = state.anonHandler

    // 3 stats: supporters, days remaining, goal percent
    const threeDoc = parseDoc(renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) })))
    const threeDl = threeDoc.querySelector('section[aria-label="Ủng hộ chiến dịch"] dl')
    expect(threeDl?.className).toContain("grid-cols-[auto_auto_auto]")
    expect(threeDl?.className).toContain("justify-between")

    // 2 stats: ends_at is null -> supporters + goal percent
    state.anonHandler = (call) => {
      if (call.target === "campaigns") return { data: { ...campaignFixture("live"), ends_at: null } }
      return baseAnon(call)
    }
    const twoDoc = parseDoc(renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) })))
    const twoDl = twoDoc.querySelector('section[aria-label="Ủng hộ chiến dịch"] dl')
    expect(twoDl?.className).toContain("grid-cols-[auto_auto]")
    expect(twoDl?.className).not.toContain("grid-cols-[auto_auto_auto]")
    expect(twoDl?.className).toContain("justify-between")

    // 1 stat: only progress_bar enabled
    state.anonHandler = (call) => {
      if (call.target === "campaigns") {
        return {
          data: {
            ...campaignFixture("live"),
            display_options: { progress_bar: true, backers_count: false, time_remaining: false },
          },
        }
      }
      return baseAnon(call)
    }
    const oneDoc = parseDoc(renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) })))
    const oneDl = oneDoc.querySelector('section[aria-label="Ủng hộ chiến dịch"] dl')
    expect(oneDl?.className).toContain("grid-cols-[auto]")
    expect(oneDl?.className).not.toContain("grid-cols-[auto_auto]")
    expect(oneDl?.className).not.toContain("justify-between")

    // 0 stats: all three disabled -> <dl> omitted
    state.anonHandler = (call) => {
      if (call.target === "campaigns") {
        return {
          data: {
            ...campaignFixture("live"),
            display_options: { progress_bar: false, backers_count: false, time_remaining: false },
          },
        }
      }
      return baseAnon(call)
    }
    const zeroDoc = parseDoc(renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) })))
    expect(zeroDoc.querySelector('section[aria-label="Ủng hộ chiến dịch"] dl')).toBeNull()
  })
})

describe("CampaignPage pitch video & milestones (DOS/Give#268)", () => {
  const VIDEO_ID = "dQw4w9WgXcQ"
  const MILESTONES = [
    {
      id: "ms-1",
      campaign_id: CAMPAIGN,
      title: "Đổ móng phòng học",
      description: "Hoàn thành nền móng bê tông.",
      target_amount: 30_000_000,
      unlock_note: "Công bố biên bản nghiệm thu móng\nKèm ảnh công trường tuần 1.",
      sort_order: 1,
    },
    {
      id: "ms-2",
      campaign_id: CAMPAIGN,
      title: "Lợp mái tôn chống nóng",
      description: "Lắp khung kèo thép và mái tôn.",
      target_amount: 60_000_000,
      unlock_note: "Mở đăng ký tình nguyện viên sơn tường.",
      sort_order: 2,
    },
  ]

  it("queries campaign_media for youtube pitch video and renders CampaignVideo poster + MilestoneList reached state on public campaigns", async () => {
    const baseAnon = state.anonHandler
    state.anonHandler = (call) => {
      if (call.target === "campaign_media") {
        return {
          data: [{ id: "media-1", youtube_id: VIDEO_ID, alt: "Phóng sự Điểm trường Bản Mây", sort_order: 0 }],
        }
      }
      if (call.target === "campaign_milestones") return { data: MILESTONES }
      if (call.target === "public_campaigns") {
        return {
          data: {
            campaign_id: CAMPAIGN,
            paid_amount: 45_000_000,
            other_in_amount: 5_000_000,
            disbursed_amount: 0,
            refunded_amount: 0,
            unexplained_out_amount: 0,
            unexplained_out_count: 0,
            supporters_count: 12,
            pledged_amount: 0,
            refund_owed_amount: 0,
            backers_count: 0,
            payments_stopped_at: null,
            payments_stopped_note: null,
            own_transfer_amount: 0,
          },
        }
      }
      return baseAnon(call)
    }

    const html = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
    const doc = parseDoc(html)

    // Exact query shape on campaign_media.
    const mediaCall = state.anonCalls.find((c) => c.target === "campaign_media")
    expect(mediaCall?.ops).toEqual([
      ["select", "id, youtube_id, alt, sort_order"],
      ["eq", "campaign_id", CAMPAIGN],
      ["eq", "kind", "youtube"],
      ["order", "sort_order", { ascending: true }],
      ["order", "created_at", { ascending: true }],
      ["limit", 1],
    ])

    // Story section renders CampaignVideo poster with zero iframe requests.
    const storySection = doc.querySelector('section[aria-labelledby="story-heading"]')!
    expect(storySection.querySelector("iframe")).toBeNull()
    const posterImg = storySection.querySelector("img")
    expect(posterImg?.getAttribute("src")).toContain(
      `/_next/image?url=${encodeURIComponent(`https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`)}`
    )
    const playBtn = storySection.querySelector('button[aria-label="Phát video: Phóng sự Điểm trường Bản Mây"]')
    expect(playBtn).not.toBeNull()
    expect(playBtn?.className).toContain("min-h-11")
    expect(storySection.textContent).toContain("Bấm để phát video từ YouTube")
    const watchLink = storySection.querySelector(`a[href="https://www.youtube.com/watch?v=${VIDEO_ID}"]`)
    expect(watchLink?.textContent).toBe("Mở trên YouTube")

    // Raised = paid_amount (45M) - other_in_amount (5M) = 40M: ms-1 (30M) reached, ms-2 (60M) unreached.
    const msItems = [...doc.querySelectorAll('section[aria-labelledby="milestones-heading"] ol > li')]
    expect(msItems).toHaveLength(2)
    expect(msItems[0].textContent).toContain("Đã đạt mốc")
    expect(msItems[0].textContent).toContain("Công bố biên bản nghiệm thu móng")
    expect(msItems[1].textContent).not.toContain("Đã đạt mốc")
    expect(msItems[1].textContent).not.toContain("Mở đăng ký tình nguyện viên sơn tường.")
  })

  it("uses pledged_amount on public back campaigns and switches MilestoneList to preview mode on unpublished previews", async () => {
    const baseAnon = state.anonHandler
    state.anonHandler = (call) => {
      if (call.target === "campaigns") {
        return { data: { ...campaignFixture("live"), type: "back", funding_model: "all_or_nothing" } }
      }
      if (call.target === "campaign_milestones") return { data: MILESTONES }
      if (call.target === "public_campaigns") {
        return {
          data: {
            campaign_id: CAMPAIGN,
            paid_amount: 0,
            other_in_amount: 0,
            disbursed_amount: 0,
            refunded_amount: 0,
            unexplained_out_amount: 0,
            unexplained_out_count: 0,
            supporters_count: 0,
            pledged_amount: 60_000_000,
            refund_owed_amount: 0,
            backers_count: 20,
            payments_stopped_at: null,
            payments_stopped_note: null,
            own_transfer_amount: 0,
          },
        }
      }
      if (call.target === "reward_tiers") return { data: [] }
      return baseAnon(call)
    }

    const backDoc = parseDoc(renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) })))
    const backItems = [...backDoc.querySelectorAll('section[aria-labelledby="milestones-heading"] ol > li')]
    expect(backItems[0].textContent).toContain("Đã đạt mốc")
    expect(backItems[1].textContent).toContain("Đã đạt mốc")
    expect(backItems[1].textContent).toContain("Mở đăng ký tình nguyện viên sơn tường.")

    // Preview mode: raisedAmount is null -> no 'Đã đạt mốc', unlock_note prefixed with 'Khi đạt mốc:', and pitch video still previews.
    state.session = {
      user: { id: VIEWER, email: "org@dos.me", name: "Người tổ chức" },
      accessToken: "org-token",
    }
    state.anonHandler = () => ({ data: null })
    state.userHandler = (call) => {
      if (call.target === "campaigns") return { data: campaignFixture("in_review") }
      if (call.target === "campaign_media") {
        return { data: [{ id: "media-1", youtube_id: VIDEO_ID, alt: null, sort_order: 0 }] }
      }
      if (call.target === "campaign_milestones") return { data: MILESTONES }
      if (call.target === "campaign_updates") return { data: [] }
      return undefined
    }

    const previewHtml = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
    const previewDoc = parseDoc(previewHtml)
    expect(previewDoc.body.textContent).not.toContain("Đã đạt mốc")
    expect(previewDoc.body.textContent).toContain("Khi đạt mốc: Công bố biên bản nghiệm thu móng")
    expect(previewDoc.body.textContent).toContain("Khi đạt mốc: Mở đăng ký tình nguyện viên sơn tường.")
    expect(previewDoc.querySelector('button[aria-label="Phát video: Xây trường Bản Mây"]')).not.toBeNull()
  })

  it("keeps rendering the campaign page cleanly when campaign_media fails, throws, or returns an invalid youtube_id", async () => {
    const baseAnon = state.anonHandler
    state.anonHandler = (call) => {
      if (call.target === "campaign_media") {
        return { data: null, error: { code: "57014", message: "statement timeout" } }
      }
      return baseAnon(call)
    }

    const failedHtml = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
    expect(failedHtml).toContain("Xây trường Bản Mây")
    expect(failedHtml).not.toContain("Bấm để phát video từ YouTube")
    expect(failedHtml).not.toContain("Mở trên YouTube")

    state.anonHandler = (call) => {
      if (call.target === "campaign_media") {
        throw new Error("network reset")
      }
      return baseAnon(call)
    }

    const thrownHtml = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
    expect(thrownHtml).toContain("Xây trường Bản Mây")
    expect(thrownHtml).not.toContain("Bấm để phát video từ YouTube")
    expect(thrownHtml).not.toContain("Mở trên YouTube")

    state.anonHandler = (call) => {
      if (call.target === "campaign_media") {
        return { data: [{ id: "media-bad", youtube_id: "not-valid!!", alt: "Bad", sort_order: 0 }] }
      }
      return baseAnon(call)
    }

    const invalidHtml = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
    expect(invalidHtml).toContain("Xây trường Bản Mây")
    expect(invalidHtml).not.toContain("Bấm để phát video từ YouTube")
    expect(invalidHtml).not.toContain("Mở trên YouTube")
  })
})

describe("CampaignPage BreadcrumbList JSON-LD (DOS/Give#283)", () => {
  it("emits absolute schema.org BreadcrumbList JSON-LD with category when siteOrigin() is configured", async () => {
    const prevSiteUrl = process.env.NEXT_PUBLIC_SITE_URL
    process.env.NEXT_PUBLIC_SITE_URL = "https://give.vn/ignored-path"

    try {
      const html = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
      const doc = parseDoc(html)
      const scripts = doc.querySelectorAll('script[type="application/ld+json"]')
      expect(scripts).toHaveLength(1)

      expect(JSON.parse(scripts[0].textContent ?? "")).toStrictEqual({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Trang chủ", item: "https://give.vn/" },
          { "@type": "ListItem", position: 2, name: "Khám phá", item: "https://give.vn/campaigns" },
          { "@type": "ListItem", position: 3, name: "Từ thiện", item: "https://give.vn/campaigns?type=give" },
          {
            "@type": "ListItem",
            position: 4,
            name: "Giáo dục",
            item: "https://give.vn/campaigns?type=give&category=giao-duc",
          },
          { "@type": "ListItem", position: 5, name: "Xây trường Bản Mây" },
        ],
      })
    } finally {
      if (prevSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
      else process.env.NEXT_PUBLIC_SITE_URL = prevSiteUrl
    }
  })

  it("omits the category crumb with contiguous positions when category is null and falls back to relative URLs when siteOrigin() is unset", async () => {
    const prevSiteUrl = process.env.NEXT_PUBLIC_SITE_URL
    delete process.env.NEXT_PUBLIC_SITE_URL

    const baseAnon = state.anonHandler
    state.anonHandler = (call) => {
      if (call.target === "campaigns") {
        return {
          data: {
            ...campaignFixture("succeeded"),
            type: "back",
            funding_model: "all_or_nothing",
            category_id: null,
            category: null,
          },
        }
      }
      if (call.target === "reward_tiers") return { data: [] }
      return baseAnon(call)
    }

    try {
      const html = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
      const doc = parseDoc(html)
      const scripts = doc.querySelectorAll('script[type="application/ld+json"]')
      expect(scripts).toHaveLength(1)

      expect(JSON.parse(scripts[0].textContent ?? "")).toStrictEqual({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Trang chủ", item: "/" },
          { "@type": "ListItem", position: 2, name: "Khám phá", item: "/campaigns" },
          { "@type": "ListItem", position: 3, name: "Dự án sáng tạo", item: "/campaigns?type=back" },
          { "@type": "ListItem", position: 4, name: "Xây trường Bản Mây" },
        ],
      })
    } finally {
      if (prevSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
      else process.env.NEXT_PUBLIC_SITE_URL = prevSiteUrl
    }
  })

  it("escapes < as \\u003c so </script> or <!-- in campaign title or category cannot break out of application/ld+json", async () => {
    const xssTitle = 'Xây trường </script><script>alert("xss")</script> <!-- Bản Mây'
    const xssCategoryName = "Giáo dục </script><!--"

    const baseAnon = state.anonHandler
    state.anonHandler = (call) => {
      if (call.target === "campaigns") {
        const base = campaignFixture("live")
        return {
          data: {
            ...base,
            title: xssTitle,
            category: { ...base.category!, name: xssCategoryName },
          },
        }
      }
      return baseAnon(call)
    }

    const html = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
    expect(html).not.toContain('</script><script>alert("xss")</script>')
    expect(html).toContain('\\u003c/script>\\u003cscript>alert(\\"xss\\")\\u003c/script> \\u003c!-- Bản Mây')
    expect(html).toContain("Giáo dục \\u003c/script>\\u003c!--")

    const doc = parseDoc(html)
    const allScripts = doc.querySelectorAll("script")
    expect(allScripts).toHaveLength(1)
    expect(allScripts[0].getAttribute("type")).toBe("application/ld+json")

    const parsed = JSON.parse(allScripts[0].textContent ?? "")
    expect(parsed.itemListElement[3].name).toBe(xssCategoryName)
    expect(parsed.itemListElement[4].name).toBe(xssTitle)
  })

  it.each(["draft", "in_review", "changes_requested", "approved", "suspended", "cancelled"] as const)(
    "omits BreadcrumbList JSON-LD on non-public and halted status %s",
    async (status) => {
      const prevSiteUrl = process.env.NEXT_PUBLIC_SITE_URL
      process.env.NEXT_PUBLIC_SITE_URL = "https://give.vn"

      state.session = {
        user: { id: VIEWER, email: "mod@dos.me", name: "Kiểm duyệt viên" },
        accessToken: "mod-token",
      }
      state.anonHandler = () => ({ data: null })
      state.userHandler = (call) => {
        if (call.target === "campaigns") return { data: campaignFixture(status) }
        if (
          call.target === "campaign_milestones" ||
          call.target === "campaign_updates" ||
          call.target === "campaign_media"
        )
          return { data: [] }
        return undefined
      }

      try {
        const html = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
        const doc = parseDoc(html)
        expect(doc.querySelector('script[type="application/ld+json"]')).toBeNull()
        expect(html).not.toContain("application/ld+json")
        expect(html).not.toContain("BreadcrumbList")
      } finally {
        if (prevSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
        else process.env.NEXT_PUBLIC_SITE_URL = prevSiteUrl
      }
    }
  )
})

describe("CampaignPage monthly giving (DOS/Give#276)", () => {
  const ACCOUNT = { channel: "statement_import", bank_bin: "970436", account_number: "0123456789", account_name: "QUY" }

  function withMonthly(row: { allow_monthly: boolean; monthly_supporters: number } | null, fail = false) {
    const baseAnon = state.anonHandler
    state.anonHandler = (call) => {
      if (call.target === "public_campaign_monthly") {
        return fail ? { error: { code: "42P01", message: "missing" } } : { data: row }
      }
      return baseAnon(call)
    }
    state.serviceHandler = (call) => (call.target === "rpc:payment_account" ? { data: ACCOUNT } : undefined)
  }

  async function render() {
    return parseDoc(renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) })))
  }

  it("shows the monthly supporters count and a sign-in link to a signed-out visitor", async () => {
    withMonthly({ allow_monthly: true, monthly_supporters: 7 })
    const doc = await render()

    expect(doc.body.textContent).toContain("7 người ủng hộ hằng tháng")
    const monthlyCall = state.anonCalls.find((c) => c.target === "public_campaign_monthly")
    expect(monthlyCall?.ops).toContainEqual(["eq", "campaign_id", CAMPAIGN])
    const section = doc.querySelector("#hang-thang")!
    expect(section).not.toBeNull()
    expect(section.textContent).toContain("Give không tự trừ tiền")
    expect(section.querySelector("form")).toBeNull()
    const login = section.querySelector('a[href^="/auth/login"]')
    expect(login?.getAttribute("href")).toBe(`/auth/login?return_path=${encodeURIComponent(`/campaigns/${SLUG}`)}`)
    expect(login?.textContent).toBe("Đăng nhập để ủng hộ hằng tháng")
    expect(doc.querySelector('a[href="#hang-thang"]')?.textContent).toBe("Hoặc ủng hộ hằng tháng")
    // The one-off form stays.
    expect(doc.querySelector("#ung-ho")).not.toBeNull()
  })

  it("renders the monthly form with day 1-28, the anonymity warning and a required consent for a signed-in donor", async () => {
    state.session = { user: { id: VIEWER, email: "lan@dos.me", name: "Lan" }, accessToken: "viewer-token" }
    withMonthly({ allow_monthly: true, monthly_supporters: 0 })
    const doc = await render()

    expect(doc.body.textContent).not.toContain("người ủng hộ hằng tháng")
    const form = doc.querySelector("#hang-thang form")!
    expect(form).not.toBeNull()
    expect(form.querySelector('input[name="amount"]')).not.toBeNull()
    const days = [...form.querySelectorAll('select[name="day_of_month"] option')].map((o) => o.getAttribute("value"))
    expect(days).toEqual(Array.from({ length: 28 }, (_, i) => String(i + 1)))
    expect(form.querySelector('input[name="public_name"]')?.getAttribute("value")).toBe("Lan")
    expect(form.querySelector("#monthly-anonymous-hint")?.textContent).toContain("mỗi tháng một lần")
    const consent = form.querySelector('input[name="consent"]')!
    expect(consent.hasAttribute("required")).toBe(true)
    expect(consent.closest("label")?.textContent).toContain(
      "Tôi đồng ý nhận lời nhắc và mã ủng hộ mỗi tháng qua email và thông báo trên Give; tôi dừng được bất cứ lúc nào."
    )
    expect(form.querySelector('textarea[name="message"]')).not.toBeNull()
    expect(form.querySelector('button[type="submit"]')?.textContent).toBe("Đăng ký ủng hộ hằng tháng")
  })

  it.each([
    ["the campaign does not allow it", { allow_monthly: false, monthly_supporters: 3 }, false],
    ["the lookup fails", null, true],
  ])("hides the monthly form when %s", async (_name, row, fail) => {
    state.session = { user: { id: VIEWER, email: null, name: null }, accessToken: "viewer-token" }
    withMonthly(row, fail)
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const doc = await render()
    log.mockRestore()

    expect(doc.querySelector("#hang-thang")).toBeNull()
    expect(doc.querySelector('a[href="#hang-thang"]')).toBeNull()
    expect(doc.querySelector("#ung-ho")).not.toBeNull()
    // Existing supporters still count while the campaign takes no new plans.
    expect(doc.body.textContent?.includes("3 người ủng hộ hằng tháng")).toBe(!fail)
  })

  it("hides the monthly form when the campaign takes no donations, and the count when backer counts are hidden", async () => {
    state.session = { user: { id: VIEWER, email: null, name: null }, accessToken: "viewer-token" }
    withMonthly({ allow_monthly: true, monthly_supporters: 4 })
    state.serviceHandler = () => ({ data: null })
    let doc = await render()
    expect(doc.querySelector("#hang-thang")).toBeNull()
    expect(doc.body.textContent).toContain("4 người ủng hộ hằng tháng")

    const baseAnon = state.anonHandler
    state.anonHandler = (call) =>
      call.target === "campaigns"
        ? { data: { ...campaignFixture("live"), display_options: { backers_count: false } } }
        : baseAnon(call)
    doc = await render()
    expect(doc.body.textContent).not.toContain("người ủng hộ hằng tháng")
  })

  it("does not look monthly giving up for back campaigns or previews", async () => {
    const baseAnon = state.anonHandler
    state.anonHandler = (call) =>
      call.target === "campaigns" ? { data: { ...campaignFixture("live"), type: "back" } } : baseAnon(call)
    await render()
    expect(state.anonCalls.some((c) => c.target === "public_campaign_monthly")).toBe(false)
  })
})

describe("CampaignPage analytics view beacon (DOS/Give#252)", () => {
  it("fires a view beacon on public campaigns and omits it on non-public previews", async () => {
    const { act } = await import("react")
    const { createRoot } = await import("react-dom/client")
    const { resetViewedMemoryCache } = await import("@/lib/analytics-client")

    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    resetViewedMemoryCache()
    window.localStorage.clear()

    const sendBeacon = vi.fn(() => true)
    const originalBeacon = Object.getOwnPropertyDescriptor(navigator, "sendBeacon")
    Object.defineProperty(navigator, "sendBeacon", { value: sendBeacon, configurable: true, writable: true })

    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)

    try {
      // Public live campaign fires a single view beacon.
      const livePage = await CampaignPage({ params: Promise.resolve({ slug: SLUG }) })
      await act(async () => {
        root.render(livePage)
      })
      expect(sendBeacon).toHaveBeenCalledTimes(1)
      expect(sendBeacon).toHaveBeenCalledWith("/api/analytics/event", expect.any(Blob))

      // Non-public preview campaign (draft viewed by organizer) does NOT fire a view beacon.
      sendBeacon.mockClear()
      resetViewedMemoryCache()
      window.localStorage.clear()
      state.session = { user: { id: VIEWER, email: null, name: null }, accessToken: "organizer-token" }
      state.anonHandler = (call) => (call.target === "campaigns" ? { data: null } : undefined)
      state.userHandler = (call) => {
        if (call.target === "campaigns") return { data: campaignFixture("draft") }
        return { data: [] }
      }

      const previewPage = await CampaignPage({ params: Promise.resolve({ slug: SLUG }) })
      await act(async () => {
        root.render(previewPage)
      })
      expect(sendBeacon).not.toHaveBeenCalled()
    } finally {
      act(() => root.unmount())
      container.remove()
      if (originalBeacon) {
        Object.defineProperty(navigator, "sendBeacon", originalBeacon)
      } else {
        Reflect.deleteProperty(navigator, "sendBeacon")
      }
    }
  })
})

describe("CampaignPage comments section (DOS/Give#250)", () => {
  const ROOT_OTHER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  const REPLY_ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
  const ROOT_OWN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
  const ROOT_HIDDEN = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"

  const COMMENTS_FIXTURE = [
    {
      id: ROOT_OTHER,
      campaign_id: CAMPAIGN,
      parent_id: null,
      body: "Ủng hộ chiến dịch! Xem https://evil.example <script>alert(1)</script>",
      status: "visible",
      author_display_name: "Lan Anh",
      author_avatar_url: null,
      is_organizer: false,
      is_author: false,
      created_at: "2026-11-20T08:00:00.000Z",
      edited_at: "2026-11-20T08:05:00.000Z",
      hidden_role: null,
      hidden_reason: null,
      hidden_at: null,
      hidden_by_display_name: null,
      total_top_level_count: 2,
    },
    {
      id: REPLY_ORG,
      campaign_id: CAMPAIGN,
      parent_id: ROOT_OTHER,
      body: "Cảm ơn bạn đã đồng hành cùng điểm trường!",
      status: "visible",
      author_display_name: "Quỹ Bản Mây",
      author_avatar_url: null,
      is_organizer: true,
      is_author: false,
      created_at: "2026-11-20T09:00:00.000Z",
      edited_at: null,
      hidden_role: null,
      hidden_reason: null,
      hidden_at: null,
      hidden_by_display_name: null,
      total_top_level_count: 2,
    },
    {
      id: ROOT_OWN,
      campaign_id: CAMPAIGN,
      parent_id: null,
      body: "Bình luận của chính mình",
      status: "visible",
      author_display_name: null,
      author_avatar_url: null,
      is_organizer: false,
      is_author: true,
      created_at: "2026-11-20T07:00:00.000Z",
      edited_at: null,
      hidden_role: null,
      hidden_reason: null,
      hidden_at: null,
      hidden_by_display_name: null,
      total_top_level_count: 2,
    },
  ]

  it("renders comments for guests with plain-text XSS safety, organizer badge, edited indicator, and sign-in prompt", async () => {
    const baseAnon = state.anonHandler
    state.anonHandler = (call) => {
      if (call.target === "rpc:list_campaign_comments") return { data: COMMENTS_FIXTURE }
      return baseAnon(call)
    }

    const html = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
    const doc = parseDoc(html)

    // Tab links to #binh-luan with top-level count.
    const tab = doc.querySelector('a[href="#binh-luan"]')
    expect(tab?.textContent).toContain("Bình luận")
    expect(tab?.textContent).toContain("(2)")

    const section = doc.querySelector("section#binh-luan")!
    expect(section).not.toBeNull()
    expect(section.querySelector('textarea[name="body"]')).toBeNull()
    expect(section.querySelector('a[href^="/auth/login"]')?.textContent).toContain("Đăng nhập để bình luận")

    // XSS & plain-text rules: no executable script tag, no clickable link inside comment body.
    expect(section.querySelector("script")).toBeNull()
    expect(section.querySelector('a[href="https://evil.example"]')).toBeNull()
    expect(section.textContent).toContain("Ủng hộ chiến dịch! Xem https://evil.example <script>alert(1)</script>")
    expect(section.textContent).toContain("(đã chỉnh sửa)")
    expect(section.textContent).toContain("Người tổ chức")
    expect(section.textContent).toContain("Người dùng đã xóa tài khoản")
  })

  it("enforces 1-level replies, author edit/delete without self-report, and report form with unique IDs for signed-in users", async () => {
    state.session = {
      user: { id: VIEWER, email: "viewer@dos.me", name: "Người xem" },
      accessToken: "viewer-token",
    }
    const baseUser = state.userHandler
    state.userHandler = (call) => {
      if (call.target === "rpc:list_campaign_comments") return { data: COMMENTS_FIXTURE }
      return baseUser(call)
    }

    const doc = parseDoc(renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) })))
    const section = doc.querySelector("section#binh-luan")!

    // New top-level composer exists.
    expect(section.querySelector("textarea#comment-new-body")).not.toBeNull()

    // Reply form exists on top-level comments ONLY, never on replies (1-level reply rule).
    expect(section.querySelector(`textarea#comment-reply-${ROOT_OTHER}`)).not.toBeNull()
    expect(section.querySelector(`textarea#comment-reply-${ROOT_OWN}`)).not.toBeNull()
    expect(section.querySelector(`textarea#comment-reply-${REPLY_ORG}`)).toBeNull()

    // Own comment has edit + delete and NO report form (self-report blocked).
    expect(section.querySelector(`textarea#comment-edit-${ROOT_OWN}`)).not.toBeNull()
    expect(section.querySelector(`select#comment-report-reason-${ROOT_OWN}`)).toBeNull()

    // Other user's comment has report form and NO edit form.
    expect(section.querySelector(`textarea#comment-edit-${ROOT_OTHER}`)).toBeNull()
    expect(section.querySelector(`select#comment-report-reason-${ROOT_OTHER}`)).not.toBeNull()
    expect(section.querySelector(`select#comment-report-reason-${REPLY_ORG}`)).not.toBeNull()
  })

  it("shows organizer hide control on own campaign and moderator hidden-comments toggle with self-review guard", async () => {
    // 1. Organizer view.
    state.session = {
      user: { id: VIEWER, email: "org@dos.me", name: "Người tổ chức" },
      accessToken: "org-token",
    }
    state.userHandler = (call) => {
      if (call.target === "rpc:managed_campaigns") return { data: { organizer_id: VIEWER } }
      if (call.target === "rpc:list_campaign_comments") return { data: COMMENTS_FIXTURE }
      return undefined
    }
    const orgDoc = parseDoc(renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) })))
    const orgSection = orgDoc.querySelector("section#binh-luan")!
    expect(orgSection.querySelector(`textarea#comment-hide-reason-${ROOT_OTHER}`)).not.toBeNull()
    expect(orgSection.querySelector(`textarea#comment-mod-reason-${ROOT_OTHER}`)).toBeNull()
    expect(orgSection.textContent).not.toContain("Hiện bình luận đã ẩn")

    // 2. Moderator view with ?show_hidden=1.
    state.userHandler = (call) => {
      if (call.target === "rpc:managed_campaigns") return { data: { organizer_id: OTHER } }
      if (call.target === "rpc:is_admin") return { data: true }
      if (call.target === "rpc:list_campaign_comments") {
        return {
          data: [
            ...COMMENTS_FIXTURE,
            {
              id: ROOT_HIDDEN,
              campaign_id: CAMPAIGN,
              parent_id: null,
              body: "Bình luận đã bị ẩn",
              status: "hidden",
              author_display_name: "Tài khoản vi phạm",
              author_avatar_url: null,
              is_organizer: false,
              is_author: false,
              created_at: "2026-11-20T06:00:00.000Z",
              edited_at: null,
              hidden_role: "organizer",
              hidden_reason: "Quảng cáo ngoài lề",
              hidden_at: "2026-11-20T06:30:00.000Z",
              hidden_by_display_name: "Quỹ Bản Mây",
              total_top_level_count: 3,
            },
          ],
        }
      }
      return undefined
    }

    const modDoc = parseDoc(
      renderToStaticMarkup(
        await CampaignPage({
          params: Promise.resolve({ slug: SLUG }),
          searchParams: Promise.resolve({ show_hidden: "1" }),
        })
      )
    )
    const modSection = modDoc.querySelector("section#binh-luan")!
    expect(modSection.textContent).toContain("Chỉ hiện bình luận công khai")
    expect(modSection.textContent).toContain("Bình luận đã bị ẩn")
    expect(modSection.textContent).toContain("Quảng cáo ngoài lề")
    // Moderator can unhide other user's hidden comment, and cannot staff-moderate own comment (self-review guard).
    expect(modSection.querySelector(`textarea#comment-mod-reason-${ROOT_HIDDEN}`)).not.toBeNull()
    expect(modSection.querySelector(`textarea#comment-mod-reason-${ROOT_OWN}`)).toBeNull()
  })

  it("falls back to anonymous comments read on expired JWT and hides comments on non-public previews", async () => {
    state.session = {
      user: { id: VIEWER, email: "viewer@dos.me", name: "Viewer" },
      accessToken: "expired-jwt",
    }
    const baseAnon = state.anonHandler
    state.anonHandler = (call) => {
      if (call.target === "rpc:list_campaign_comments") return { data: COMMENTS_FIXTURE }
      return baseAnon(call)
    }
    state.userHandler = (call) => {
      if (call.target === "rpc:list_campaign_comments") return { error: { code: "PGRST301", message: "JWT expired" } }
      return undefined
    }

    const fallbackDoc = parseDoc(renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) })))
    expect(fallbackDoc.querySelector("section#binh-luan")?.textContent).toContain("Cảm ơn bạn đã đồng hành")

    // Preview hides comments section and never calls list_campaign_comments.
    state.anonCalls.length = 0
    state.userCalls.length = 0
    state.anonHandler = () => ({ data: null })
    state.userHandler = (call) => {
      if (call.target === "campaigns") return { data: campaignFixture("in_review") }
      if (
        call.target === "campaign_milestones" ||
        call.target === "campaign_updates" ||
        call.target === "campaign_media"
      ) {
        return { data: [] }
      }
      return undefined
    }

    const previewDoc = parseDoc(renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) })))
    expect(previewDoc.querySelector("section#binh-luan")).toBeNull()
    expect(previewDoc.querySelector('a[href="#binh-luan"]')).toBeNull()
    expect(state.userCalls.some((c) => c.target === "rpc:list_campaign_comments")).toBe(false)
  })

  it("shows back-to-page-1 notice when an out-of-range ?comments_page= returns 0 rows, and omits #binh-luan tab when comments lookup fails", async () => {
    const baseAnon = state.anonHandler
    state.anonHandler = (call) => {
      if (call.target === "rpc:list_campaign_comments") return { data: [] }
      return baseAnon(call)
    }
    const outOfRangeDoc = parseDoc(
      renderToStaticMarkup(
        await CampaignPage({
          params: Promise.resolve({ slug: SLUG }),
          searchParams: Promise.resolve({ comments_page: "9" }),
        })
      )
    )
    const section = outOfRangeDoc.querySelector("section#binh-luan")!
    expect(section.textContent).toContain("Trang này không có bình luận.")
    expect(section.querySelector(`a[href="/campaigns/${SLUG}#binh-luan"]`)?.textContent).toContain(
      "Về trang bình luận đầu tiên"
    )

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      state.anonHandler = (call) => {
        if (call.target === "rpc:list_campaign_comments") {
          return { data: null, error: { code: "57014", message: "timeout" } }
        }
        return baseAnon(call)
      }
      const failedDoc = parseDoc(renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) })))
      expect(failedDoc.querySelector("section#binh-luan")).toBeNull()
      expect(failedDoc.querySelector('a[href="#binh-luan"]')).toBeNull()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it("renders public CampaignTeam block when campaign_public_team returns accepted co-organizers and omits it for solo owner (DOS/Give#253)", async () => {
    const baseAnon = state.anonHandler
    state.anonHandler = (call) => {
      if (call.target === "rpc:campaign_public_team") {
        return {
          data: [
            {
              member_role: "owner",
              display_name: "Quỹ Bản Mây",
              avatar_url: null,
              kind: "organization",
              verification_status: "verified",
              joined_at: "2026-11-01T00:00:00Z",
            },
            {
              member_role: "editor",
              display_name: "Minh Anh",
              avatar_url: "https://cdn.example.vn/minh.jpg",
              kind: null,
              verification_status: null,
              joined_at: "2026-11-10T00:00:00Z",
            },
          ],
        }
      }
      return baseAnon(call)
    }

    const withTeam = parseDoc(renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) })))
    const teamSection = withTeam.querySelector("section#doi-ngu")
    expect(teamSection).not.toBeNull()
    expect(teamSection?.textContent).toContain("Đội ngũ tổ chức")
    expect(teamSection?.textContent).toContain("Quỹ Bản Mây")
    expect(teamSection?.textContent).toContain("Minh Anh")
    expect(teamSection?.textContent).toContain("Đồng tổ chức")

    // Solo owner only -> team section stays omitted.
    state.anonHandler = (call) => {
      if (call.target === "rpc:campaign_public_team") {
        return {
          data: [
            {
              member_role: "owner",
              display_name: "Quỹ Bản Mây",
              avatar_url: null,
              kind: "organization",
              verification_status: "verified",
              joined_at: "2026-11-01T00:00:00Z",
            },
          ],
        }
      }
      return baseAnon(call)
    }
    const soloDoc = parseDoc(renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) })))
    expect(soloDoc.querySelector("section#doi-ngu")).toBeNull()
  })
})

describe("CampaignPage downloadable QR poster (DOS/Give#313)", () => {
  it("renders 'Tải poster QR' on public campaigns without leaking raw account numbers or holder names", async () => {
    state.serviceHandler = (call) =>
      call.target === "rpc:payment_account"
        ? {
            data: {
              channel: "statement_import",
              bank_bin: "970436",
              account_number: "0011012345678",
              account_name: "NGUYEN VAN SECRET",
            },
          }
        : undefined

    const html = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
    const doc = parseDoc(html)
    const posterBtn = [...doc.querySelectorAll("button")].find((b) => b.textContent?.includes("Tải poster QR"))
    expect(posterBtn).toBeDefined()
    expect(posterBtn?.className).toContain("btn-secondary")
    expect(html).not.toContain("0011012345678")
    expect(html).not.toContain("NGUYEN VAN SECRET")
  })

  it("hides 'Tải poster QR' on non-public preview pages", async () => {
    state.session = {
      user: { id: VIEWER, email: "org@dos.me", name: "Người tổ chức" },
      accessToken: "org-token",
    }
    state.anonHandler = () => ({ data: null })
    state.userHandler = (call) => {
      if (call.target === "campaigns") return { data: campaignFixture("draft") }
      if (
        call.target === "campaign_milestones" ||
        call.target === "campaign_updates" ||
        call.target === "campaign_media"
      )
        return { data: [] }
      return undefined
    }

    const html = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
    expect(html).not.toContain("Tải poster QR")
  })
})

describe("CampaignPage trust moat: transparency summary, milestone evidence & impact report (DOS/Give#314)", () => {
  it("renders TransparencySummaryBox, milestone rollups, and published ClosingImpactReport on public campaigns without raw HTML", async () => {
    const MILESTONE = "44444444-4444-4444-8444-444444444444"
    const baseAnon = state.anonHandler
    state.anonHandler = (call) => {
      if (call.target === "campaign_milestones") {
        return {
          data: [
            {
              id: MILESTONE,
              campaign_id: CAMPAIGN,
              title: "Mốc 1: Mua vật tư",
              description: null,
              target_amount: 20_000_000,
              unlock_note: null,
              sort_order: 1,
            },
          ],
        }
      }
      if (call.target === "rpc:campaign_transparency_summary") {
        return {
          data: [
            {
              campaign_id: CAMPAIGN,
              last_statement_at: "2026-11-20T08:00:00Z",
              matched_incoming_total: 10_000_000,
              disbursable_total: 10_000_000,
              disbursed_total: 5_000_000,
              refunded_total: 0,
              evidence_count: 6,
              unexplained_inbound_count: 0,
              unexplained_out_count: 0,
              has_impact_report: true,
              impact_report_published_at: "2026-11-21T00:00:00Z",
              milestone_rollups: [
                {
                  milestone_id: MILESTONE,
                  title: "Mốc 1: Mua vật tư",
                  target_amount: 20_000_000,
                  sort_order: 1,
                  disbursed_total: 5_000_000,
                  disbursement_count: 2,
                  evidence_count: 6,
                },
              ],
            },
          ],
        }
      }
      if (call.target === "campaign_impact_reports") {
        return {
          data: {
            campaign_id: CAMPAIGN,
            summary: "## Tổng kết\n\nĐã bàn giao xong.\n\n<script>alert(1)</script>",
            highlights: [{ label: "Học sinh", value: "120 em" }],
            published_at: "2026-11-21T00:00:00Z",
            created_at: "2026-11-20T00:00:00Z",
            updated_at: "2026-11-21T00:00:00Z",
          },
        }
      }
      return baseAnon(call)
    }

    const html = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
    expect(html).toContain("Tóm tắt minh bạch sao kê")
    expect(html).toContain("50%")
    expect(html).toContain("0 chưa giải trình")
    expect(html).toContain("6 chứng từ công khai")
    expect(html).toContain('id="bao-cao-tong-ket"')
    expect(html).toContain("120 em")
    expect(html).not.toContain("<script>alert(1)</script>")
  })

  it("hides transparency summary, milestone rollups, and impact report on non-public draft previews", async () => {
    const MILESTONE = "44444444-4444-4444-8444-444444444444"
    state.session = {
      user: { id: VIEWER, email: "org@dos.me", name: "Người tổ chức" },
      accessToken: "org-token",
    }
    state.anonHandler = () => ({ data: null })
    state.userHandler = (call) => {
      if (call.target === "campaigns") return { data: campaignFixture("draft") }
      if (call.target === "campaign_milestones") {
        return {
          data: [
            {
              id: MILESTONE,
              campaign_id: CAMPAIGN,
              title: "Mốc 1: Mua vật tư",
              description: null,
              target_amount: 20_000_000,
              unlock_note: null,
              sort_order: 1,
            },
          ],
        }
      }
      if (call.target === "campaign_updates" || call.target === "campaign_media") return { data: [] }
      return undefined
    }

    const html = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
    expect(html).not.toContain("Tóm tắt minh bạch sao kê")
    expect(html).not.toContain('id="bao-cao-tong-ket"')
    expect(html).not.toContain("chứng từ công khai")
    expect(state.anonCalls.some((c) => c.target === "rpc:campaign_transparency_summary")).toBe(false)
    expect(state.anonCalls.some((c) => c.target === "campaign_impact_reports")).toBe(false)
    expect(state.userCalls.some((c) => c.target === "campaign_impact_reports")).toBe(false)
  })

  it("hides unpublished draft impact reports and avoids dead #bao-cao-tong-ket anchors on public campaigns", async () => {
    const baseAnon = state.anonHandler
    state.anonHandler = (call) => {
      if (call.target === "rpc:campaign_transparency_summary") {
        return {
          data: [
            {
              campaign_id: CAMPAIGN,
              last_statement_at: "2026-11-20T08:00:00Z",
              matched_incoming_total: 10_000_000,
              disbursable_total: 10_000_000,
              disbursed_total: 0,
              refunded_total: 0,
              evidence_count: 0,
              unexplained_inbound_count: 0,
              unexplained_out_count: 0,
              has_impact_report: true,
              impact_report_published_at: null,
              milestone_rollups: [],
            },
          ],
        }
      }
      if (call.target === "campaign_impact_reports") {
        return {
          data: {
            campaign_id: CAMPAIGN,
            summary: "Bản nháp nội bộ chưa công bố",
            highlights: [{ label: "Nháp", value: "99" }],
            published_at: null,
            created_at: "2026-11-20T00:00:00Z",
            updated_at: "2026-11-21T00:00:00Z",
          },
        }
      }
      return baseAnon(call)
    }

    const html = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
    expect(html).toContain("Tóm tắt minh bạch sao kê")
    expect(html).not.toContain("Bản nháp nội bộ chưa công bố")
    expect(html).not.toContain('id="bao-cao-tong-ket"')
    expect(html).not.toContain('href="#bao-cao-tong-ket"')
  })
})

describe("CampaignPage pre-launch 'Sắp ra mắt' teaser & FollowButton (DOS/Give#315)", () => {
  it("renders public pre-launch teaser with 'Nhận thông báo khi mở' CTA and ZERO payment/VietQR/donate/pledge/poster/statement/transparency surfaces", async () => {
    const prelaunchRow = {
      ...campaignFixture("approved"),
      prelaunch_public: true,
      starts_at: "2099-12-01T00:00:00Z",
      ends_at: "2099-12-31T00:00:00Z",
    }
    state.anonHandler = (call) => {
      if (call.target === "campaigns") return { data: prelaunchRow }
      if (call.target === "rpc:public_organizer") {
        return {
          data: [
            {
              display_name: "Quỹ Bản Mây",
              kind: "organization",
              verification_status: "verified",
              handle: "quy-ban-may",
            },
          ],
        }
      }
      if (call.target === "rpc:campaign_follower_count") return { data: 18 }
      if (call.target === "rpc:campaign_public_team") return { data: [] }
      if (
        call.target === "campaign_milestones" ||
        call.target === "campaign_updates" ||
        call.target === "campaign_media"
      ) {
        return { data: [] }
      }
      return undefined
    }

    const html = renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) }))
    const doc = parseDoc(html)

    expect(html).toContain("Sắp ra mắt")
    expect(html).toContain("Nhận thông báo khi mở")
    expect(html).toContain("18 người đang chờ")
    expect(doc.querySelector(`a[href="/auth/login?return_path=%2Fcampaigns%2F${SLUG}"]`)).not.toBeNull()

    // ZERO money/QR/donation/pledge/poster/statement/transparency/impact leakage on pre-launch!
    expect(state.serviceCalls.some((c) => c.target === "rpc:payment_account")).toBe(false)
    expect(state.anonCalls.some((c) => c.target === "rpc:campaign_transparency_summary")).toBe(false)
    expect(state.anonCalls.some((c) => c.target === "campaign_impact_reports")).toBe(false)
    expect(html).not.toContain("Tóm tắt minh bạch sao kê")
    expect(html).not.toContain('id="bao-cao-tong-ket"')
    expect(html).not.toContain("Tải poster QR")
    expect(html).not.toContain("VietQR")
    expect(doc.querySelector("section#ung-ho")).toBeNull()
    expect(doc.querySelector("section#hang-thang")).toBeNull()
    expect(doc.querySelector(`a[href="/campaigns/${SLUG}/pledge"]`)).toBeNull()
    expect(doc.querySelector(`a[href="/campaigns/${SLUG}/statement"]`)).toBeNull()
    expect(html).not.toContain("Bản xem trước")
  })
})

describe("CampaignPage FAQ accordion (DOS/Give#316)", () => {
  const FAQS = [
    {
      id: "faq-1",
      campaign_id: CAMPAIGN,
      question: "Tiền ủng hộ có công khai sao kê không?",
      answer: "Có, toàn bộ giao dịch được công khai tại mục Sao kê.",
      position: 0,
      created_at: "2026-11-22T00:00:00Z",
      updated_at: "2026-11-22T00:00:00Z",
    },
  ]

  it("renders FAQ accordion and 'Hỏi đáp' tab on public live campaigns, public pre-launch teasers (#315), and previews", async () => {
    const baseAnon = state.anonHandler
    state.anonHandler = (call) => {
      if (call.target === "campaign_faqs") return { data: FAQS }
      return baseAnon(call)
    }

    const publicDoc = parseDoc(renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) })))
    expect(publicDoc.querySelector('a[href="#hoi-dap"]')?.textContent).toContain("Hỏi đáp")
    expect(publicDoc.querySelector("section#hoi-dap h2")?.textContent).toBe("Câu hỏi thường gặp")
    expect(publicDoc.querySelector("section#hoi-dap summary")?.textContent).toContain(
      "Tiền ủng hộ có công khai sao kê không?"
    )

    // Public pre-launch teaser (approved + prelaunch_public + future starts_at) renders FAQs for anon without money leaks.
    const prelaunchRow = {
      ...campaignFixture("approved"),
      prelaunch_public: true,
      starts_at: "2099-12-01T00:00:00Z",
      ends_at: "2099-12-31T00:00:00Z",
    }
    state.anonHandler = (call) => {
      if (call.target === "campaigns") return { data: prelaunchRow }
      if (call.target === "campaign_faqs") return { data: FAQS }
      if (call.target === "rpc:public_organizer") return { data: [] }
      if (call.target === "rpc:campaign_follower_count") return { data: 5 }
      if (call.target === "rpc:campaign_public_team") return { data: [] }
      if (
        call.target === "campaign_milestones" ||
        call.target === "campaign_updates" ||
        call.target === "campaign_media"
      )
        return { data: [] }
      return undefined
    }

    const prelaunchDoc = parseDoc(renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) })))
    expect(prelaunchDoc.querySelector('a[href="#hoi-dap"]')?.textContent).toContain("Hỏi đáp")
    expect(prelaunchDoc.querySelector("section#hoi-dap summary")?.textContent).toContain(
      "Tiền ủng hộ có công khai sao kê không?"
    )
    expect(prelaunchDoc.querySelector(`a[href="/campaigns/${SLUG}/statement"]`)).toBeNull()

    // Organizer preview also renders FAQs.
    state.session = {
      user: { id: VIEWER, email: "org@dos.me", name: "Người tổ chức" },
      accessToken: "org-token",
    }
    state.anonHandler = () => ({ data: null })
    state.userHandler = (call) => {
      if (call.target === "campaigns") return { data: campaignFixture("approved") }
      if (call.target === "campaign_faqs") return { data: FAQS }
      if (
        call.target === "campaign_milestones" ||
        call.target === "campaign_updates" ||
        call.target === "campaign_media"
      )
        return { data: [] }
      return undefined
    }

    const previewDoc = parseDoc(renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) })))
    expect(previewDoc.querySelector('a[href="#hoi-dap"]')?.textContent).toContain("Hỏi đáp")
    expect(previewDoc.querySelector("section#hoi-dap summary")?.textContent).toContain(
      "Tiền ủng hộ có công khai sao kê không?"
    )
  })

  it("omits FAQ section and 'Hỏi đáp' tab when no FAQs exist or when the FAQ query fails", async () => {
    const baseAnon = state.anonHandler
    state.anonHandler = (call) => {
      if (call.target === "campaign_faqs") return { data: null, error: { code: "57014", message: "timeout" } }
      return baseAnon(call)
    }

    const doc = parseDoc(renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) })))
    expect(doc.querySelector("section#hoi-dap")).toBeNull()
    expect(doc.querySelector('a[href="#hoi-dap"]')).toBeNull()
  })
})

describe("CampaignPage ambassador referral links & opt-in leaderboard (DOS/Give#319)", () => {
  it("shows attribution note, passes hidden ambassador_ref to DonateForm, and renders leaderboard on live campaign", async () => {
    state.serviceHandler = (call) => {
      if (call.target === "rpc:payment_account") {
        return {
          data: {
            channel: "statement_import",
            bank_bin: "970436",
            account_number: "0123456789",
            account_name: "QUY BAN MAY",
          },
        }
      }
      return undefined
    }
    const baseAnon = state.anonHandler
    state.anonHandler = (call) => {
      if (call.target === "rpc:public_ambassador_ref") {
        return { data: [{ ref_code: "ab23cd45ef", display_name: "CLB Sinh viên Xanh" }] }
      }
      if (call.target === "rpc:campaign_ambassador_leaderboard") {
        return {
          data: [
            {
              ref_code: "ab23cd45ef",
              display_name: "CLB Sinh viên Xanh",
              matched_count: 3,
              matched_total_vnd: 900_000,
            },
          ],
        }
      }
      return baseAnon(call)
    }

    const html = renderToStaticMarkup(
      await CampaignPage({
        params: Promise.resolve({ slug: SLUG }),
        searchParams: Promise.resolve({ ref: "AB23CD45EF" }),
      })
    )
    const doc = parseDoc(html)

    expect(doc.body.textContent).toContain("Bạn đang ủng hộ qua lời kêu gọi của CLB Sinh viên Xanh.")
    expect(doc.querySelector('input[name="ambassador_ref"]')?.getAttribute("value")).toBe("ab23cd45ef")
    expect(doc.querySelector("section#nguoi-dong-hanh-lan-toa h2")?.textContent).toBe("Người đồng hành lan tỏa")
    expect(doc.querySelector("section#nguoi-dong-hanh-lan-toa")?.textContent).toContain("900.000")
    // Guest sees clean login link preserving ?ref= for creating an ambassador link.
    const ambassadorLogin = [...doc.querySelectorAll('a[href^="/auth/login"]')].find((a) =>
      a.textContent?.includes("Tạo link kêu gọi giúp chiến dịch")
    )
    expect(ambassadorLogin?.getAttribute("href")).toBe(
      `/auth/login?return_path=${encodeURIComponent(`/campaigns/${SLUG}?ref=ab23cd45ef`)}`
    )
  })

  it("preserves valid ?ref= into back campaign pledge links and RewardTiers, and fails open on invalid ?ref=", async () => {
    const baseAnon = state.anonHandler
    state.anonHandler = (call) => {
      if (call.target === "campaigns") {
        return { data: { ...campaignFixture("live"), type: "back", funding_model: "all_or_nothing" } }
      }
      if (call.target === "public_reward_tiers") {
        return {
          data: [
            {
              id: "44444444-4444-4444-8444-444444444444",
              campaign_id: CAMPAIGN,
              title: "Gói Đồng Hành",
              description: null,
              min_amount: 200_000,
              quantity_limit: 50,
              quantity_claimed: 0,
              quantity_remaining: 50,
              estimated_delivery: null,
              requires_shipping: false,
              shipping_note: null,
              sort_order: 0,
            },
          ],
        }
      }
      if (call.target === "rpc:public_ambassador_ref") {
        return { data: [{ ref_code: "ab23cd45ef", display_name: "Minh Anh" }] }
      }
      return baseAnon(call)
    }

    const validDoc = parseDoc(
      renderToStaticMarkup(
        await CampaignPage({
          params: Promise.resolve({ slug: SLUG }),
          searchParams: Promise.resolve({ ref: "ab23cd45ef" }),
        })
      )
    )
    expect(validDoc.querySelector(`a[href="/campaigns/${SLUG}/pledge?ref=ab23cd45ef"]`)).not.toBeNull()
    expect(
      validDoc.querySelector(
        `a[href="/campaigns/${SLUG}/pledge?tier=44444444-4444-4444-8444-444444444444&ref=ab23cd45ef"]`
      )
    ).not.toBeNull()

    // Malformed ?ref= never queries public_ambassador_ref and never blocks rendering.
    state.anonCalls.length = 0
    const badDoc = parseDoc(
      renderToStaticMarkup(
        await CampaignPage({
          params: Promise.resolve({ slug: SLUG }),
          searchParams: Promise.resolve({ ref: "bad!!ref" }),
        })
      )
    )
    expect(state.anonCalls.some((c) => c.target === "rpc:public_ambassador_ref")).toBe(false)
    expect(badDoc.querySelector(`a[href="/campaigns/${SLUG}/pledge"]`)).not.toBeNull()
  })

  it("shows ambassador link trigger on public pre-launch, NEVER queries/renders leaderboard on pre-launch or preview, and hides link trigger on ended/draft", async () => {
    // 1. Public pre-launch: ambassador trigger shown, leaderboard NEVER queried/rendered.
    const baseAnon = state.anonHandler
    state.anonHandler = (call) => {
      if (call.target === "campaigns") {
        return {
          data: {
            ...campaignFixture("approved"),
            prelaunch_public: true,
            starts_at: "2099-06-01T00:00:00.000Z",
          },
        }
      }
      return baseAnon(call)
    }
    const preDoc = parseDoc(renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) })))
    expect(preDoc.body.textContent).toContain("Tạo link kêu gọi giúp chiến dịch")
    expect(preDoc.querySelector("section#nguoi-dong-hanh-lan-toa")).toBeNull()
    expect(state.anonCalls.some((c) => c.target === "rpc:campaign_ambassador_leaderboard")).toBe(false)

    // 2. Ended (succeeded) campaign: leaderboard renders, ambassador link creation button hidden.
    state.anonCalls.length = 0
    state.anonHandler = (call) => {
      if (call.target === "campaigns") return { data: campaignFixture("succeeded") }
      if (call.target === "rpc:campaign_ambassador_leaderboard") {
        return {
          data: [{ ref_code: "ended12345", display_name: "Đại Sứ Cũ", matched_count: 2, matched_total_vnd: 500_000 }],
        }
      }
      return baseAnon(call)
    }
    const endedDoc = parseDoc(renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) })))
    expect(endedDoc.body.textContent).not.toContain("Tạo link kêu gọi giúp chiến dịch")
    expect(endedDoc.querySelector("section#nguoi-dong-hanh-lan-toa")?.textContent).toContain("Đại Sứ Cũ")

    // 3. Draft preview: neither ambassador trigger nor leaderboard queried/rendered.
    state.anonCalls.length = 0
    state.userCalls.length = 0
    state.session = { user: { id: VIEWER, email: "owner@dos.me", name: "Chủ chiến dịch" }, accessToken: "owner-jwt" }
    state.anonHandler = (call) => (call.target === "campaigns" ? { data: null } : baseAnon(call))
    state.userHandler = (call) => {
      if (call.target === "campaigns") return { data: campaignFixture("draft") }
      if (
        call.target === "campaign_milestones" ||
        call.target === "campaign_updates" ||
        call.target === "campaign_media" ||
        call.target === "campaign_faqs"
      ) {
        return { data: [] }
      }
      return undefined
    }
    const draftDoc = parseDoc(renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) })))
    expect(draftDoc.body.textContent).not.toContain("Tạo link kêu gọi giúp chiến dịch")
    expect(draftDoc.querySelector("section#nguoi-dong-hanh-lan-toa")).toBeNull()
    expect(state.anonCalls.some((c) => c.target === "rpc:campaign_ambassador_leaderboard")).toBe(false)
    expect(state.userCalls.some((c) => c.target === "rpc:get_my_campaign_ambassador")).toBe(false)
  })
})

describe("DonorWishesWall on /campaigns/[slug] (DOS/Give#320)", () => {
  it("renders Tường lời chúc on live public campaign, passes caller JWT when signed in, and enables hidden wishes drawer for accepted editor", async () => {
    const baseAnon = state.anonHandler
    state.session = { user: { id: VIEWER, email: "editor@dos.me", name: "Đồng tổ chức" }, accessToken: "editor-jwt" }
    state.anonHandler = (call) => {
      if (call.target === "campaigns") return { data: campaignFixture("live") }
      return baseAnon(call)
    }
    state.userHandler = (call) => {
      if (call.target === "rpc:my_campaign_roles") {
        return { data: [{ campaign_id: CAMPAIGN, role: "editor" }] }
      }
      if (call.target === "rpc:list_campaign_wishes") {
        return {
          data: [
            {
              contribution_id: "3200d000-0000-4000-8000-000000000001",
              display_name: "Nguyễn An",
              is_anonymous: false,
              amount: 500_000,
              message: "Chúc chiến dịch sớm đạt mục tiêu!",
              created_at: "2026-11-22T09:00:00.000Z",
              heart_count: 3,
              viewer_hearted: true,
              total_count: 1,
            },
          ],
        }
      }
      if (call.target === "rpc:list_hidden_campaign_wishes") {
        return {
          data: [
            {
              contribution_id: "3200d000-0000-4000-8000-000000000002",
              display_name: null,
              is_anonymous: true,
              amount: 100_000,
              message: "Lời chúc đã ẩn bởi biên tập viên",
              created_at: "2026-11-22T08:00:00.000Z",
              message_hidden_at: "2026-11-22T08:30:00.000Z",
              message_hidden_role: "editor",
              message_hide_reason: "Quảng cáo",
              can_restore: true,
            },
          ],
        }
      }
      return undefined
    }

    const doc = parseDoc(
      renderToStaticMarkup(
        await CampaignPage({
          params: Promise.resolve({ slug: SLUG }),
          searchParams: Promise.resolve({ show_hidden_wishes: "1" }),
        })
      )
    )
    const section = doc.querySelector("section#tuong-loi-chuc")
    expect(section).not.toBeNull()
    expect(section?.textContent).toContain("Tường lời chúc")
    expect(section?.textContent).toContain("Chúc chiến dịch sớm đạt mục tiêu!")
    expect(section?.textContent).toContain("Lời chúc đã ẩn bởi biên tập viên")
    expect(section?.textContent).toContain("Khôi phục lời chúc")
    expect(state.userCalls.some((c) => c.target === "rpc:list_campaign_wishes")).toBe(true)
    expect(state.userCalls.some((c) => c.target === "rpc:list_hidden_campaign_wishes")).toBe(true)
    expect(state.serviceCalls.some((c) => c.target === "rpc:list_campaign_wishes")).toBe(false)
  })

  it("NEVER queries or renders Tường lời chúc on public pre-launch or draft preview", async () => {
    const baseAnon = state.anonHandler
    // 1. Public pre-launch
    state.anonHandler = (call) => {
      if (call.target === "campaigns") {
        return {
          data: {
            ...campaignFixture("approved"),
            prelaunch_public: true,
            starts_at: "2099-06-01T00:00:00.000Z",
          },
        }
      }
      return baseAnon(call)
    }
    const preDoc = parseDoc(renderToStaticMarkup(await CampaignPage({ params: Promise.resolve({ slug: SLUG }) })))
    expect(preDoc.querySelector("section#tuong-loi-chuc")).toBeNull()
    expect(state.anonCalls.some((c) => c.target === "rpc:list_campaign_wishes")).toBe(false)

    // 2. Draft preview as signed-in owner
    state.anonCalls.length = 0
    state.userCalls.length = 0
    state.session = { user: { id: VIEWER, email: "owner@dos.me", name: "Owner" }, accessToken: "owner-jwt" }
    state.anonHandler = (call) => (call.target === "campaigns" ? { data: null } : baseAnon(call))
    state.userHandler = (call) => {
      if (call.target === "campaigns") return { data: campaignFixture("draft") }
      if (
        call.target === "campaign_milestones" ||
        call.target === "campaign_updates" ||
        call.target === "campaign_media" ||
        call.target === "campaign_faqs"
      ) {
        return { data: [] }
      }
      return undefined
    }
    const draftDoc = parseDoc(
      renderToStaticMarkup(
        await CampaignPage({
          params: Promise.resolve({ slug: SLUG }),
          searchParams: Promise.resolve({ show_hidden_wishes: "1" }),
        })
      )
    )
    expect(draftDoc.querySelector("section#tuong-loi-chuc")).toBeNull()
    expect(state.anonCalls.some((c) => c.target === "rpc:list_campaign_wishes")).toBe(false)
    expect(state.userCalls.some((c) => c.target === "rpc:list_campaign_wishes")).toBe(false)
    expect(state.userCalls.some((c) => c.target === "rpc:list_hidden_campaign_wishes")).toBe(false)
  })
})
