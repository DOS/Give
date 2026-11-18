import { beforeEach, describe, expect, it, vi } from "vitest"

import { PUBLIC_COVER_CACHE } from "@/lib/cover-route"
import { dbAs, dbService } from "@/lib/supabase"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const MEDIA_ID = "33333333-3333-4333-8333-333333333333"
const SEGMENTS = ["campaigns", CAMPAIGN, `${MEDIA_ID}.webp`]
const PATH = SEGMENTS.join("/")

const state = vi.hoisted(() => ({
  anonHandler: (() => undefined) as Handler,
  serviceHandler: (() => undefined) as Handler,
  anonCalls: [] as Call[],
  serviceCalls: [] as Call[],
}))

vi.mock("@/lib/supabase", () => ({
  MEDIA_BUCKET: "give-media",
  dbAs: vi.fn(() => fakeDb((call) => state.anonHandler(call), state.anonCalls)),
  dbService: vi.fn(() => fakeDb((call) => state.serviceHandler(call), state.serviceCalls)),
}))

const { GET } = await import("./route")

beforeEach(() => {
  vi.clearAllMocks()
  state.anonCalls.length = 0
  state.serviceCalls.length = 0
  state.anonHandler = () => undefined
  state.serviceHandler = (call) =>
    op(call, "download") ? { data: new Blob([new Uint8Array([9, 8, 7])], { type: "image/webp" }) } : undefined
})

describe("GET /media/public/[...path]", () => {
  it("looks up the active cover as anon and serves it with public cache, CSP, nosniff and no X-Robots-Tag", async () => {
    state.anonHandler = (call) =>
      call.target === "campaign_media"
        ? { data: [{ id: MEDIA_ID, campaign: [{ cover_media_id: MEDIA_ID }] }] }
        : undefined

    const response = await GET(new Request(`http://localhost/media/public/${PATH}`), {
      params: Promise.resolve({ path: SEGMENTS }),
    })

    expect(response.status).toBe(200)
    expect(dbAs).toHaveBeenCalledExactlyOnceWith()
    expect(dbService).toHaveBeenCalledTimes(1)
    expect(response.headers.get("Content-Type")).toBe("image/webp")
    expect(response.headers.get("Cache-Control")).toBe(PUBLIC_COVER_CACHE)
    expect(response.headers.get("Content-Security-Policy")).toBe("default-src 'none'")
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
    expect(response.headers.get("X-Robots-Tag")).toBeNull()
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([9, 8, 7]))
    expect(state.serviceCalls).toEqual([{ target: "storage:give-media", ops: [["download", PATH]] }])
  })

  it("refuses a replaced draft cover or unpublished campaign without opening the service-role client", async () => {
    state.anonHandler = () => ({ data: [{ id: MEDIA_ID, campaign: [{ cover_media_id: "newer-cover" }] }] })

    const response = await GET(new Request(`http://localhost/media/public/${PATH}`), {
      params: Promise.resolve({ path: SEGMENTS }),
    })

    expect(response.status).toBe(404)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(dbService).not.toHaveBeenCalled()
    expect(state.serviceCalls).toEqual([])
  })

  it("refuses malformed paths without querying the database or Storage", async () => {
    const response = await GET(new Request("http://localhost/media/public/../secret.webp"), {
      params: Promise.resolve({ path: ["..", "secret.webp"] }),
    })

    expect(response.status).toBe(404)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(state.anonCalls).toEqual([])
    expect(dbService).not.toHaveBeenCalled()
  })

  it("returns 502 when the anon visibility lookup fails", async () => {
    state.anonHandler = () => ({ error: { code: "08006", message: "connection failure" } })

    const response = await GET(new Request(`http://localhost/media/public/${PATH}`), {
      params: Promise.resolve({ path: SEGMENTS }),
    })

    expect(response.status).toBe(502)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(dbService).not.toHaveBeenCalled()
  })
})
