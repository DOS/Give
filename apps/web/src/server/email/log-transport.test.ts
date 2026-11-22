import { describe, expect, it, vi } from "vitest"

import { createLogTransport } from "./log-transport"
import type { OutgoingEmail } from "./transport"

function message(to: string): OutgoingEmail {
  return {
    from: "Give <no-reply@give.vn>",
    to,
    subject: "Give đã nhận khoản ủng hộ",
    text: "secret tracking link",
    html: "<p>secret tracking link</p>",
    headers: { "Message-ID": "<outbox-1@give.vn>" },
    idempotencyKey: "donation_received:1",
  }
}

describe("createLogTransport", () => {
  it("mails nobody and logs only the key and a masked recipient", async () => {
    const log = vi.fn()
    const result = await createLogTransport(log).send(message("mai@example.com"))
    expect(result).toEqual({ ok: true, messageId: "log:<outbox-1@give.vn>" })
    expect(log).toHaveBeenCalledTimes(1)
    const line = log.mock.calls[0][0] as string
    expect(line).toContain("donation_received:1")
    expect(line).toContain("m•••@example.com")
    expect(line).not.toContain("mai@")
    expect(line).not.toContain("secret")
  })

  it("fails on purpose for the reserved test domains", async () => {
    const transport = createLogTransport(() => {})
    expect(await transport.send(message("a@retry.invalid"))).toMatchObject({ ok: false, permanent: false })
    expect(await transport.send(message("a@BOUNCE.invalid"))).toMatchObject({ ok: false, permanent: true })
  })
})
