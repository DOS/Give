import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

import { beforeEach, describe, expect, it, vi } from "vitest"

const mailer = vi.hoisted(() => ({
  options: [] as unknown[],
  sendMail: vi.fn(),
}))

vi.mock("nodemailer", () => ({
  default: {
    createTransport: (options: unknown) => {
      mailer.options.push(options)
      return { sendMail: mailer.sendMail }
    },
  },
}))

const { createSmtpTransport, sesMessageId, smtpFailure } = await import("./smtp")

const CONFIG = { host: "email-smtp.ap-southeast-1.amazonaws.com", port: 587, user: "u", pass: "p" }
const EMAIL = {
  from: "Give <no-reply@give.vn>",
  to: "mai@example.com",
  subject: "s",
  text: "t",
  html: "<p>h</p>",
  headers: { "Message-ID": "<outbox-1@give.vn>", "Auto-Submitted": "auto-generated" },
  idempotencyKey: "k",
}

beforeEach(() => {
  mailer.options.length = 0
  mailer.sendMail.mockReset()
})

describe("createSmtpTransport", () => {
  it("talks STARTTLS to SES with timeouts and sends the stable Message-ID", async () => {
    mailer.sendMail.mockResolvedValue({ response: "250 Ok 0100019a-abc", messageId: "<x>", rejected: [] })
    const result = await createSmtpTransport(CONFIG).send(EMAIL)
    expect(result).toEqual({ ok: true, messageId: "0100019a-abc" })
    expect(mailer.options[0]).toMatchObject({ host: CONFIG.host, port: 587, secure: false, requireTLS: true })
    expect(mailer.sendMail.mock.calls[0][0]).toMatchObject({
      to: "mai@example.com",
      messageId: "<outbox-1@give.vn>",
      headers: { "Auto-Submitted": "auto-generated" },
      disableUrlAccess: true,
      disableFileAccess: true,
    })
  })

  it("reports a refused recipient as permanent", async () => {
    mailer.sendMail.mockResolvedValue({ response: "250 Ok", rejected: ["mai@example.com"] })
    expect(await createSmtpTransport(CONFIG).send(EMAIL)).toMatchObject({ ok: false, permanent: true })
  })

  it("turns a thrown error into a result", async () => {
    mailer.sendMail.mockRejectedValue({ responseCode: 454, response: "454 Throttling failure" })
    expect(await createSmtpTransport(CONFIG).send(EMAIL)).toEqual({
      ok: false,
      permanent: false,
      error: "SMTP 454: 454 Throttling failure",
    })
  })
})

describe("smtpFailure", () => {
  it.each([
    [550, true],
    [553, true],
    [535, false],
    [554, false],
    [421, false],
  ])("SMTP %i is permanent: %s", (code, permanent) => {
    expect(smtpFailure({ responseCode: code, response: `${code} x` }).permanent).toBe(permanent)
  })

  it("names connection errors without a reply code", () => {
    expect(smtpFailure({ code: "ETIMEDOUT", message: "Connection\ntimeout" })).toEqual({
      ok: false,
      permanent: false,
      error: "ETIMEDOUT: Connection timeout",
    })
  })
})

describe("sesMessageId", () => {
  it("keeps SES's id, else nodemailer's", () => {
    expect(sesMessageId("250 Ok 0100-abc", "<x>")).toBe("0100-abc")
    expect(sesMessageId("250 2.0.0 OK", "<x>")).toBe("<x>")
    expect(sesMessageId(undefined, undefined)).toBeNull()
  })
})

describe("nodemailer stays on the server", () => {
  const src = fileURLToPath(new URL("../..", import.meta.url))
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) return files(path)
      return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
    })

  it("is imported only by server/email/smtp.ts, which is server-only", () => {
    const importers = files(src).filter((f) => /from\s+["']nodemailer["']/.test(readFileSync(f, "utf8")))
    expect(importers.map((f) => relative(src, f))).toEqual([join("server", "email", "smtp.ts")])
    expect(readFileSync(importers[0], "utf8")).toMatch(/^import "server-only"/)
  })

  it("every module that reaches the SMTP transport is server-only", () => {
    const reach = ["smtp.ts", "provider.ts", "outbox.ts", "log-transport.ts", "transport.ts"]
    for (const name of reach) {
      expect(readFileSync(join(src, "server", "email", name), "utf8"), name).toMatch(/^import "server-only"/)
    }
    const clientFiles = files(src).filter((f) => /^["']use client["']/.test(readFileSync(f, "utf8")))
    for (const f of clientFiles) {
      expect(readFileSync(f, "utf8"), relative(src, f)).not.toMatch(/server\/email|nodemailer/)
    }
  })
})
