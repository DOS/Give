import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const state = vi.hoisted(() => ({
  handler: (() => undefined) as Handler,
  calls: [] as Call[],
  dbAsArgs: [] as unknown[][],
  dbServiceCalled: false,
  throwOnDbAs: false,
}))

vi.mock("@/lib/supabase", () => ({
  dbAs: (...args: unknown[]) => {
    state.dbAsArgs.push(args)
    if (state.throwOnDbAs) throw new Error("env missing")
    return fakeDb((call) => state.handler(call), state.calls)
  },
  dbService: () => {
    state.dbServiceCalled = true
    throw new Error("dbService must never be called from sitemap.ts")
  },
}))

const { default: sitemap, dynamic } = await import("./sitemap")

beforeEach(() => {
  state.calls.length = 0
  state.dbAsArgs.length = 0
  state.dbServiceCalled = false
  state.throwOnDbAs = false
  state.handler = () => ({ data: [] })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("sitemap.ts", () => {
  it("exports dynamic = 'force-dynamic'", () => {
    expect(dynamic).toBe("force-dynamic")
  })

  it("returns [] without querying DB when siteOrigin() is unset or invalid", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "")
    expect(await sitemap()).toStrictEqual([])
    expect(state.dbAsArgs).toHaveLength(0)

    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "not-a-url")
    expect(await sitemap()).toStrictEqual([])
    expect(state.dbAsArgs).toHaveLength(0)
  })

  it("uses anonymous dbAs() only, enforces query constraints, filters private/unlisted/past-prelaunch rows, omits /statement on prelaunch, and deduplicates valid organizer handles", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://give.vn/ignored")

    state.handler = (call) => {
      if (call.target === "campaigns") {
        return {
          data: [
            {
              id: "c-live",
              slug: "xay-truong-ban-may",
              status: "live",
              prelaunch_public: false,
              starts_at: "2026-01-01T00:00:00Z",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-11-22T10:00:00Z",
            },
            {
              id: "c-ended",
              slug: "tu-sach-vung-cao",
              status: "succeeded",
              prelaunch_public: false,
              starts_at: "2026-01-01T00:00:00Z",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-11-15T08:00:00Z",
            },
            {
              id: "c-prelaunch-public",
              slug: "sap-mo-ban-may",
              status: "approved",
              prelaunch_public: true,
              starts_at: "2999-12-01T00:00:00Z",
              created_at: "2026-11-10T00:00:00Z",
              updated_at: "2026-11-20T09:00:00Z",
            },
            // Must be excluded even if returned by a buggy/over-permissive mock or RLS failure:
            {
              id: "c-draft",
              slug: "nhap-bi-mat",
              status: "draft",
              prelaunch_public: false,
              starts_at: null,
              created_at: "2026-11-01T00:00:00Z",
              updated_at: "2026-11-20T00:00:00Z",
            },
            {
              id: "c-suspended",
              slug: "tam-dung",
              status: "suspended",
              prelaunch_public: false,
              starts_at: null,
              created_at: "2026-11-01T00:00:00Z",
              updated_at: "2026-11-20T00:00:00Z",
            },
            {
              id: "c-approved-private",
              slug: "da-duyet-chua-cong-khai",
              status: "approved",
              prelaunch_public: false,
              starts_at: "2999-12-01T00:00:00Z",
              created_at: "2026-11-01T00:00:00Z",
              updated_at: "2026-11-20T00:00:00Z",
            },
            {
              id: "c-approved-past",
              slug: "da-qua-ngay-mo",
              status: "approved",
              prelaunch_public: true,
              starts_at: "2020-01-01T00:00:00Z",
              created_at: "2020-01-01T00:00:00Z",
              updated_at: "2020-01-01T00:00:00Z",
            },
            {
              id: "c-bad-slug",
              slug: "bad--slug",
              status: "live",
              prelaunch_public: false,
              starts_at: "2026-01-01T00:00:00Z",
              created_at: "2026-11-01T00:00:00Z",
              updated_at: "2026-11-20T00:00:00Z",
            },
          ],
        }
      }
      if (call.target === "rpc:public_campaign_organizers") {
        return {
          data: [
            {
              campaign_id: "c-live",
              display_name: "Quỹ Bản Mây",
              kind: "organization",
              verification_status: "verified",
              handle: "quy-ban-may",
            },
            {
              campaign_id: "c-ended",
              display_name: "Quỹ Bản Mây",
              kind: "organization",
              verification_status: "verified",
              handle: "quy-ban-may",
            },
            {
              campaign_id: "c-prelaunch-public",
              display_name: "Reserved or Invalid",
              kind: "individual",
              verification_status: "verified",
              handle: "admin",
            },
          ],
        }
      }
      return undefined
    }

    const entries = await sitemap()

    // Anonymous dbAs() only, zero dbService(), zero direct reads of `organizers`.
    expect(state.dbAsArgs).toEqual([[]])
    expect(state.dbServiceCalled).toBe(false)
    expect(state.calls.some((c) => c.target === "organizers")).toBe(false)

    // Exact campaigns query shape.
    const campaignsCall = state.calls.find((c) => c.target === "campaigns")
    expect(campaignsCall?.ops).toEqual([
      ["select", "id, slug, status, prelaunch_public, starts_at, created_at, updated_at"],
      ["in", "status", ["live", "settling", "succeeded", "failed", "closed", "approved"]],
      ["order", "updated_at", { ascending: false }],
      ["order", "id", { ascending: true }],
      ["range", 0, 999],
    ])

    // Only publicly visible campaign IDs are passed to public_campaign_organizers.
    const orgCall = state.calls.find((c) => c.target === "rpc:public_campaign_organizers")
    expect(op(orgCall, "args")).toEqual([{ p_campaign_ids: ["c-live", "c-ended", "c-prelaunch-public"] }])

    expect(entries).toStrictEqual([
      { url: "https://give.vn/", changeFrequency: "hourly", priority: 1 },
      { url: "https://give.vn/campaigns", changeFrequency: "hourly", priority: 0.9 },
      {
        url: "https://give.vn/campaigns/xay-truong-ban-may",
        lastModified: new Date("2026-11-22T10:00:00Z"),
        changeFrequency: "hourly",
        priority: 0.8,
      },
      {
        url: "https://give.vn/campaigns/tu-sach-vung-cao",
        lastModified: new Date("2026-11-15T08:00:00Z"),
        changeFrequency: "daily",
        priority: 0.6,
      },
      {
        url: "https://give.vn/campaigns/sap-mo-ban-may",
        lastModified: new Date("2026-11-20T09:00:00Z"),
        changeFrequency: "daily",
        priority: 0.6,
      },
      // Statements only for public live/ended campaigns (never prelaunch).
      {
        url: "https://give.vn/campaigns/xay-truong-ban-may/statement",
        lastModified: new Date("2026-11-22T10:00:00Z"),
        changeFrequency: "hourly",
        priority: 0.5,
      },
      {
        url: "https://give.vn/campaigns/tu-sach-vung-cao/statement",
        lastModified: new Date("2026-11-15T08:00:00Z"),
        changeFrequency: "weekly",
        priority: 0.5,
      },
      // Unique navigable organizer handles only (reserved 'admin' excluded).
      {
        url: "https://give.vn/u/quy-ban-may",
        lastModified: new Date("2026-11-22T10:00:00Z"),
        changeFrequency: "weekly",
        priority: 0.7,
      },
    ])
  })

  it("chunks public_campaign_organizers RPC calls in batches of <= 100 IDs", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://give.vn")

    const campaigns = Array.from({ length: 205 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      slug: `chien-dich-${i}`,
      status: "live",
      prelaunch_public: false,
      starts_at: "2026-01-01T00:00:00Z",
      created_at: "2026-11-01T00:00:00Z",
      updated_at: "2026-11-22T00:00:00Z",
    }))

    state.handler = (call) => {
      if (call.target === "campaigns") return { data: campaigns }
      if (call.target === "rpc:public_campaign_organizers") {
        const ids = ((op(call, "args")?.[0] as { p_campaign_ids?: string[] })?.p_campaign_ids ?? []) as string[]
        return {
          data: ids.map((id, idx) => ({
            campaign_id: id,
            display_name: "Org",
            kind: "organization",
            verification_status: "verified",
            handle: idx === 0 ? "shared-org" : null,
          })),
        }
      }
      return undefined
    }

    const entries = await sitemap()

    const rpcCalls = state.calls.filter((c) => c.target === "rpc:public_campaign_organizers")
    expect(rpcCalls).toHaveLength(3)
    const batchSizes = rpcCalls.map(
      (c) => ((op(c, "args")?.[0] as { p_campaign_ids?: string[] })?.p_campaign_ids ?? []).length
    )
    expect(batchSizes).toEqual([100, 100, 5])
    expect(entries.filter((e) => e.url.includes("/u/"))).toHaveLength(1)
  })

  it("fails open to static entries on campaign query error or exception without throwing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://give.vn")
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    state.handler = (call) => {
      if (call.target === "campaigns") return { error: { code: "57014", message: "statement timeout" } }
      return undefined
    }

    const onDbError = await sitemap()
    expect(onDbError).toStrictEqual([
      { url: "https://give.vn/", changeFrequency: "hourly", priority: 1 },
      { url: "https://give.vn/campaigns", changeFrequency: "hourly", priority: 0.9 },
    ])
    expect(warnSpy).toHaveBeenCalledTimes(1)

    state.throwOnDbAs = true
    const onThrow = await sitemap()
    expect(onThrow).toStrictEqual([
      { url: "https://give.vn/", changeFrequency: "hourly", priority: 1 },
      { url: "https://give.vn/campaigns", changeFrequency: "hourly", priority: 0.9 },
    ])
    expect(warnSpy).toHaveBeenCalledTimes(2)
  })

  it("still emits campaign and statement URLs when public_campaign_organizers fails", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://give.vn")
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    state.handler = (call) => {
      if (call.target === "campaigns") {
        return {
          data: [
            {
              id: "c-live",
              slug: "chien-dich-1",
              status: "live",
              prelaunch_public: false,
              starts_at: "2026-01-01T00:00:00Z",
              created_at: "2026-11-01T00:00:00Z",
              updated_at: "2026-11-22T00:00:00Z",
            },
          ],
        }
      }
      if (call.target === "rpc:public_campaign_organizers") {
        return { error: { code: "PGRST202", message: "rpc unavailable" } }
      }
      return undefined
    }

    const entries = await sitemap()
    expect(entries.map((e) => e.url)).toEqual([
      "https://give.vn/",
      "https://give.vn/campaigns",
      "https://give.vn/campaigns/chien-dich-1",
      "https://give.vn/campaigns/chien-dich-1/statement",
    ])
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it("paginates campaigns in 1000-row .range() pages beyond PostgREST's 1000-row cap up to 5000 rows", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://give.vn")

    const allCampaigns = Array.from({ length: 1250 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      slug: `chien-dich-${i}`,
      status: "live",
      prelaunch_public: false,
      starts_at: "2026-01-01T00:00:00Z",
      created_at: "2026-11-01T00:00:00Z",
      updated_at: "2026-11-22T00:00:00Z",
    }))

    state.handler = (call) => {
      if (call.target === "campaigns") {
        const rangeArgs = op(call, "range") as [number, number] | undefined
        const [from, to] = rangeArgs ?? [0, 999]
        return { data: allCampaigns.slice(from, to + 1) }
      }
      if (call.target === "rpc:public_campaign_organizers") return { data: [] }
      return undefined
    }

    const entries = await sitemap()

    const campaignCalls = state.calls.filter((c) => c.target === "campaigns")
    expect(campaignCalls.map((c) => op(c, "range"))).toEqual([
      [0, 999],
      [1000, 1999],
    ])
    // 2 static + 1250 campaign URLs + 1250 statement URLs
    expect(entries).toHaveLength(2 + 1250 + 1250)
  })
})
