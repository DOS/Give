import { Fragment, type ReactNode } from "react"

import { GIVE_CONTACT_EMAIL, GIVE_CONTACT_HREF } from "@/lib/contact"

/**
 * Give's contact address as a `mailto:` link inside a sentence (DOS/Give#205).
 * It keeps the sentence's color, like the other links inside a message.
 */
export function ContactEmailLink() {
  return (
    <a href={GIVE_CONTACT_HREF} className="font-medium underline">
      {GIVE_CONTACT_EMAIL}
    </a>
  )
}

/**
 * A message as text, with every GIVE_CONTACT_EMAIL in it turned into a
 * `mailto:` link. Messages are plain strings (action results, refusal maps),
 * so the place that shows one wraps it in this.
 */
export function ContactText({ text }: { text: string }): ReactNode {
  const parts = text.split(GIVE_CONTACT_EMAIL)
  if (parts.length === 1) return text
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 && <ContactEmailLink />}
      {part}
    </Fragment>
  ))
}
