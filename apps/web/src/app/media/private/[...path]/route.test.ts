import { beforeEach, describe, expect, it, vi } from "vitest"

import { getSession } from "@/lib/auth/session"
import { PRIVATE_COVER_CACHE } from "@/lib/cover-route"
import { dbAs, dbService } from "@/lib/supabase"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const MEDIA_ID = "33333333-3333-4333-8333-333333333333"
const SEGMENTS = ["campaigns", CAMPAIGN, `${MEDIA_ID}.webp`]
const PATH = SEGMENTS.join("/")

const state = vi.hoisted(() => ({
  userHandler: (() => undefined) as Handler,
  serviceHandler: (() => undefined) as Handler,
  userCalls: [] as Call[],
  serviceCalls: [] as Call[],
}))

vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }))
vi.mock("@/lib/supabase", () => ({
  MEDIA_BUCKET: "give-media",
  dbAs: vi.fn(() => fakeDb((call) => state.userHandler(call), state.userCalls)),
  dbService: vi.fn(() => fakeDb((call) => state.serviceHandler(call), state.serviceCalls)),
}))

const { GET } = await import("./route")

beforeEach(() => {
  vi.clearAllMocks()
  state.userCalls.length = 0
  state.serviceCalls.length = 0
  state.userHandler = () => undefined
  state.serviceHandler = (call) =>
    op(call, "download") ? { data: new Blob([new Uint8Array([4, 5, 6])], { type: "image/webp" }) } : undefined
  vi.mocked(getSession).mockResolvedValue({ user: { id: USER, email: null, name: null }, accessToken: "user-jwt" })
})

describe("GET /media/private/[...path]", () => {
  it("refuses signed-out requests without opening any database client", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null)

    const response = await GET(new Request(`http://localhost/media/private/${PATH}`), {
      params: Promise.resolve({ path: SEGMENTS }),
    })

    expect(response.status).toBe(404)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(dbAs).not.toHaveBeenCalled()
    expect(dbService).not.toHaveBeenCalled()
  })

  it("queries with the caller's token and serves an active cover with no-store, nosniff and noindex headers", async () => {
    state.userHandler = (call) =>
      call.target === "campaign_media"
        ? { data: [{ id: MEDIA_ID, campaign: [{ cover_media_id: MEDIA_ID }] }] }
        : undefined

    const response = await GET(new Request(`http://localhost/media/private/${PATH}`), {
      params: Promise.resolve({ path: SEGMENTS }),
    })

    expect(response.status).toBe(200)
    expect(dbAs).toHaveBeenCalledExactlyOnceWith("user-jwt")
    expect(dbService).toHaveBeenCalledTimes(1)
    expect(response.headers.get("Content-Type")).toBe("image/webp")
    expect(response.headers.get("Cache-Control")).toBe(PRIVATE_COVER_CACHE)
    expect(response.headers.get("Content-Security-Policy")).toBe("default-src 'none'")
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, noimageindex")
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([4, 5, 6]))
    expect(state.serviceCalls).toEqual([{ target: "storage:give-media", ops: [["download", PATH]] }])
  })

  it("refuses a replaced draft cover or RLS-hidden campaign without opening the service-role client", async () => {
    state.userHandler = () => ({ data: [{ id: MEDIA_ID, campaign: [{ cover_media_id: "newer-cover" }] }] })

    const response = await GET(new Request(`http://localhost/media/private/${PATH}`), {
      params: Promise.resolve({ path: SEGMENTS }),
    })

    expect(response.status).toBe(404)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(dbService).not.toHaveBeenCalled()
  })

  it("treats an expired JWT as 404 and malformed paths as 404 without touching Storage", async () => {
    state.userHandler = () => ({ error: { code: "PGRST301", message: "JWT expired" } })
    const expired = await GET(new Request(`http://localhost/media/private/${PATH}`), {
      params: Promise.resolve({ path: SEGMENTS }),
    })
    expect(expired.status).toBe(404)

    state.userCalls.length = 0
    const badPath = await GET(new Request("http://localhost/media/private/bad"), {
      params: Promise.resolve({ path: ["bad"] }),
    })
    expect(badPath.status).toBe(404)
    expect(state.userCalls).toEqual([])
    expect(dbService).not.toHaveBeenCalled()
  })
})
