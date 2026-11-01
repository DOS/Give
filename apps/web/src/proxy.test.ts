import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { proxy } from "./proxy"

const ISSUER = "https://issuer.example/auth/v1"

/** A request carrying only a refresh token, so the proxy must refresh. */
function pageRequest(cookie = "__Host-give_rt=rt-1") {
  return new NextRequest("https://give.example/campaigns", { headers: { cookie } })
}

describe("proxy session refresh", () => {
  const fetchMock = vi.fn<typeof fetch>()
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

  beforeEach(() => {
    vi.stubEnv("OIDC_ISSUER", ISSUER)
    vi.stubEnv("OIDC_CLIENT_ID", "give")
    vi.stubEnv("OIDC_CLIENT_SECRET", "client-secret")
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "")
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    fetchMock.mockReset()
    warn.mockClear()
  })

  function loggedText(): string {
    return JSON.stringify(warn.mock.calls)
  }

  function expectCookiesKept(response: Awaited<ReturnType<typeof proxy>>) {
    expect(response.cookies.getAll()).toEqual([])
  }

  function expectCookiesCleared(response: Awaited<ReturnType<typeof proxy>>) {
    expect(response.cookies.get("__Host-give_at")?.value).toBe("")
    expect(response.cookies.get("__Host-give_at")?.maxAge).toBe(0)
    expect(response.cookies.get("__Host-give_rt")?.value).toBe("")
    expect(response.cookies.get("__Host-give_rt")?.maxAge).toBe(0)
  }

  it("does nothing without a refresh token", async () => {
    const response = await proxy(pageRequest(""))

    expect(fetchMock).not.toHaveBeenCalled()
    expectCookiesKept(response)
  })

  it("rotates both tokens with a bounded call that never follows redirects", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ access_token: "at-2", refresh_token: "rt-2", expires_in: 3600, token_type: "bearer" })
    )

    const response = await proxy(pageRequest())

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${ISSUER}/oauth/token`)
    expect(init?.redirect).toBe("error")
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(response.cookies.get("__Host-give_at")?.value).toBe("at-2")
    expect(response.cookies.get("__Host-give_rt")?.value).toBe("rt-2")
  })

  it("ends the session when the issuer answers invalid_grant", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "invalid_grant", error_description: "expired" }, { status: 400 })
    )

    const response = await proxy(pageRequest())

    expectCookiesCleared(response)
    expect(warn).not.toHaveBeenCalled()
  })

  it("ends the session on Supabase's own dead-token code", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { code: 400, error_code: "refresh_token_not_found" },
        { status: 400, headers: { "x-sb-error-code": "refresh_token_not_found" } }
      )
    )

    expectCookiesCleared(await proxy(pageRequest()))
  })

  it("keeps the cookies and logs without tokens when the client is rejected", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "invalid_client" }, { status: 401 }))

    const response = await proxy(pageRequest())

    expectCookiesKept(response)
    expect(warn).toHaveBeenCalledWith("auth.refresh.failed", {
      status: 401,
      code: "invalid_client",
      error: "TokenRequestError",
    })
    expect(loggedText()).not.toContain("rt-1")
    expect(loggedText()).not.toContain("client-secret")
  })

  it("keeps the cookies on a 400 that names no error code", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "rt-1 is not valid" }, { status: 400 }))

    const response = await proxy(pageRequest())

    expectCookiesKept(response)
    expect(warn).toHaveBeenCalledWith("auth.refresh.failed", {
      status: 400,
      code: undefined,
      error: "TokenRequestError",
    })
    expect(loggedText()).not.toContain("rt-1")
  })

  it("keeps the cookies when the issuer fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response("bad gateway", { status: 502 }))

    expectCookiesKept(await proxy(pageRequest()))
    expect(warn).toHaveBeenCalledWith("auth.refresh.failed", {
      status: 502,
      code: undefined,
      error: "TokenRequestError",
    })
  })

  it("gives up after 5 s and keeps the cookies when the issuer stalls", async () => {
    const deadline = new AbortController()
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValueOnce(deadline.signal)
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)))
    )

    const pending = proxy(pageRequest())
    deadline.abort(new DOMException("The operation timed out.", "TimeoutError"))
    const response = await pending

    expect(timeout).toHaveBeenCalledWith(5000)
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(deadline.signal)
    expectCookiesKept(response)
    expect(warn).toHaveBeenCalledWith("auth.refresh.failed", {
      status: undefined,
      code: undefined,
      error: "TimeoutError",
    })
    timeout.mockRestore()
  })

  it("keeps the cookies on a network error without logging its message", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed for rt-1"))

    expectCookiesKept(await proxy(pageRequest()))
    expect(warn).toHaveBeenCalledWith("auth.refresh.failed", {
      status: undefined,
      code: undefined,
      error: "TypeError",
    })
    expect(loggedText()).not.toContain("rt-1")
  })
})
