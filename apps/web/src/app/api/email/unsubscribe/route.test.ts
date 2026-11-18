import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Result } from "@/test/fake-db"

const TOKEN = "77777777-7777-4777-8777-777777777777"

const state = vi.hoisted(() => ({ result: {} as Result, calls: [] as Call[] }))

vi.mock("@/lib/supabase", () => ({
  dbService: () => fakeDb(() => state.result, state.calls),
}))

const { GET, POST } = await import("./route")

function post(query: string, body: Record<string, string> | null) {
  const form = body ? new URLSearchParams(body).toString() : undefined
  return new NextRequest(`https://give.vn/api/email/unsubscribe${query}`, {
    method: "POST",
    headers: body ? { "content-type": "application/x-www-form-urlencoded" } : {},
    body: form,
  })
}

beforeEach(() => {
  state.result = { data: true }
  state.calls.length = 0
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("GET /api/email/unsubscribe", () => {
  it("only shows the confirmation page, so prefetching unsubscribes nobody", async () => {
    const response = GET(new NextRequest(`https://give.vn/api/email/unsubscribe?t=${TOKEN}`))
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe(`https://give.vn/email/unsubscribe?t=${TOKEN}`)
    expect(state.calls).toHaveLength(0)
  })

  it("drops a malformed token", () => {
    const response = GET(new NextRequest("https://give.vn/api/email/unsubscribe?t=abc"))
    expect(response.headers.get("location")).toBe("https://give.vn/email/unsubscribe")
  })
})

describe("POST /api/email/unsubscribe", () => {
  it("answers a mail client's one-click unsubscribe (RFC 8058)", async () => {
    const response = await POST(post(`?t=${TOKEN}`, { "List-Unsubscribe": "One-Click" }))
    expect(response.status).toBe(200)
    expect(state.calls.map((c) => c.target)).toEqual(["rpc:unsubscribe_email"])
    expect(op(state.calls[0], "args")).toEqual([{ p_token: TOKEN }])
  })

  it("sends the page's form back to the page with the result", async () => {
    const response = await POST(post("", { t: TOKEN }))
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe("https://give.vn/email/unsubscribe?result=done")
  })

  it("reports an unknown or transactional token as invalid", async () => {
    state.result = { data: false }
    const page = await POST(post("", { t: TOKEN }))
    expect(page.headers.get("location")).toBe("https://give.vn/email/unsubscribe?result=invalid")
    const oneClick = await POST(post(`?t=${TOKEN}`, { "List-Unsubscribe": "One-Click" }))
    expect(oneClick.status).toBe(404)
  })

  it("never calls the database with a malformed token", async () => {
    const response = await POST(post("?t=nope", { "List-Unsubscribe": "One-Click" }))
    expect(response.status).toBe(400)
    expect(state.calls).toHaveLength(0)
  })

  it("asks to try again when the database fails", async () => {
    state.result = { error: { code: "57014", message: "timeout" } }
    const page = await POST(post("", { t: TOKEN }))
    expect(page.headers.get("location")).toBe(`https://give.vn/email/unsubscribe?t=${TOKEN}&result=error`)
    const oneClick = await POST(post(`?t=${TOKEN}`, { "List-Unsubscribe": "One-Click" }))
    expect(oneClick.status).toBe(503)
  })
})
