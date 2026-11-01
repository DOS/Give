import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const endIssuerSession = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth/logout", () => ({ endIssuerSession }))

import { POST } from "./route"

function logoutRequest(headers: Record<string, string> = {}) {
  return new NextRequest("https://give.example/auth/logout", {
    method: "POST",
    headers: { cookie: "__Host-give_at=at-1; __Host-give_rt=rt-1", ...headers },
  })
}

describe("POST /auth/logout", () => {
  afterEach(() => {
    endIssuerSession.mockReset()
  })

  it("ends the issuer session with both tokens, then clears the cookies", async () => {
    endIssuerSession.mockResolvedValueOnce("revoked")

    const response = await POST(logoutRequest({ origin: "https://give.example" }))

    expect(endIssuerSession).toHaveBeenCalledWith("https://give.example", { access: "at-1", refresh: "rt-1" })
    expect(response.status).toBe(303)
    expect(response.cookies.get("__Host-give_at")?.value).toBe("")
    expect(response.cookies.get("__Host-give_rt")?.value).toBe("")
    expect(response.cookies.get("__Host-give_rt")?.maxAge).toBe(0)
  })

  it("still clears the cookies when revocation fails", async () => {
    endIssuerSession.mockResolvedValueOnce("failed")

    const response = await POST(logoutRequest())

    expect(response.status).toBe(303)
    expect(response.cookies.get("__Host-give_at")?.value).toBe("")
    expect(response.cookies.get("__Host-give_rt")?.value).toBe("")
  })

  it("still clears the cookies if revocation throws", async () => {
    endIssuerSession.mockRejectedValueOnce(new Error("unexpected"))

    const response = await POST(logoutRequest())

    expect(response.status).toBe(303)
    expect(response.cookies.get("__Host-give_rt")?.value).toBe("")
  })

  it("rejects a request the browser marks as cross-site", async () => {
    const response = await POST(logoutRequest({ "sec-fetch-site": "cross-site" }))

    expect(response.status).toBe(403)
    expect(endIssuerSession).not.toHaveBeenCalled()
  })

  it("rejects a cross-site request without touching the session", async () => {
    const response = await POST(logoutRequest({ origin: "https://evil.example" }))

    expect(response.status).toBe(403)
    expect(endIssuerSession).not.toHaveBeenCalled()
  })
})
