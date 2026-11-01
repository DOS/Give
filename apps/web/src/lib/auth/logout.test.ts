import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { endIssuerSession } from "./logout"

const ISSUER = "https://issuer.example/auth/v1"
const SID = "6f1c2a0e-6b4b-4d3a-9a51-2f0f6f3b9a10"

/** An unsigned JWT; endIssuerSession only decodes, the issuer verifies. */
function jwt(claims: Record<string, unknown>): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url")
  return `${part({ alg: "none", typ: "JWT" })}.${part(claims)}.`
}

const now = () => Math.floor(Date.now() / 1000)
const freshAccess = jwt({ sub: "u1", session_id: SID, exp: now() + 3600 })
const expiredAccess = jwt({ sub: "u1", session_id: SID, exp: now() - 10 })

describe("endIssuerSession", () => {
  const fetchMock = vi.fn<typeof fetch>()
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

  beforeEach(() => {
    vi.stubEnv("OIDC_ISSUER", `${ISSUER}/`)
    vi.stubEnv("OIDC_CLIENT_ID", "give")
    vi.stubEnv("OIDC_CLIENT_SECRET", "client-secret")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key")
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

  it("logs out the current session at the issuer with the access token", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(endIssuerSession("https://give.example", { access: freshAccess, refresh: "rt-1" })).resolves.toBe(
      "revoked"
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${ISSUER}/logout?scope=local`)
    expect(init?.method).toBe("POST")
    expect(init?.redirect).toBe("error")
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(init?.headers).toEqual({ Authorization: `Bearer ${freshAccess}`, apikey: "anon-key" })
    expect(warn).not.toHaveBeenCalled()
  })

  it("refreshes an expired access token first, then logs out with the new one", async () => {
    const newAccess = jwt({ sub: "u1", session_id: SID, exp: now() + 3600 })
    fetchMock
      .mockResolvedValueOnce(
        Response.json({ access_token: newAccess, refresh_token: "rt-2", expires_in: 3600, token_type: "bearer" })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(endIssuerSession("https://give.example", { access: expiredAccess, refresh: "rt-1" })).resolves.toBe(
      "revoked"
    )

    expect(fetchMock.mock.calls[0][0]).toBe(`${ISSUER}/oauth/token`)
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain("grant_type=refresh_token")
    // One deadline covers both calls.
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(fetchMock.mock.calls[1][1]?.signal)
    expect(fetchMock.mock.calls[1][0]).toBe(`${ISSUER}/logout?scope=local`)
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ Authorization: `Bearer ${newAccess}` })
  })

  it("treats a session the issuer no longer has as revoked", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ code: 403, error_code: "session_not_found" }, { status: 403 }))

    await expect(endIssuerSession("https://give.example", { access: freshAccess })).resolves.toBe("revoked")
  })

  it("skips when the issuer says the refresh token is already dead", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ code: 400, error_code: "refresh_token_not_found" }, { status: 400 })
    )

    await expect(endIssuerSession("https://give.example", { refresh: "rt-dead" })).resolves.toBe("skipped")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(warn).not.toHaveBeenCalled()
  })

  it("reads the dead-token code from Supabase's error header too", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ code: "session_expired" }, { status: 400, headers: { "x-sb-error-code": "session_expired" } })
    )

    await expect(endIssuerSession("https://give.example", { refresh: "rt-dead" })).resolves.toBe("skipped")
  })

  it("never logs an error code that is not plain snake_case", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "rt-1 is invalid" }, { status: 400 }))

    await expect(endIssuerSession("https://give.example", { refresh: "rt-1" })).resolves.toBe("failed")
    expect(warn).toHaveBeenCalledWith("auth.logout.revoke_failed", {
      reason: "refresh_400_unknown",
      error: "TokenRequestError",
    })
    expect(loggedText()).not.toContain("rt-1")
  })

  it("logs a refresh rejected for another reason, such as bad client credentials", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "invalid_client" }, { status: 400 }))

    await expect(endIssuerSession("https://give.example", { refresh: "rt-1" })).resolves.toBe("failed")
    expect(warn).toHaveBeenCalledWith("auth.logout.revoke_failed", {
      reason: "refresh_400_invalid_client",
      error: "TokenRequestError",
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("logs a refresh the issuer could not serve", async () => {
    fetchMock.mockResolvedValueOnce(new Response("bad gateway", { status: 502 }))

    await expect(endIssuerSession("https://give.example", { refresh: "rt-1" })).resolves.toBe("failed")
    expect(warn).toHaveBeenCalledWith("auth.logout.revoke_failed", {
      reason: "refresh_502_unknown",
      error: "TokenRequestError",
    })
    expect(loggedText()).not.toContain("rt-1")
  })

  it("gives up when the issuer stalls", async () => {
    const deadline = new AbortController()
    vi.spyOn(AbortSignal, "timeout").mockReturnValueOnce(deadline.signal)
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)))
    )

    const result = endIssuerSession("https://give.example", { refresh: "rt-1" })
    deadline.abort(new DOMException("The operation timed out.", "TimeoutError"))

    await expect(result).resolves.toBe("failed")
    expect(warn).toHaveBeenCalledWith("auth.logout.revoke_failed", { reason: "refresh", error: "TimeoutError" })
  })

  it("fails when the access token expired and there is no refresh token", async () => {
    await expect(endIssuerSession("https://give.example", { access: expiredAccess })).resolves.toBe("failed")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("skips when there is no session cookie at all", async () => {
    await expect(endIssuerSession("https://give.example", {})).resolves.toBe("skipped")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("reports a failed logout without logging any token", async () => {
    fetchMock.mockResolvedValueOnce(new Response("upstream down", { status: 500 }))

    await expect(endIssuerSession("https://give.example", { access: freshAccess, refresh: "rt-1" })).resolves.toBe(
      "failed"
    )

    expect(warn).toHaveBeenCalledWith("auth.logout.revoke_failed", { reason: "status_500", error: undefined })
    expect(loggedText()).not.toContain(freshAccess)
    expect(loggedText()).not.toContain("rt-1")
  })

  it("reports a network error without throwing or logging the token", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError(`fetch failed for ${freshAccess}`))

    await expect(endIssuerSession("https://give.example", { access: freshAccess })).resolves.toBe("failed")

    expect(warn).toHaveBeenCalledWith("auth.logout.revoke_failed", { reason: "network", error: "TypeError" })
    expect(loggedText()).not.toContain(freshAccess)
  })

  it("never sends a token without a session_id, which would sign the user out everywhere", async () => {
    const noSession = jwt({ sub: "u1", exp: now() + 3600 })

    await expect(endIssuerSession("https://give.example", { access: noSession })).resolves.toBe("failed")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("fails without calling out when the anon key is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")

    await expect(endIssuerSession("https://give.example", { access: freshAccess })).resolves.toBe("failed")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
