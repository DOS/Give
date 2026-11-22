import { describe, expect, it, vi } from "vitest"

import type { OutgoingEmail } from "./transport"

const smtp = vi.hoisted(() => ({
  configs: [] as unknown[],
  send: vi.fn(async (_email: unknown) => ({ ok: true, messageId: "ses" })),
}))

vi.mock("./smtp", () => ({
  createSmtpTransport: (config: unknown) => {
    smtp.configs.push(config)
    return { send: smtp.send }
  },
}))

const { emailDelivery, emailLinkOrigin, emailSettingsFromEnv, isSenderAddress, usesProductionDatabase } =
  await import("./provider")

const CREDS = { SMTP_USER: "AKIAEXAMPLE", SMTP_PASS: "not-a-real-password" }
const BETA = { VERCEL_ENV: "preview", EMAIL_LINK_ORIGIN: "https://beta.give.vn/some/path" }
const PROD = { VERCEL_ENV: "production" }

function message(to: string): OutgoingEmail {
  return { from: "x@give.vn", to, subject: "s", text: "t", html: "h", headers: {}, idempotencyKey: "k" }
}

describe("emailDelivery", () => {
  it("sends real mail by default in Production only", () => {
    expect(emailDelivery(PROD)).toBe("smtp")
    expect(emailDelivery({ VERCEL_ENV: "preview" })).toBe("log")
    expect(emailDelivery({})).toBe("log")
    expect(emailDelivery({ VERCEL_ENV: "preview", EMAIL_DELIVERY: "SMTP" })).toBe("smtp")
    expect(emailDelivery({ ...PROD, EMAIL_DELIVERY: "log" })).toBe("log")
  })
})

describe("emailSettingsFromEnv", () => {
  it("mails nobody on beta by default, with Give's own sender and no Reply-To", async () => {
    smtp.configs.length = 0
    smtp.send.mockClear()
    const settings = emailSettingsFromEnv({ ...BETA, ...CREDS })
    expect(settings).toMatchObject({
      ok: true,
      delivery: "log",
      options: { origin: "https://beta.give.vn", from: "Give <no-reply@give.vn>" },
    })
    if (!settings.ok) return
    expect(settings.options).not.toHaveProperty("replyTo")
    expect(smtp.configs).toHaveLength(0)
    expect(await settings.transport.send(message("mai@example.com"))).toMatchObject({ ok: true })
    expect(smtp.send).not.toHaveBeenCalled()
  })

  it("outside Production, real sending reaches the allowlist only", async () => {
    smtp.send.mockClear()
    const settings = emailSettingsFromEnv({
      ...BETA,
      ...CREDS,
      EMAIL_DELIVERY: "smtp",
      EMAIL_ALLOWLIST: " qa@give.vn, @team.give.vn ",
    })
    expect(settings.ok).toBe(true)
    if (!settings.ok) return
    await settings.transport.send(message("QA@give.vn"))
    await settings.transport.send(message("lan@team.give.vn"))
    await settings.transport.send(message("mai@example.com"))
    expect(smtp.send.mock.calls.map(([m]) => (m as OutgoingEmail).to)).toEqual(["QA@give.vn", "lan@team.give.vn"])
  })

  it("in Production sends through SES with the default endpoint", async () => {
    smtp.configs.length = 0
    smtp.send.mockClear()
    const settings = emailSettingsFromEnv({ ...PROD, ...CREDS })
    expect(settings).toMatchObject({ ok: true, delivery: "smtp", options: { origin: "https://give.vn" } })
    expect(smtp.configs).toEqual([
      { host: "email-smtp.ap-southeast-1.amazonaws.com", port: 587, user: "AKIAEXAMPLE", pass: "not-a-real-password" },
    ])
    if (settings.ok) await settings.transport.send(message("mai@example.com"))
    expect(smtp.send).toHaveBeenCalledTimes(1)
  })

  it("in Production without credentials is off, so emails wait instead of being marked sent", () => {
    expect(emailSettingsFromEnv(PROD)).toEqual({ ok: false, missing: ["SMTP_USER", "SMTP_PASS"] })
  })

  it("in Production refuses the log transport, which would mark every real email sent", () => {
    expect(emailSettingsFromEnv({ ...PROD, ...CREDS, EMAIL_DELIVERY: "log" })).toEqual({
      ok: false,
      missing: ["EMAIL_DELIVERY_LOG_IN_PRODUCTION"],
    })
  })

  it("refuses a sender with a line break, a bad port, and a missing link origin", () => {
    expect(emailSettingsFromEnv({ ...BETA, EMAIL_FROM: "Give <a@give.vn>\r\nBcc: x@y.z" })).toMatchObject({
      ok: false,
      missing: ["EMAIL_FROM"],
    })
    expect(emailSettingsFromEnv({ ...PROD, ...CREDS, SMTP_PORT: "smtp" })).toMatchObject({
      ok: false,
      missing: ["SMTP_PORT"],
    })
    expect(emailSettingsFromEnv({ VERCEL_ENV: "preview" })).toEqual({ ok: false, missing: ["EMAIL_LINK_ORIGIN"] })
    expect(isSenderAddress("Give")).toBe(false)
    expect(isSenderAddress("no-reply@give.vn")).toBe(true)
  })
})

describe("emailLinkOrigin", () => {
  it("prefers EMAIL_LINK_ORIGIN, then the site URL, then give.vn in Production only", () => {
    expect(emailLinkOrigin({ EMAIL_LINK_ORIGIN: "https://beta.give.vn", NEXT_PUBLIC_SITE_URL: "https://x.test" })).toBe(
      "https://beta.give.vn"
    )
    expect(emailLinkOrigin({ NEXT_PUBLIC_SITE_URL: "https://give.vn/" })).toBe("https://give.vn")
    expect(emailLinkOrigin(PROD)).toBe("https://give.vn")
    expect(emailLinkOrigin({ VERCEL_ENV: "preview" })).toBeNull()
  })

  it("in Production refuses a link origin that is not https", () => {
    expect(emailLinkOrigin({ ...PROD, EMAIL_LINK_ORIGIN: "http://give.vn" })).toBeNull()
    expect(emailLinkOrigin({ ...PROD, NEXT_PUBLIC_SITE_URL: "http://give.vn" })).toBeNull()
    expect(emailLinkOrigin({ ...PROD, EMAIL_LINK_ORIGIN: "https://give.vn/x" })).toBe("https://give.vn")
    expect(emailLinkOrigin({ VERCEL_ENV: "preview", EMAIL_LINK_ORIGIN: "http://localhost:3000" })).toBe(
      "http://localhost:3000"
    )
    expect(emailSettingsFromEnv({ ...PROD, ...CREDS, NEXT_PUBLIC_SITE_URL: "http://give.vn" })).toEqual({
      ok: false,
      missing: ["EMAIL_LINK_ORIGIN"],
    })
  })
})

describe("a deployment outside Production on the Production database", () => {
  it("claims nothing, so it never marks real people's emails sent", () => {
    const prodDb = { NEXT_PUBLIC_SUPABASE_URL: "https://gulptwduchsjcsbndmua.supabase.co" }
    expect(emailSettingsFromEnv({ ...BETA, ...prodDb })).toEqual({
      ok: false,
      missing: ["NON_PRODUCTION_DEPLOYMENT_ON_PRODUCTION_DATABASE"],
    })
    expect(emailSettingsFromEnv({ ...prodDb, EMAIL_LINK_ORIGIN: "http://localhost:3000" })).toMatchObject({ ok: false })
    expect(emailSettingsFromEnv({ ...PROD, ...CREDS, ...prodDb })).toMatchObject({ ok: true })
    expect(
      emailSettingsFromEnv({ ...BETA, NEXT_PUBLIC_SUPABASE_URL: "https://oyajkbadsykigtfrpdpg.supabase.co" })
    ).toMatchObject({
      ok: true,
    })
  })

  it("knows the Production database by its vanity domain too", () => {
    for (const url of [
      "https://dos.supabase.co",
      "https://dos.supabase.co.",
      "https://DOS.supabase.co/",
      "https://gulptwduchsjcsbndmua.supabase.co",
    ]) {
      expect(usesProductionDatabase({ NEXT_PUBLIC_SUPABASE_URL: url }), url).toBe(true)
    }
    expect(usesProductionDatabase({ NEXT_PUBLIC_SUPABASE_URL: "https://oyajkbadsykigtfrpdpg.supabase.co" })).toBe(false)
    expect(usesProductionDatabase({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" })).toBe(false)
    expect(emailSettingsFromEnv({ ...BETA, NEXT_PUBLIC_SUPABASE_URL: "https://dos.supabase.co" })).toMatchObject({
      ok: false,
      missing: ["NON_PRODUCTION_DEPLOYMENT_ON_PRODUCTION_DATABASE"],
    })
  })

  it("catches the Production database via JWT ref even behind an unlisted custom domain (DOS/Give#273)", () => {
    const fakeJwt = (payload: unknown) =>
      `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`
    const prodServiceJwt = fakeJwt({ iss: "supabase", ref: "gulptwduchsjcsbndmua", role: "service_role" })
    const prodAnonJwt = fakeJwt({ iss: "supabase", ref: "GULPTWDUCHSJCSBNDMUA", role: "anon" })
    const betaServiceJwt = fakeJwt({ iss: "supabase", ref: "oyajkbadsykigtfrpdpg", role: "service_role" })

    expect(
      usesProductionDatabase({
        NEXT_PUBLIC_SUPABASE_URL: "https://db.custom-dos.example",
        SUPABASE_SERVICE_ROLE_KEY: prodServiceJwt,
      })
    ).toBe(true)
    expect(
      usesProductionDatabase({
        NEXT_PUBLIC_SUPABASE_URL: "https://db.custom-dos.example",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: prodAnonJwt,
      })
    ).toBe(true)
    expect(usesProductionDatabase({ SUPABASE_SERVICE_ROLE_KEY: prodServiceJwt })).toBe(true)
    expect(
      emailSettingsFromEnv({
        ...BETA,
        NEXT_PUBLIC_SUPABASE_URL: "https://db.custom-dos.example",
        SUPABASE_SERVICE_ROLE_KEY: prodServiceJwt,
      })
    ).toMatchObject({
      ok: false,
      missing: ["NON_PRODUCTION_DEPLOYMENT_ON_PRODUCTION_DATABASE"],
    })

    // Non-production JWT and opaque sb_secret_ keys do not trigger false positives.
    expect(
      usesProductionDatabase({
        NEXT_PUBLIC_SUPABASE_URL: "https://db.custom-beta.example",
        SUPABASE_SERVICE_ROLE_KEY: betaServiceJwt,
      })
    ).toBe(false)
    expect(
      usesProductionDatabase({
        NEXT_PUBLIC_SUPABASE_URL: "https://db.custom-beta.example",
        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_not_a_jwt",
      })
    ).toBe(false)
    expect(
      usesProductionDatabase({
        NEXT_PUBLIC_SUPABASE_URL: "https://db.custom-beta.example",
        SUPABASE_SERVICE_ROLE_KEY: "a.not-valid-json.c",
      })
    ).toBe(false)
  })
})
