import { describe, expect, it, vi } from "vitest"

const created = vi.hoisted(() => [] as unknown[])

vi.mock("./smtp", () => ({
  createSmtpTransport: (config: unknown) => {
    created.push(config)
    return { send: vi.fn() }
  },
}))

const { emailLinkOrigin, emailSettingsFromEnv, isSenderAddress } = await import("./provider")

const COMPLETE = {
  SMTP_USER: "AKIAEXAMPLE",
  SMTP_PASS: "not-a-real-password",
  EMAIL_FROM: "Give <no-reply@give.vn>",
  EMAIL_LINK_ORIGIN: "https://beta.give.vn/some/path",
}

describe("emailSettingsFromEnv", () => {
  it("is off and names what is missing", () => {
    expect(emailSettingsFromEnv({})).toEqual({
      ok: false,
      missing: ["SMTP_USER", "SMTP_PASS", "EMAIL_FROM", "EMAIL_LINK_ORIGIN"],
    })
  })

  it("uses DOS.Me's SES SMTP endpoint by default", () => {
    created.length = 0
    const settings = emailSettingsFromEnv(COMPLETE)
    expect(settings.ok).toBe(true)
    if (!settings.ok) return
    expect(settings.options).toEqual({
      origin: "https://beta.give.vn",
      from: "Give <no-reply@give.vn>",
      replyTo: "hi@give.vn",
    })
    expect(created).toEqual([
      { host: "email-smtp.ap-southeast-1.amazonaws.com", port: 587, user: "AKIAEXAMPLE", pass: "not-a-real-password" },
    ])
  })

  it("refuses a sender with a line break or without an address", () => {
    expect(emailSettingsFromEnv({ ...COMPLETE, EMAIL_FROM: "Give <a@give.vn>\r\nBcc: x@y.z" })).toMatchObject({
      ok: false,
      missing: ["EMAIL_FROM"],
    })
    expect(isSenderAddress("Give")).toBe(false)
    expect(isSenderAddress("no-reply@give.vn")).toBe(true)
  })

  it("refuses a bad port", () => {
    expect(emailSettingsFromEnv({ ...COMPLETE, SMTP_PORT: "smtp" })).toMatchObject({
      ok: false,
      missing: ["SMTP_PORT"],
    })
  })
})

describe("emailLinkOrigin", () => {
  it("prefers EMAIL_LINK_ORIGIN, then the site URL, then give.vn in Production only", () => {
    expect(emailLinkOrigin({ EMAIL_LINK_ORIGIN: "https://beta.give.vn", NEXT_PUBLIC_SITE_URL: "https://x.test" })).toBe(
      "https://beta.give.vn"
    )
    expect(emailLinkOrigin({ NEXT_PUBLIC_SITE_URL: "https://give.vn/" })).toBe("https://give.vn")
    expect(emailLinkOrigin({ VERCEL_ENV: "production" })).toBe("https://give.vn")
    expect(emailLinkOrigin({ VERCEL_ENV: "preview" })).toBeNull()
  })
})
