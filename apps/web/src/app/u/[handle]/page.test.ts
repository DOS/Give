import { Window } from "happy-dom"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const state = vi.hoisted(() => ({
  handler: (() => undefined) as Handler,
  calls: [] as Call[],
  tokens: [] as (string | undefined)[],
}))

const notFoundMock = vi.hoisted(() =>
  vi.fn((): never => {
    throw new Error("NEXT_NOT_FOUND")
  })
)

const permanentRedirectMock = vi.hoisted(() =>
  vi.fn((url: string): never => {
    throw new Error(`NEXT_PERMANENT_REDIRECT:${url}`)
  })
)

vi.mock("next/navigation", () => ({ notFound: notFoundMock, permanentRedirect: permanentRedirectMock }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}))
vi.mock("next/image", () => ({
  default: ({
    priority: _priority,
    fill: _fill,
    unoptimized: _unoptimized,
    ...rest
  }: {
    src: string
    alt: string
    priority?: boolean
    fill?: boolean
    unoptimized?: boolean
  }) => createElement("img", rest),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: (token?: string) => {
    state.tokens.push(token)
    return fakeDb((call) => state.handler(call), state.calls)
  },
}))

const { default: OrganizerProfilePage, generateMetadata } = await import("./page")

const LIVE_ID = "22222222-2222-4222-8222-222222222222"
const PAST_ID = "33333333-3333-4333-8333-333333333333"

function defaultHandler(call: Call) {
  if (call.target === "rpc:public_organizer_profile") {
    return {
      data: [
        {
          handle: "quy-ban-may",
          display_name: "Quỹ Bản Mây",
          avatar_url: "https://cdn.dos.me/avatars/ban-may.webp",
          kind: "organization",
          verification_status: "verified",
          bio: "Xây trường cho trẻ em vùng cao.\n<script>alert(1)</script>",
          created_at: "2026-10-01T00:00:00Z",
          // Private fields must never reach rendered HTML even if returned.
          legal_name: "Công ty TNHH Pháp Lý Bí Mật",
          phone: "0909999888",
          email: "private@example.vn",
          user_id: "11111111-1111-4111-8111-111111111111",
        },
      ],
    }
  }
  if (call.target === "rpc:list_organizer_public_campaigns") {
    return {
      data: [
        {
          id: LIVE_ID,
          slug: "xay-truong-ban-may",
          type: "give",
          title: "Xây trường Bản Mây",
          summary: "Tóm tắt",
          goal_amount: 100_000_000,
          ends_at: "2999-12-31T00:00:00Z",
          status: "live",
          display_options: { progress_bar: true, backers_count: true, time_remaining: true },
          cover_storage_path: null,
          cover_alt: null,
          created_at: "2026-11-10T00:00:00Z",
        },
        {
          id: PAST_ID,
          slug: "tu-sach-vung-cao",
          type: "back",
          title: "Tủ sách vùng cao",
          summary: null,
          goal_amount: 50_000_000,
          ends_at: "2026-01-01T00:00:00Z",
          status: "succeeded",
          display_options: { progress_bar: true, backers_count: true, time_remaining: true },
          cover_storage_path: null,
          cover_alt: null,
          created_at: "2026-10-05T00:00:00Z",
        },
      ],
    }
  }
  if (call.target === "public_campaigns") {
    return {
      data: [
        {
          id: LIVE_ID,
          type: "give",
          asset: "VND",
          goal_amount: 100_000_000,
          pledged_amount: 0,
          paid_amount: 70_000_000,
          disbursable_amount: 70_000_000,
          disbursed_amount: 0,
          refunded_amount: 0,
          unexplained_out_amount: 0,
          unexplained_out_count: 0,
          supporters_count: 18,
          other_in_amount: 0,
          refund_owed_amount: 0,
          backers_count: 0,
          payments_stopped_at: null,
          payments_stopped_note: null,
          own_transfer_amount: 0,
        },
        {
          id: PAST_ID,
          type: "back",
          asset: "VND",
          goal_amount: 50_000_000,
          pledged_amount: 55_000_000,
          paid_amount: 55_000_000,
          disbursable_amount: 55_000_000,
          disbursed_amount: 0,
          refunded_amount: 0,
          unexplained_out_amount: 0,
          unexplained_out_count: 0,
          supporters_count: 0,
          other_in_amount: 0,
          refund_owed_amount: 0,
          backers_count: 25,
          payments_stopped_at: null,
          payments_stopped_note: null,
          own_transfer_amount: 0,
        },
      ],
    }
  }
  return undefined
}

beforeEach(() => {
  vi.clearAllMocks()
  state.calls.length = 0
  state.tokens.length = 0
  state.handler = defaultHandler
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("OrganizerProfilePage (/u/[handle], DOS/Give#251)", () => {
  it("renders profile header, safe avatar, escaped bio, live + past campaign sections with ledger totals, and zero PII", async () => {
    const html = renderToStaticMarkup(
      await OrganizerProfilePage({ params: Promise.resolve({ handle: "quy-ban-may" }) })
    ).replace(/\u00a0/g, " ")

    // Uses anonymous client only.
    expect(state.tokens.every((t) => t === undefined)).toBe(true)

    const doc = new Window().document
    doc.body.innerHTML = html

    expect(doc.querySelector("h1")?.textContent).toBe("Quỹ Bản Mây")
    expect(html).toContain("Đã xác minh")
    expect(html).toContain("Tổ chức")
    expect(html).toContain("@quy-ban-may")
    expect(html).toContain("Tham gia từ 01/10/2026")
    expect(doc.querySelector("header img")?.getAttribute("src")).toBe("https://cdn.dos.me/avatars/ban-may.webp")

    // XSS safety: script tag in bio is escaped, never rendered as an executable element.
    expect(doc.querySelector('script:not([type="application/ld+json"])')).toBeNull()
    expect(doc.querySelector("header script")).toBeNull()
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;")

    // Zero PII leaks.
    expect(html).not.toContain("Công ty TNHH Pháp Lý Bí Mật")
    expect(html).not.toContain("0909999888")
    expect(html).not.toContain("private@example.vn")
    expect(html).not.toContain("11111111-1111-4111-8111-111111111111")

    // Grouped campaigns with ledger totals.
    expect(doc.querySelector("#live-campaigns")?.textContent).toContain("Đang gây quỹ")
    expect(doc.querySelector("#past-campaigns")?.textContent).toContain("Đã kết thúc")
    expect(html).toContain('href="/campaigns/xay-truong-ban-may"')
    expect(html).toContain("70.000.000 ₫")
    expect(html).toContain("18 người ủng hộ")
    expect(html).toContain('href="/campaigns/tu-sach-vung-cao"')
    expect(html).toContain("55.000.000 ₫")
    expect(html).toContain("25 người đồng hành")
    expect(
      op(
        state.calls.find((c) => c.target === "public_campaigns"),
        "in"
      )
    ).toEqual(["id", [LIVE_ID, PAST_ID]])
  })

  it("falls back to initials tile when avatar_url is missing or unsafe", async () => {
    state.handler = (call) => {
      if (call.target === "rpc:public_organizer_profile") {
        return {
          data: [
            {
              handle: "anh-binh",
              display_name: "Anh Bình",
              avatar_url: "javascript:alert(1)",
              kind: "individual",
              verification_status: "unverified",
              bio: null,
              created_at: "2026-11-01T00:00:00Z",
            },
          ],
        }
      }
      if (call.target === "rpc:list_organizer_public_campaigns") return { data: [] }
      return undefined
    }

    const html = renderToStaticMarkup(await OrganizerProfilePage({ params: Promise.resolve({ handle: "anh-binh" }) }))
    const doc = new Window().document
    doc.body.innerHTML = html

    expect(doc.querySelector("header img")).toBeNull()
    expect(doc.querySelector("header span.size-16")?.textContent).toBe("A")
    expect(html).toContain("Cá nhân")
    expect(html).toContain("Chưa có chiến dịch công khai nào.")
    expect(doc.querySelector('a[href="/campaigns"]')).not.toBeNull()
  })

  it.each(["ab", "bad--slug", "admin", "campaigns", "khong-ton-tai", " quy-ban-may "])(
    "calls notFound() for invalid, reserved, whitespace, or unknown handle: %s",
    async (handle) => {
      state.handler = () => ({ data: [] })
      await expect(OrganizerProfilePage({ params: Promise.resolve({ handle }) })).rejects.toThrow("NEXT_NOT_FOUND")
      expect(notFoundMock).toHaveBeenCalledTimes(1)
    }
  )

  it("permanently redirects non-canonical uppercase handles to their canonical lowercase URL", async () => {
    await expect(OrganizerProfilePage({ params: Promise.resolve({ handle: "Quy-Ban-May" }) })).rejects.toThrow(
      "NEXT_PERMANENT_REDIRECT:/u/quy-ban-may"
    )
    expect(permanentRedirectMock).toHaveBeenCalledWith("/u/quy-ban-may")
  })

  it("builds canonical Open Graph metadata for existing organizers and noindex metadata when not found", async () => {
    const foundMeta = await generateMetadata({ params: Promise.resolve({ handle: "quy-ban-may" }) })
    expect(foundMeta.title).toBe("Quỹ Bản Mây")
    expect(foundMeta.alternates?.canonical).toBe("/u/quy-ban-may")
    expect(foundMeta.openGraph).toMatchObject({
      type: "profile",
      siteName: "Give",
      locale: "vi_VN",
      title: "Quỹ Bản Mây",
      url: "/u/quy-ban-may",
      images: ["https://cdn.dos.me/avatars/ban-may.webp"],
    })

    state.handler = () => ({ data: [] })
    const missingMeta = await generateMetadata({ params: Promise.resolve({ handle: "khong-ton-tai" }) })
    expect(missingMeta).toEqual({
      title: "Không tìm thấy",
      robots: { index: false, follow: false },
    })
  })

  it("shows impact report summary badge in profile header and on campaign cards with published reports (DOS/Give#314)", async () => {
    state.handler = (call) => {
      if (call.target === "campaign_impact_reports") {
        return { data: [{ campaign_id: PAST_ID }] }
      }
      return defaultHandler(call)
    }

    const html = renderToStaticMarkup(
      await OrganizerProfilePage({ params: Promise.resolve({ handle: "quy-ban-may" }) })
    )
    expect(html).toContain("1 báo cáo tổng kết")
    expect(html).toContain("Có báo cáo tổng kết")
  })

  it("renders FollowButton with handle-based follower count, guest login return_path, pre-launch section, and zero organizer_id leak (DOS/Give#315)", async () => {
    const PRELAUNCH_ID = "44444444-4444-4444-8444-444444444444"
    state.handler = (call) => {
      if (call.target === "rpc:organizer_follower_count_by_handle") return { data: 27 }
      if (call.target === "rpc:list_organizer_public_campaigns") {
        const base = defaultHandler(call) as { data: unknown[] }
        return {
          data: [
            ...base.data,
            {
              id: PRELAUNCH_ID,
              slug: "sap-ra-mat-ban-may",
              type: "give",
              title: "Thư viện Bản Mây (Sắp ra mắt)",
              summary: null,
              goal_amount: 30_000_000,
              ends_at: "2999-12-31T00:00:00Z",
              status: "approved",
              display_options: { progress_bar: true, backers_count: true, time_remaining: true },
              cover_storage_path: null,
              cover_alt: null,
              created_at: "2026-11-12T00:00:00Z",
            },
          ],
        }
      }
      return defaultHandler(call)
    }

    const html = renderToStaticMarkup(
      await OrganizerProfilePage({ params: Promise.resolve({ handle: "quy-ban-may" }) })
    )
    const doc = new Window().document
    doc.body.innerHTML = html

    expect(doc.querySelector('a[href="/auth/login?return_path=%2Fu%2Fquy-ban-may"]')?.textContent).toContain("Theo dõi")
    expect(html).toContain("27 người theo dõi")
    expect(html).toContain("Sắp ra mắt")
    expect(html).toContain("Thư viện Bản Mây (Sắp ra mắt)")
    // Never leaks organizer user_id into HTML or queries organizer_follows / organizer_follower_count(uuid).
    expect(html).not.toContain("11111111-1111-4111-8111-111111111111")
    expect(state.calls.some((c) => c.target === "organizer_follows")).toBe(false)
    expect(state.calls.some((c) => c.target === "rpc:organizer_follower_count")).toBe(false)
    expect(state.calls.some((c) => c.target === "rpc:organizer_follower_count_by_handle")).toBe(true)
    // Excludes pre-launch campaign IDs from both ledger totals and impact report lookups (#314 + #315).
    expect(
      op(
        state.calls.find((c) => c.target === "campaign_impact_reports"),
        "in"
      )
    ).toEqual(["campaign_id", [LIVE_ID, PAST_ID]])
  })

  it("emits safe ProfilePage JSON-LD when siteOrigin() is configured and omits it when unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://give.vn/ignored")
    const htmlWithOrigin = renderToStaticMarkup(
      await OrganizerProfilePage({ params: Promise.resolve({ handle: "quy-ban-may" }) })
    )
    expect(htmlWithOrigin).not.toContain("<script>alert(1)</script>")

    const doc = new Window().document
    doc.body.innerHTML = htmlWithOrigin
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]')
    expect(scripts).toHaveLength(1)
    expect(JSON.parse(scripts[0].textContent ?? "")).toStrictEqual({
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      url: "https://give.vn/u/quy-ban-may",
      dateCreated: "2026-10-01T00:00:00Z",
      mainEntity: {
        "@type": "Organization",
        name: "Quỹ Bản Mây",
        alternateName: "@quy-ban-may",
        url: "https://give.vn/u/quy-ban-may",
        description: "Xây trường cho trẻ em vùng cao.\n<script>alert(1)</script>",
        image: "https://cdn.dos.me/avatars/ban-may.webp",
      },
    })
    // Zero PII in JSON-LD.
    expect(scripts[0].textContent).not.toContain("Công ty TNHH Pháp Lý Bí Mật")
    expect(scripts[0].textContent).not.toContain("0909999888")
    expect(scripts[0].textContent).not.toContain("private@example.vn")

    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "")
    const htmlWithoutOrigin = renderToStaticMarkup(
      await OrganizerProfilePage({ params: Promise.resolve({ handle: "quy-ban-may" }) })
    )
    const noOriginDoc = new Window().document
    noOriginDoc.body.innerHTML = htmlWithoutOrigin
    expect(noOriginDoc.querySelector('script[type="application/ld+json"]')).toBeNull()
  })
})
