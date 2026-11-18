import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const SECRET = "0123456789abcdef0123"

const state = vi.hoisted(() => ({
  settings: { ok: false, missing: ["SMTP_USER"] } as unknown,
  run: vi.fn(),
  db: { name: "service" },
}))

vi.mock("@/lib/supabase", () => ({ dbService: () => state.db }))
vi.mock("@/server/email/provider", () => ({ emailSettingsFromEnv: () => state.settings }))
vi.mock("@/server/email/outbox", () => ({ sendDueEmails: state.run }))

const { GET } = await import("./route")

function request(authorization?: string) {
  const headers: Record<string, string> = {}
  if (authorization !== undefined) headers.authorization = authorization
  return new NextRequest("http://localhost/api/cron/send-outbox", { headers })
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET)
  state.run.mockReset()
  state.settings = { ok: false, missing: ["SMTP_USER", "SMTP_PASS"] }
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("GET /api/cron/send-outbox", () => {
  it("refuses a request without the cron secret", async () => {
    const response = await GET(request(`Bearer ${SECRET}x`))
    expect(response.status).toBe(401)
    expect(state.run).not.toHaveBeenCalled()
  })

  it("claims nothing while email is not configured, so queued emails keep their attempts", async () => {
    const response = await GET(request(`Bearer ${SECRET}`))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: "email_not_configured", missing: ["SMTP_USER", "SMTP_PASS"] })
    expect(state.run).not.toHaveBeenCalled()
  })

  it("runs the sender with the configured transport and reports the counts", async () => {
    const transport = { send: vi.fn() }
    const options = { origin: "https://give.vn", from: "Give <no-reply@give.vn>" }
    state.settings = { ok: true, transport, options }
    state.run.mockResolvedValue({ claimed: 2, sent: 1, retrying: 1, dead: 0, stale: 0 })
    const response = await GET(request(`Bearer ${SECRET}`))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ claimed: 2, sent: 1, retrying: 1, dead: 0, stale: 0 })
    expect(state.run).toHaveBeenCalledWith(state.db, transport, options)
  })

  it("answers 500 when the run fails", async () => {
    state.settings = { ok: true, transport: { send: vi.fn() }, options: { origin: "https://give.vn", from: "x@y.z" } }
    state.run.mockRejectedValue({ code: "42501", message: "denied" })
    const response = await GET(request(`Bearer ${SECRET}`))
    expect(response.status).toBe(500)
  })
})
