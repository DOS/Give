import { describe, expect, it } from "vitest"

import { fakeDb, op, type Call } from "@/test/fake-db"

import { evidenceResponse } from "./evidence-route"

const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const TX = "33333333-3333-4333-8333-333333333333"
const OBJECT = "44444444-4444-4444-8444-444444444444"
const SEGMENTS = [CAMPAIGN, TX, `${OBJECT}.webp`]
const PATH = `disbursements/${CAMPAIGN}/${TX}/${OBJECT}.webp`

function service(calls: Call[]) {
  return fakeDb(() => ({ data: new Blob([new Uint8Array([1])]) }), calls)
}

describe("evidenceResponse", () => {
  it("serves the image when the viewer may read its evidence row", async () => {
    const viewerCalls: Call[] = []
    const serviceCalls: Call[] = []
    const viewer = fakeDb(() => ({ data: [{ id: "e1" }] }), viewerCalls)
    const res = await evidenceResponse(SEGMENTS, viewer as never, service(serviceCalls) as never, "give-media")
    expect(res.status).toBe(200)
    expect(res.headers.get("Cache-Control")).toBe("private, no-store")
    expect(res.headers.get("Content-Type")).toBe("image/webp")
    expect(viewerCalls[0].target).toBe("disbursement_evidence")
    expect(op(viewerCalls[0], "eq")).toEqual(["storage_path", PATH])
    expect(op(serviceCalls[0], "download")).toEqual([PATH])
  })

  it("is a 404 without a session, without access or for a malformed path", async () => {
    const serviceCalls: Call[] = []
    const none = fakeDb(() => ({ data: [] }))
    expect((await evidenceResponse(SEGMENTS, null, service(serviceCalls) as never, "b")).status).toBe(404)
    expect((await evidenceResponse(SEGMENTS, none as never, service(serviceCalls) as never, "b")).status).toBe(404)
    const any = fakeDb(() => ({ data: [{ id: "e1" }] }))
    expect(
      (await evidenceResponse(["..", "campaigns", `${OBJECT}.webp`], any as never, service(serviceCalls) as never, "b"))
        .status
    ).toBe(404)
    expect(serviceCalls).toHaveLength(0)
  })

  it("treats a rejected token as no access and other errors as 502", async () => {
    const expired = fakeDb(() => ({ error: { code: "PGRST301", message: "JWT expired" } }))
    const broken = fakeDb(() => ({ error: { code: "XX000", message: "boom" } }))
    expect((await evidenceResponse(SEGMENTS, expired as never, service([]) as never, "b")).status).toBe(404)
    expect((await evidenceResponse(SEGMENTS, broken as never, service([]) as never, "b")).status).toBe(502)
  })
})
