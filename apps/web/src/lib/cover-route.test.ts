import { beforeEach, describe, expect, it } from "vitest"

import type { Db } from "@/lib/campaigns"
import { coverResponse, PRIVATE_COVER_CACHE, PUBLIC_COVER_CACHE } from "@/lib/cover-route"
import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const SEGMENTS = ["campaigns", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333.webp"]
const PATH = SEGMENTS.join("/")

let viewerCalls: Call[]
let serviceCalls: Call[]

function dbs(viewerHandler: Handler) {
  const viewer = fakeDb(viewerHandler, viewerCalls) as unknown as Db
  const service = fakeDb(
    (call) =>
      op(call, "download") ? { data: new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" }) } : undefined,
    serviceCalls
  ) as unknown as Db
  return { viewer, service }
}

beforeEach(() => {
  viewerCalls = []
  serviceCalls = []
})

describe("coverResponse", () => {
  it("serves a cover the viewer may see, with the given cache policy", async () => {
    const { viewer, service } = dbs((call) => (call.target === "campaign_media" ? { data: [{ id: "m" }] } : undefined))
    const response = await coverResponse(SEGMENTS, viewer, service, "give-media", PUBLIC_COVER_CACHE)
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("image/webp")
    expect(response.headers.get("Cache-Control")).toBe(PUBLIC_COVER_CACHE)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
    expect(op(viewerCalls[0], "eq")).toEqual(["storage_path", PATH])
    expect(serviceCalls).toEqual([{ target: "storage:give-media", ops: [["download", PATH]] }])
  })

  it("refuses a cover RLS hides from the viewer (a draft for anon or another user) without fetching it", async () => {
    const { viewer, service } = dbs(() => ({ data: [] }))
    const response = await coverResponse(SEGMENTS, viewer, service, "give-media", PRIVATE_COVER_CACHE)
    expect(response.status).toBe(404)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(serviceCalls).toEqual([])
  })

  it("refuses without a signed-in viewer on the private route", async () => {
    const { service } = dbs(() => undefined)
    const response = await coverResponse(SEGMENTS, null, service, "give-media", PRIVATE_COVER_CACHE)
    expect(response.status).toBe(404)
    expect(serviceCalls).toEqual([])
  })

  it("refuses keys that are not media paths before any query", async () => {
    const { viewer, service } = dbs(() => ({ data: [{ id: "m" }] }))
    const response = await coverResponse(["..", "secret.webp"], viewer, service, "give-media", PUBLIC_COVER_CACHE)
    expect(response.status).toBe(404)
    expect(viewerCalls).toEqual([])
    expect(serviceCalls).toEqual([])
  })

  it("treats an expired token as no access and other errors as a failure", async () => {
    const expired = dbs(() => ({ error: { code: "PGRST303", message: "JWT expired" } }))
    expect(
      (await coverResponse(SEGMENTS, expired.viewer, expired.service, "give-media", PRIVATE_COVER_CACHE)).status
    ).toBe(404)
    const broken = dbs(() => ({ error: { code: "08006", message: "connection failure" } }))
    expect(
      (await coverResponse(SEGMENTS, broken.viewer, broken.service, "give-media", PRIVATE_COVER_CACHE)).status
    ).toBe(502)
    expect(serviceCalls).toEqual([])
  })
})
