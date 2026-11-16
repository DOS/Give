import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { submitUnusableAccount } from "@/lib/campaign-account"
import { GIVE_CONTACT_EMAIL, GIVE_CONTACT_HREF, VIA_CONTACT_EMAIL } from "@/lib/contact"
import { dbErrorMessage, SUBMIT_MESSAGES } from "@/lib/errors"
import { OWN_CONTRIBUTION_MESSAGES } from "@/lib/own-contribution"
import { OWNER_MISMATCH_FOR_ORGANIZER } from "@/lib/reconciliation"
import { returnedUnexplainedText } from "@/lib/statement"
import { uploadErrorMessage } from "@/lib/statement-import"

import { ContactText } from "./ContactText"

const LINK = '<a href="mailto:help@dos.me" class="font-medium underline">help@dos.me</a>'
const html = (text: string) => renderToStaticMarkup(createElement(ContactText, { text }))

describe("Give's contact address (DOS/Give#205)", () => {
  it("is help@dos.me, in one place", () => {
    expect(GIVE_CONTACT_EMAIL).toBe("help@dos.me")
    expect(GIVE_CONTACT_HREF).toBe("mailto:help@dos.me")
    expect(VIA_CONTACT_EMAIL).toBe("qua email help@dos.me")
  })
})

describe("ContactText", () => {
  it("turns the address into a mailto link and keeps the rest of the sentence", () => {
    expect(html(`Hãy liên hệ đội ngũ Give ${VIA_CONTACT_EMAIL}.`)).toBe(`Hãy liên hệ đội ngũ Give qua email ${LINK}.`)
  })

  it("links every occurrence, including one at the start or end", () => {
    expect(html(`${GIVE_CONTACT_EMAIL} và ${GIVE_CONTACT_EMAIL}`)).toBe(`${LINK} và ${LINK}`)
  })

  it("leaves a message without the address as escaped text", () => {
    expect(html("Lỗi <b> & “x”")).toBe("Lỗi &lt;b&gt; &amp; “x”")
  })
})

describe("messages that ask the reader to contact Give name the address", () => {
  const messages: Record<string, string> = {
    "own contribution refund (organizer)": OWN_CONTRIBUTION_MESSAGES.refund,
    "own contribution match (organizer)": OWN_CONTRIBUTION_MESSAGES.matchAsOrganizer,
    "submit with a used, unusable account and no swap": submitUnusableAccount("Lý do.", true, false),
    "release refused": dbErrorMessage({ message: "GIVE_BINDING_NOT_RELEASABLE" }),
    "account owner mismatch": dbErrorMessage({ message: "GIVE_ACCOUNT_OWNER_MISMATCH" }),
    "submit without an account": SUBMIT_MESSAGES.GIVE_CAMPAIGN_NO_RECEIVING_ACCOUNT,
    "owner mismatch notice (organizer)": OWNER_MISMATCH_FOR_ORGANIZER,
    "statement format changed": uploadErrorMessage("STATEMENT_PARSER_FLAGS_CHANGED"),
    "statement format changed (database)": uploadErrorMessage("GIVE_IMPORT_PARSER_FLAGS_CHANGED"),
    "statement dismissed by finance": uploadErrorMessage("GIVE_INBOUND_EVENT_DISMISSED"),
    "statement day too large": uploadErrorMessage("STATEMENT_TOO_LARGE"),
    "returned transfer": returnedUnexplainedText({ amount: 1 }, null, "2026-11-12T03:00:00Z"),
  }

  it.each(Object.entries(messages))("%s", (_, message) => {
    expect(message).toContain(VIA_CONTACT_EMAIL)
    expect(html(message)).toContain(LINK)
  })
})

describe("staff-facing refusals keep pointing at another staff member", () => {
  it("does not send finance or admins to the public support address", () => {
    for (const message of [
      OWN_CONTRIBUTION_MESSAGES.matchAsStaff,
      OWN_CONTRIBUTION_MESSAGES.refundAsStaff,
      OWN_CONTRIBUTION_MESSAGES.correction,
      OWN_CONTRIBUTION_MESSAGES.returnedRefund,
    ]) {
      expect(message).not.toContain(GIVE_CONTACT_EMAIL)
    }
  })
})
