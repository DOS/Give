import { EventEmitter } from "node:events"
import { readdirSync, readFileSync, statSync } from "node:fs"
import type { Socket } from "node:net"
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

const { createSmtpTransport, envelopeWatch, sentMessageId, smtpFailure, smtpProvider, socketTracker } =
  await import("./smtp")

const CONFIG = { host: "smtp-relay.brevo.com", port: 587, user: "u", pass: "p" }
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
  it("talks STARTTLS to Brevo with timeouts and sends the stable Message-ID", async () => {
    mailer.sendMail.mockResolvedValue({ response: "250 2.0.0 OK", messageId: "<outbox-1@give.vn>", rejected: [] })
    const result = await createSmtpTransport(CONFIG).send(EMAIL)
    expect(result).toEqual({ ok: true, messageId: "<outbox-1@give.vn>" })
    expect(mailer.options[0]).toMatchObject({ host: CONFIG.host, port: 587, secure: false, requireTLS: true })
    expect((mailer.options[0] as { getSocket?: unknown }).getSocket).toBeTypeOf("function")
    expect(mailer.options[0]).toMatchObject({ transactionLog: true })
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

describe("createSmtpTransport against Brevo", () => {
  it("holds a send Brevo refuses for the whole account", async () => {
    mailer.sendMail.mockRejectedValue({
      code: "EENVELOPE",
      command: "MAIL FROM",
      responseCode: 450,
      response: "450 Your sending platform is currently disabled",
    })
    expect(await createSmtpTransport(CONFIG).send(EMAIL)).toMatchObject({ ok: false, hold: true })
    expect(await createSmtpTransport({ ...CONFIG, host: "smtp.example.net" }).send(EMAIL)).not.toHaveProperty("hold")
  })
})

describe("smtpFailure", () => {
  it.each([
    ["EENVELOPE", "RCPT TO", 550, true],
    ["EENVELOPE", "RCPT TO", 553, true],
    ["EENVELOPE", "RCPT TO", 452, false],
    ["EENVELOPE", "MAIL FROM", 550, false],
    ["EENVELOPE", "DATA", 554, false],
    ["EMESSAGE", "DATA", 554, false],
    [undefined, undefined, 550, false],
    ["EAUTH", "AUTH PLAIN", 535, false],
    [undefined, undefined, 421, false],
  ])("%s at %s with %i is permanent: %s", (code, command, responseCode, permanent) => {
    expect(smtpFailure({ code, command, responseCode, response: `${responseCode} x` }).permanent).toBe(permanent)
  })

  it("calls a connection lost before MAIL FROM a plain failure: nothing can have been delivered", () => {
    expect(smtpFailure({ code: "ECONNECTION", command: "CONN" }, false).outcomeUnknown).toBeUndefined()
    expect(smtpFailure({ code: "ETIMEDOUT", command: "CONN" }, false).outcomeUnknown).toBeUndefined()
  })

  it("watches for MAIL FROM in the transaction log and keeps nothing else", () => {
    const watch = envelopeWatch()
    watch.logger.debug({ tnx: "client" }, "EHLO host")
    watch.logger.debug({ tnx: "client" }, "AUTH PLAIN AHVzZXIAcGFzcw==")
    expect(watch.started).toBe(false)
    watch.logger.debug({ tnx: "server" }, "MAIL FROM:<x@y.z>")
    expect(watch.started).toBe(false)
    watch.logger.debug({ tnx: "client" }, "MAIL FROM:<no-reply@give.vn>")
    expect(watch.started).toBe(true)
    watch.reset()
    expect(watch.started).toBe(false)
  })

  it("calls a connection lost mid-conversation outcome unknown, but not a refused connect", () => {
    expect(smtpFailure({ code: "ECONNECTION", command: "CONN", message: "Connection closed" })).toMatchObject({
      permanent: false,
      outcomeUnknown: true,
    })
    expect(smtpFailure({ code: "ETIMEDOUT", command: "CONN", message: "Timeout" }).outcomeUnknown).toBe(true)
    expect(smtpFailure({ code: "ECONNREFUSED", message: "connect ECONNREFUSED" }).outcomeUnknown).toBeUndefined()
    expect(
      smtpFailure({ code: "EMESSAGE", command: "DATA", responseCode: 554, response: "554 rejected" }).outcomeUnknown
    ).toBeUndefined()
  })

  it("holds Brevo's documented account-wide 450 refusals, and only Brevo's", () => {
    const disabled = {
      responseCode: 450,
      command: "MAIL FROM",
      response: "450 Your sending platform is currently disabled",
    }
    const inactive = { responseCode: 450, response: "450 Your SMTP account is not yet activated. Please contact us" }
    expect(smtpFailure(disabled, true, "brevo")).toEqual({
      ok: false,
      permanent: false,
      hold: true,
      error: "ACCOUNT: SMTP 450: 450 Your sending platform is currently disabled",
    })
    expect(smtpFailure(inactive, false, "brevo")).toMatchObject({ hold: true })
    expect(smtpFailure(disabled, true, "other")).not.toHaveProperty("hold")
    expect(
      smtpFailure(
        { ...disabled, responseCode: 550, response: "550 Your sending platform is currently disabled" },
        true,
        "brevo"
      )
    ).not.toHaveProperty("hold")
    expect(smtpFailure({ responseCode: 450, response: "450 mailbox busy" }, true, "brevo")).not.toHaveProperty("hold")
    expect(
      smtpFailure({ code: "EAUTH", responseCode: 535, response: "535 5.7.8 Authentication failed" }, false, "brevo")
    ).toEqual({
      ok: false,
      permanent: false,
      error: "SMTP 535: 535 5.7.8 Authentication failed",
    })
  })

  it("knows Brevo by its hosts", () => {
    expect(smtpProvider("smtp-relay.brevo.com")).toBe("brevo")
    expect(smtpProvider(" SMTP-RELAY.BREVO.COM. ")).toBe("brevo")
    expect(smtpProvider("email-smtp.ap-southeast-1.amazonaws.com")).toBe("other")
    expect(smtpProvider("smtp-relay.sendinblue.com")).toBe("brevo")
    expect(smtpProvider("brevo.com.example.net")).toBe("other")
    expect(smtpProvider("notbrevo.com")).toBe("other")
  })

  it("names connection errors without a reply code", () => {
    expect(smtpFailure({ code: "ETIMEDOUT", message: "Connection\ntimeout" })).toEqual({
      ok: false,
      permanent: false,
      error: "ETIMEDOUT: Connection timeout",
    })
  })
})

describe("sentMessageId", () => {
  it("keeps the Message-ID the message was sent with", () => {
    expect(sentMessageId("<x>")).toBe("<x>")
    expect(sentMessageId("")).toBeNull()
    expect(sentMessageId(undefined)).toBeNull()
  })
})

class FakeSocket extends EventEmitter {
  destroyed = false
  reset = false
  destroy() {
    this.destroyed = true
    this.emit("close")
    return this
  }
  resetAndDestroy() {
    this.reset = true
    return this.destroy()
  }
}

describe("socketTracker", () => {
  const tracked = () => {
    const sockets: FakeSocket[] = []
    const tracker = socketTracker(CONFIG, () => {
      const socket = new FakeSocket()
      sockets.push(socket)
      return socket as unknown as Socket
    })
    return { tracker, sockets }
  }

  it("hands nodemailer the socket once connected, and abort cuts it off mid-send", () => {
    const { tracker, sockets } = tracked()
    const callback = vi.fn()
    tracker.getSocket({}, callback)
    sockets[0].emit("connect")
    expect(callback).toHaveBeenCalledWith(null, { connection: sockets[0] })
    expect(tracker.openCount).toBe(1)
    tracker.abort()
    expect(sockets[0].reset).toBe(true)
    expect(tracker.openCount).toBe(0)
  })

  it("abort fails a connection still opening instead of leaving it to its timer", () => {
    const { tracker, sockets } = tracked()
    const callback = vi.fn()
    tracker.getSocket({}, callback)
    tracker.abort()
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ code: "ECONNECTION" }))
    expect(sockets[0].destroyed).toBe(true)
    sockets[0].emit("connect")
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it("fails a connection that errors or does not open in time", () => {
    vi.useFakeTimers()
    try {
      const { tracker, sockets } = tracked()
      const failed = vi.fn()
      tracker.getSocket({}, failed)
      sockets[0].emit("error", new Error("ECONNREFUSED"))
      expect(failed).toHaveBeenCalledWith(expect.objectContaining({ message: "ECONNREFUSED" }))
      expect(sockets[0].destroyed).toBe(true)

      const slow = vi.fn()
      tracker.getSocket({}, slow)
      vi.advanceTimersByTime(10_000)
      expect(slow).toHaveBeenCalledWith(expect.objectContaining({ code: "ETIMEDOUT" }))
      expect(sockets[1].destroyed).toBe(true)
      sockets[1].emit("connect")
      expect(slow).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

/** Any static, dynamic or require import of nodemailer or a subpath of it. */
const NODEMAILER_IMPORT = /(from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)["'`]nodemailer(\/[^"'`]*)?["'`]/

/** A "use client" directive, allowing comments and blank lines before it. */
function isClientModule(source: string): boolean {
  const body = source.replace(/^(\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, "")
  return /^["']use client["']/.test(body)
}

describe("the import guard itself", () => {
  it.each([
    'import nodemailer from "nodemailer"',
    "const m = await import('nodemailer')",
    'import SMTPPool from "nodemailer/lib/smtp-pool"',
    'const m = require ( "nodemailer" )',
    'import "nodemailer"',
    "const m = await import(`nodemailer`)",
  ])("catches %s", (line) => {
    expect(NODEMAILER_IMPORT.test(line)).toBe(true)
  })

  it("finds a use client directive after leading comments", () => {
    expect(isClientModule('// a note\n/* block\n */\n\n"use client"\n')).toBe(true)
    expect(isClientModule('import x from "y"\n"use client"')).toBe(false)
  })
})

describe("nodemailer stays on the server", () => {
  const src = fileURLToPath(new URL("../..", import.meta.url))
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) return files(path)
      return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name) && !/\.test\.[cm]?[jt]sx?$/.test(name) ? [path] : []
    })

  it("is imported only by server/email/smtp.ts, which is server-only", () => {
    const importers = files(src).filter((f) => NODEMAILER_IMPORT.test(readFileSync(f, "utf8")))
    expect(importers.map((f) => relative(src, f))).toEqual([join("server", "email", "smtp.ts")])
    expect(readFileSync(importers[0], "utf8")).toMatch(/^import "server-only"/)
  })

  it("every module that reaches the SMTP transport is server-only", () => {
    const reach = ["smtp.ts", "provider.ts", "outbox.ts", "log-transport.ts", "transport.ts"]
    for (const name of reach) {
      expect(readFileSync(join(src, "server", "email", name), "utf8"), name).toMatch(/^import "server-only"/)
    }
    const clientFiles = files(src).filter((f) => isClientModule(readFileSync(f, "utf8")))
    expect(clientFiles.length).toBeGreaterThan(0)
    for (const f of clientFiles) {
      expect(readFileSync(f, "utf8"), relative(src, f)).not.toMatch(/server\/email|nodemailer/)
    }
  })
})
