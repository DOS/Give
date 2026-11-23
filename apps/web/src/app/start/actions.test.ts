import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { getSession } from "@/lib/auth/session"
import { getCampaignTemplate } from "@/lib/campaign-templates"
import type { Category, Organizer } from "@/lib/campaigns"
import { dbErrorMessage } from "@/lib/errors"
import { uniqueSlug } from "@/lib/slug"
import { dbAs } from "@/lib/supabase"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const SAVED = "Đã lưu hồ sơ người tổ chức."
const REVERIFY = "Đã lưu. Hồ sơ cần được xác minh lại vì tên hoặc loại đã đổi."
const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."

const state = vi.hoisted(() => ({
  handler: (() => undefined) as Handler,
  calls: [] as Call[],
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  }),
}))
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }))
vi.mock("@/lib/slug", () => ({ uniqueSlug: vi.fn() }))
vi.mock("@/lib/supabase", () => ({
  dbAs: vi.fn(() => fakeDb((call) => state.handler(call), state.calls)),
}))

const { createCampaign, saveOrganizer } = await import("./actions")

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

function organizerForm(overrides: Record<string, string> = {}) {
  return form({
    kind: "individual",
    legal_name: "Nguyễn Thị Lan",
    display_name: "Quỹ học bổng",
    phone: "0901234567",
    ...overrides,
  })
}

function campaignForm(overrides: Record<string, string> = {}) {
  return form({ type: "give", title: "  Quỹ học bổng  ", goal_amount: "10.000", ...overrides })
}

function organizer(overrides: Partial<Organizer> = {}): Organizer {
  return {
    user_id: USER,
    kind: "individual",
    legal_name: "Nguyễn Thị Lan",
    display_name: "Quỹ học bổng",
    phone: "0901234567",
    verification_status: "unverified",
    verified_at: null,
    created_at: "2026-11-01T00:00:00Z",
    ...overrides,
  }
}

const ORGANIZER_REVALIDATIONS = [
  ["/start"],
  ["/me"],
  ["/"],
  ["/campaigns"],
  ["/campaigns/[slug]", "page"],
  ["/u/[handle]", "page"],
  ["/me/campaigns/[id]", "page"],
  ["/me/accounts"],
  ["/admin"],
  ["/admin/reports"],
  ["/admin/accounts"],
  ["/admin/account-swaps"],
]

function noNavigation() {
  expect(revalidatePath).not.toHaveBeenCalled()
  expect(redirect).not.toHaveBeenCalled()
}

function expectOrganizerRevalidated() {
  expect(vi.mocked(revalidatePath).mock.calls).toEqual(ORGANIZER_REVALIDATIONS)
}

beforeEach(() => {
  vi.clearAllMocks()
  state.calls.length = 0
  state.handler = () => undefined
  vi.mocked(getSession).mockResolvedValue({ user: { id: USER, email: null, name: null }, accessToken: "token" })
  vi.mocked(uniqueSlug).mockReset().mockReturnValue("quy-hoc-bong-first")
})

describe("saveOrganizer (DOS/Give#208)", () => {
  it("refuses signed-out callers before opening a database client", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null)
    expect(await saveOrganizer(null, organizerForm())).toEqual({ ok: false, message: SIGNED_OUT })
    expect(dbAs).not.toHaveBeenCalled()
    expect(state.calls).toHaveLength(0)
    noNavigation()
  })

  it.each([
    ["kind", "company", expect.any(String)],
    ["legal_name", "  ", "Nhập họ tên hoặc tên tổ chức"],
    ["legal_name", "x".repeat(121), expect.any(String)],
    ["display_name", "  ", "Nhập tên hiển thị"],
    ["display_name", "x".repeat(81), expect.any(String)],
    ["phone", "12", "Số điện thoại không hợp lệ"],
    ["phone", "090abc1234", "Số điện thoại không hợp lệ"],
  ])("rejects invalid %s = %s before querying", async (field, value, message) => {
    expect(await saveOrganizer(null, organizerForm({ [field]: value }))).toEqual({ ok: false, message })
    expect(dbAs).not.toHaveBeenCalled()
    expect(state.calls).toHaveLength(0)
    noNavigation()
  })

  it.each(["individual", "organization"])("inserts a normalized %s profile owned by the session user", async (kind) => {
    expect(
      await saveOrganizer(
        null,
        organizerForm({
          kind,
          legal_name: "  Nguyễn Thị Lan  ",
          display_name: "  Quỹ học bổng  ",
          phone: " +84 901.234-567 ",
          user_id: "someone-else",
        })
      )
    ).toEqual({ ok: true, message: SAVED })
    expect(dbAs).toHaveBeenCalledExactlyOnceWith("token")
    expect(state.calls).toHaveLength(2)
    expect(state.calls[0].target).toBe("organizers")
    expect(op(state.calls[0], "eq")).toEqual(["user_id", USER])
    expect(op(state.calls[0], "maybeSingle")).toEqual([])
    expect(state.calls[1]).toEqual({
      target: "organizers",
      ops: [
        [
          "insert",
          { user_id: USER, kind, legal_name: "Nguyễn Thị Lan", display_name: "Quỹ học bổng", phone: "+84901234567" },
        ],
      ],
    })
    expectOrganizerRevalidated()
    expect(redirect).not.toHaveBeenCalled()
  })

  it("stores an optional blank phone as null", async () => {
    expect(await saveOrganizer(null, organizerForm({ phone: "  " }))).toEqual({ ok: true, message: SAVED })
    expect(op(state.calls[1], "insert")?.[0]).toMatchObject({ phone: null })
  })

  it("falls back to updating by user_id when a concurrent initial insert hits 23505", async () => {
    state.handler = (call) => {
      if (op(call, "maybeSingle")) return { data: null }
      if (op(call, "insert")) return { error: { code: "23505", message: "duplicate key value" } }
      return undefined
    }
    expect(await saveOrganizer(null, organizerForm())).toEqual({ ok: true, message: SAVED })
    expect(state.calls).toHaveLength(3)
    expect(op(state.calls[1], "insert")).toEqual([
      {
        user_id: USER,
        kind: "individual",
        legal_name: "Nguyễn Thị Lan",
        display_name: "Quỹ học bổng",
        phone: "0901234567",
      },
    ])
    expect(state.calls[2]).toEqual({
      target: "organizers",
      ops: [
        [
          "update",
          { kind: "individual", legal_name: "Nguyễn Thị Lan", display_name: "Quỹ học bổng", phone: "0901234567" },
        ],
        ["eq", "user_id", USER],
      ],
    })
    expectOrganizerRevalidated()
  })

  it("surfaces the fallback update error without revalidating when 23505 recovery fails", async () => {
    const fallbackError = { code: "42501", message: "permission denied" }
    state.handler = (call) => {
      if (op(call, "maybeSingle")) return { data: null }
      if (op(call, "insert")) return { error: { code: "23505", message: "duplicate key value" } }
      return { error: fallbackError }
    }
    expect(await saveOrganizer(null, organizerForm())).toEqual({ ok: false, message: dbErrorMessage(fallbackError) })
    expect(state.calls).toHaveLength(3)
    noNavigation()
  })

  it("updates only editable columns, scoped to the session user, without inserting or upserting", async () => {
    state.handler = (call) => (op(call, "maybeSingle") ? { data: organizer() } : undefined)
    expect(await saveOrganizer(null, organizerForm({ user_id: "someone-else" }))).toEqual({ ok: true, message: SAVED })
    expect(dbAs).toHaveBeenCalledExactlyOnceWith("token")
    expect(state.calls).toHaveLength(2)
    expect(state.calls[1]).toEqual({
      target: "organizers",
      ops: [
        [
          "update",
          { kind: "individual", legal_name: "Nguyễn Thị Lan", display_name: "Quỹ học bổng", phone: "0901234567" },
        ],
        ["eq", "user_id", USER],
      ],
    })
    expectOrganizerRevalidated()
    expect(redirect).not.toHaveBeenCalled()
  })

  const identityChanges: Record<string, string>[] = [
    { legal_name: "Nguyễn Thị Mai" },
    { display_name: "Quỹ sách mới" },
    { kind: "organization" },
  ]

  describe.each(["verified", "pending"] as const)("%s profiles", (verification_status) => {
    beforeEach(() => {
      state.handler = (call) => (op(call, "maybeSingle") ? { data: organizer({ verification_status }) } : undefined)
    })

    it.each(identityChanges)("reports re-verification when identity changes: %j", async (change) => {
      expect(await saveOrganizer(null, organizerForm(change))).toEqual({ ok: true, message: REVERIFY })
      expect(op(state.calls[1], "update")?.[0]).toMatchObject(change)
      expectOrganizerRevalidated()
    })

    it.each([{ phone: "0987654321" }, { phone: "090 123.45-67" }])(
      "keeps the normal success message for phone-only edits or an unchanged normalized profile: %j",
      async (change) => {
        expect(await saveOrganizer(null, organizerForm(change))).toEqual({ ok: true, message: SAVED })
        expectOrganizerRevalidated()
      }
    )
  })

  describe.each(["unverified", "rejected"] as const)("%s profiles", (verification_status) => {
    it.each(identityChanges)("keeps the normal success message after an identity change: %j", async (change) => {
      state.handler = (call) => (op(call, "maybeSingle") ? { data: organizer({ verification_status }) } : undefined)
      expect(await saveOrganizer(null, organizerForm(change))).toEqual({ ok: true, message: SAVED })
      expectOrganizerRevalidated()
    })
  })

  it.each([
    { code: "PGRST303", message: "JWT expired" },
    { code: "42501", message: "permission denied" },
    { message: "private database details" },
  ])("surfaces organizer read failures through dbErrorMessage: %j", async (error) => {
    state.handler = () => ({ error })
    expect(await saveOrganizer(null, organizerForm())).toEqual({ ok: false, message: dbErrorMessage(error) })
    expect(state.calls).toHaveLength(1)
    expect(op(state.calls[0], "maybeSingle")).toEqual([])
    noNavigation()
  })

  it.each([null, organizer()])(
    "reports a failed profile write without revalidating (existing: %j)",
    async (existing) => {
      const error = { code: "42501", message: "permission denied" }
      state.handler = (call) => (op(call, "maybeSingle") ? { data: existing } : { error })
      expect(await saveOrganizer(null, organizerForm())).toEqual({ ok: false, message: dbErrorMessage(error) })
      expect(state.calls).toHaveLength(2)
      expect(op(state.calls[1], existing ? "update" : "insert")).toBeDefined()
      noNavigation()
    }
  )
})

describe("createCampaign (DOS/Give#208)", () => {
  it("refuses signed-out callers before querying or generating a slug", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null)
    expect(await createCampaign(null, campaignForm())).toEqual({ ok: false, message: SIGNED_OUT })
    expect(dbAs).not.toHaveBeenCalled()
    expect(state.calls).toHaveLength(0)
    expect(uniqueSlug).not.toHaveBeenCalled()
    noNavigation()
  })

  it.each([
    ["type", "other", "Chọn loại chiến dịch"],
    ["title", "  ", "Tiêu đề cần ít nhất 5 ký tự"],
    ["title", "abcd", "Tiêu đề cần ít nhất 5 ký tự"],
    ["title", "x".repeat(121), expect.any(String)],
    ["goal_amount", "9.999", "Mục tiêu tối thiểu là 10.000 ₫"],
    ["goal_amount", "not money", "Số tiền không hợp lệ"],
  ])("rejects invalid %s = %s before querying", async (field, value, message) => {
    expect(await createCampaign(null, campaignForm({ [field]: value }))).toEqual({ ok: false, message })
    expect(dbAs).not.toHaveBeenCalled()
    expect(state.calls).toHaveLength(0)
    expect(uniqueSlug).not.toHaveBeenCalled()
    noNavigation()
  })

  it.each([
    ["give", "flexible"],
    ["back", "all_or_nothing"],
  ])("creates a %s draft with %s funding at the minimum goal, then redirects", async (type, funding_model) => {
    state.handler = () => ({ data: { id: CAMPAIGN } })
    await expect(createCampaign(null, campaignForm({ type, organizer_id: "someone-else" }))).rejects.toThrow(
      `NEXT_REDIRECT /me/campaigns/${CAMPAIGN}`
    )
    expect(dbAs).toHaveBeenCalledExactlyOnceWith("token")
    expect(uniqueSlug).toHaveBeenCalledExactlyOnceWith("Quỹ học bổng")
    expect(state.calls).toEqual([
      {
        target: "campaigns",
        ops: [
          [
            "insert",
            {
              slug: "quy-hoc-bong-first",
              type,
              funding_model,
              organizer_id: USER,
              title: "Quỹ học bổng",
              goal_amount: 10_000,
            },
          ],
          ["select", "id"],
          ["single"],
        ],
      },
    ])
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/me/campaigns")
    expect(redirect).toHaveBeenCalledExactlyOnceWith(`/me/campaigns/${CAMPAIGN}`)
    expect(vi.mocked(revalidatePath).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(redirect).mock.invocationCallOrder[0]
    )
  })

  it("retries one slug collision with a fresh slug and redirects after success", async () => {
    vi.mocked(uniqueSlug).mockReturnValueOnce("quy-hoc-bong-first").mockReturnValueOnce("quy-hoc-bong-second")
    state.handler = () => (state.calls.length === 1 ? { error: { code: "23505" } } : { data: { id: CAMPAIGN } })
    await expect(createCampaign(null, campaignForm())).rejects.toThrow(`NEXT_REDIRECT /me/campaigns/${CAMPAIGN}`)
    expect(state.calls).toHaveLength(2)
    expect(uniqueSlug).toHaveBeenCalledTimes(2)
    expect(state.calls.map((call) => op(call, "insert")?.[0])).toEqual([
      {
        slug: "quy-hoc-bong-first",
        type: "give",
        funding_model: "flexible",
        organizer_id: USER,
        title: "Quỹ học bổng",
        goal_amount: 10_000,
      },
      {
        slug: "quy-hoc-bong-second",
        type: "give",
        funding_model: "flexible",
        organizer_id: USER,
        title: "Quỹ học bổng",
        goal_amount: 10_000,
      },
    ])
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/me/campaigns")
    expect(redirect).toHaveBeenCalledExactlyOnceWith(`/me/campaigns/${CAMPAIGN}`)
  })

  it("fails cleanly after exactly two slug collisions", async () => {
    vi.mocked(uniqueSlug).mockReturnValueOnce("quy-hoc-bong-first").mockReturnValueOnce("quy-hoc-bong-second")
    state.handler = () => ({ error: { code: "23505", message: "private constraint details" } })
    expect(await createCampaign(null, campaignForm())).toEqual({
      ok: false,
      message: dbErrorMessage({ code: "23505" }),
    })
    expect(state.calls).toHaveLength(2)
    expect(uniqueSlug).toHaveBeenCalledTimes(2)
    expect(state.calls.map((call) => op(call, "insert")?.[0])).toEqual([
      expect.objectContaining({ slug: "quy-hoc-bong-first" }),
      expect.objectContaining({ slug: "quy-hoc-bong-second" }),
    ])
    noNavigation()
  })

  it("asks for an organizer profile on 23503 without retrying", async () => {
    state.handler = () => ({ error: { code: "23503", message: "foreign key violation" } })
    expect(await createCampaign(null, campaignForm())).toEqual({
      ok: false,
      message: "Hãy tạo hồ sơ người tổ chức trước.",
    })
    expect(state.calls).toHaveLength(1)
    expect(uniqueSlug).toHaveBeenCalledTimes(1)
    noNavigation()
  })

  it.each([{ code: "42501", message: "permission denied" }, { message: "private database details" }])(
    "reports other insert errors without retrying: %j",
    async (error) => {
      state.handler = () => ({ error })
      expect(await createCampaign(null, campaignForm())).toEqual({ ok: false, message: dbErrorMessage(error) })
      expect(state.calls).toHaveLength(1)
      expect(uniqueSlug).toHaveBeenCalledTimes(1)
      noNavigation()
    }
  )
})

const HEALTHCARE_CAT: Category = {
  id: "33333333-3333-4333-8333-333333333333",
  slug: "healthcare",
  name: "Y tế",
  description: null,
  icon: null,
  color: null,
  applies_to: "give",
  sort_order: 3,
}

const TECH_CAT: Category = {
  id: "44444444-4444-4444-8444-444444444444",
  slug: "technology",
  name: "Công nghệ",
  description: null,
  icon: null,
  color: null,
  applies_to: "back",
  sort_order: 101,
}

describe("createCampaign templates (DOS/Give#338)", () => {
  it.each(["blank", "unknown-template", ""])(
    "behaves identically to omitted template_id when template_id = %j",
    async (template_id) => {
      state.handler = () => ({ data: { id: CAMPAIGN } })
      await expect(createCampaign(null, campaignForm({ template_id }))).rejects.toThrow(
        `NEXT_REDIRECT /me/campaigns/${CAMPAIGN}`
      )
      expect(state.calls).toEqual([
        {
          target: "campaigns",
          ops: [
            [
              "insert",
              {
                slug: "quy-hoc-bong-first",
                type: "give",
                funding_model: "flexible",
                organizer_id: USER,
                title: "Quỹ học bổng",
                goal_amount: 10_000,
              },
            ],
            ["select", "id"],
            ["single"],
          ],
        },
      ])
      expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/me/campaigns")
      expect(redirect).toHaveBeenCalledExactlyOnceWith(`/me/campaigns/${CAMPAIGN}`)
    }
  )

  it("populates category_id, summary, story, and starter FAQs sequentially for a matching non-blank template", async () => {
    const template = getCampaignTemplate("creative_product")!
    state.handler = (call) => {
      if (call.target === "categories") return { data: [HEALTHCARE_CAT, TECH_CAT] }
      if (call.target === "campaigns") return { data: { id: CAMPAIGN } }
      if (call.target === "rpc:upsert_campaign_faq") return { data: [{ id: "faq-id" }] }
      return undefined
    }

    await expect(
      createCampaign(
        null,
        campaignForm({
          type: "back",
          title: "Bàn phím cơ tiếng Việt",
          goal_amount: "80.000.000",
          template_id: "creative_product",
        })
      )
    ).rejects.toThrow(`NEXT_REDIRECT /me/campaigns/${CAMPAIGN}`)

    expect(state.calls[0].target).toBe("categories")
    expect(state.calls[1].target).toBe("campaigns")
    expect(op(state.calls[1], "insert")?.[0]).toEqual({
      slug: "quy-hoc-bong-first",
      type: "back",
      funding_model: "all_or_nothing",
      organizer_id: USER,
      title: "Bàn phím cơ tiếng Việt",
      goal_amount: 80_000_000,
      category_id: TECH_CAT.id,
      summary: template.summary,
      story: template.story,
    })

    const faqCalls = state.calls.slice(2)
    expect(faqCalls).toHaveLength(3)
    expect(faqCalls.map((c) => c.target)).toEqual([
      "rpc:upsert_campaign_faq",
      "rpc:upsert_campaign_faq",
      "rpc:upsert_campaign_faq",
    ])
    expect(faqCalls.map((c) => op(c, "args")?.[0])).toEqual(
      template.starterFaqs.map((faq) => ({
        p_campaign_id: CAMPAIGN,
        p_question: faq.question,
        p_answer: faq.answer,
        p_faq_id: null,
        p_position: null,
      }))
    )
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/me/campaigns")
    expect(redirect).toHaveBeenCalledExactlyOnceWith(`/me/campaigns/${CAMPAIGN}`)
  })

  it("omits category_id when the user manually overrides type to one incompatible with the template category", async () => {
    const template = getCampaignTemplate("medical_emergency")!
    state.handler = (call) => {
      if (call.target === "categories") return { data: [HEALTHCARE_CAT, TECH_CAT] }
      if (call.target === "campaigns") return { data: { id: CAMPAIGN } }
      return undefined
    }

    await expect(
      createCampaign(
        null,
        campaignForm({
          type: "back",
          title: "Dự án thiết bị y tế",
          goal_amount: "100.000.000",
          template_id: "medical_emergency",
        })
      )
    ).rejects.toThrow(`NEXT_REDIRECT /me/campaigns/${CAMPAIGN}`)

    const inserted = op(state.calls[1], "insert")?.[0] as Record<string, unknown>
    expect(inserted).not.toHaveProperty("category_id")
    expect(inserted).toMatchObject({
      type: "back",
      funding_model: "all_or_nothing",
      summary: template.summary,
      story: template.story,
    })
    expect(state.calls.filter((c) => c.target === "rpc:upsert_campaign_faq")).toHaveLength(3)
  })

  it("never blocks draft creation or redirect when category lookup or starter FAQ insertion fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      let faqCount = 0
      state.handler = (call) => {
        if (call.target === "categories") return { error: { code: "42501", message: "cat read error" } }
        if (call.target === "campaigns") return { data: { id: CAMPAIGN } }
        if (call.target === "rpc:upsert_campaign_faq") {
          faqCount++
          if (faqCount === 1) return { error: { code: "42501", message: "faq denied" } }
          if (faqCount === 2) throw new Error("network blip")
          return { data: [{ id: "faq-3" }] }
        }
        return undefined
      }

      await expect(
        createCampaign(
          null,
          campaignForm({
            type: "give",
            title: "Hỗ trợ chi phí phẫu thuật",
            goal_amount: "100.000.000",
            template_id: "medical_emergency",
          })
        )
      ).rejects.toThrow(`NEXT_REDIRECT /me/campaigns/${CAMPAIGN}`)

      const insertCall = state.calls.find((c) => c.target === "campaigns")
      expect(op(insertCall, "insert")?.[0]).not.toHaveProperty("category_id")
      expect(state.calls.filter((c) => c.target === "rpc:upsert_campaign_faq")).toHaveLength(3)
      expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/me/campaigns")
      expect(redirect).toHaveBeenCalledExactlyOnceWith(`/me/campaigns/${CAMPAIGN}`)
      expect(spy).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it("looks up categories once and preserves template fields across a 23505 slug collision retry", async () => {
    const template = getCampaignTemplate("medical_emergency")!
    vi.mocked(uniqueSlug).mockReturnValueOnce("ho-tro-y-te-first").mockReturnValueOnce("ho-tro-y-te-second")

    let campaignAttempt = 0
    state.handler = (call) => {
      if (call.target === "categories") return { data: [HEALTHCARE_CAT] }
      if (call.target === "campaigns") {
        campaignAttempt++
        return campaignAttempt === 1 ? { error: { code: "23505" } } : { data: { id: CAMPAIGN } }
      }
      if (call.target === "rpc:upsert_campaign_faq") return { data: [{ id: "faq-id" }] }
      return undefined
    }

    await expect(
      createCampaign(
        null,
        campaignForm({
          type: "give",
          title: "Hỗ trợ phẫu thuật",
          goal_amount: "100.000.000",
          template_id: "medical_emergency",
        })
      )
    ).rejects.toThrow(`NEXT_REDIRECT /me/campaigns/${CAMPAIGN}`)

    expect(state.calls.filter((c) => c.target === "categories")).toHaveLength(1)
    const campaignInserts = state.calls.filter((c) => c.target === "campaigns").map((c) => op(c, "insert")?.[0])
    expect(campaignInserts).toEqual([
      expect.objectContaining({
        slug: "ho-tro-y-te-first",
        category_id: HEALTHCARE_CAT.id,
        summary: template.summary,
        story: template.story,
      }),
      expect.objectContaining({
        slug: "ho-tro-y-te-second",
        category_id: HEALTHCARE_CAT.id,
        summary: template.summary,
        story: template.story,
      }),
    ])
    expect(state.calls.filter((c) => c.target === "rpc:upsert_campaign_faq")).toHaveLength(3)
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/me/campaigns")
    expect(redirect).toHaveBeenCalledExactlyOnceWith(`/me/campaigns/${CAMPAIGN}`)
  })
})
