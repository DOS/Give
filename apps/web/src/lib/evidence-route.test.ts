import { describe, expect, it } from "vitest"

import { fakeDb, op, type Call } from "@/test/fake-db"

import { evidenceResponse, PUBLIC_EVIDENCE_CACHE, publicEvidenceResponse } from "./evidence-route"

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

describe("publicEvidenceResponse", () => {
  it("serves a public image without a session, cacheable briefly and kept out of search", async () => {
    const anonCalls: Call[] = []
    const serviceCalls: Call[] = []
    const anon = fakeDb(() => ({ data: [{ id: "e1" }] }), anonCalls)
    const res = await publicEvidenceResponse(SEGMENTS, anon as never, service(serviceCalls) as never, "give-media")
    expect(res.status).toBe(200)
    expect(res.headers.get("Cache-Control")).toBe(PUBLIC_EVIDENCE_CACHE)
    expect(res.headers.get("Set-Cookie")).toBeNull()
    expect(res.headers.get("X-Robots-Tag")).toContain("noindex")
    expect(res.headers.get("Content-Security-Policy")).toBe("default-src 'none'")
    expect(anonCalls[0].target).toBe("public_disbursement_evidence")
    expect(op(anonCalls[0], "eq")).toEqual(["storage_path", PATH])
    expect(op(serviceCalls[0], "download")).toEqual([PATH])
  })

  it("is a 404 for a hidden image or one of a campaign that is no longer public (not in the view)", async () => {
    const serviceCalls: Call[] = []
    const res = await publicEvidenceResponse(
      SEGMENTS,
      fakeDb(() => ({ data: [] })) as never,
      service(serviceCalls) as never,
      "give-media"
    )
    expect(res.status).toBe(404)
    expect(res.headers.get("Cache-Control")).toBe("no-store")
    expect(serviceCalls).toHaveLength(0)
  })

  it("is a 404 for a malformed path without any lookup, and a 502 when the view fails", async () => {
    const anonCalls: Call[] = []
    const any = fakeDb(() => ({ data: [{ id: "e1" }] }), anonCalls)
    expect((await publicEvidenceResponse(["..", "x.webp"], any as never, service([]) as never, "b")).status).toBe(404)
    expect(anonCalls).toHaveLength(0)
    const broken = fakeDb(() => ({ error: { code: "XX000", message: "boom" } }))
    expect((await publicEvidenceResponse(SEGMENTS, broken as never, service([]) as never, "b")).status).toBe(502)
  })

  it("is a 404 when the object is missing from storage", async () => {
    const anon = fakeDb(() => ({ data: [{ id: "e1" }] }))
    const missing = fakeDb(() => ({ error: { message: "Object not found" } }))
    expect((await publicEvidenceResponse(SEGMENTS, anon as never, missing as never, "b")).status).toBe(404)
  })
})
