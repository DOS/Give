/**
 * How a person reaches Give staff (DOS/Give#205): one email address on Give's
 * own domain (JOY's decision, 2026-11-17; it replaced help@dos.me). The site footer
 * links it, and every message that asks the reader to contact Give names it,
 * so changing it here changes it everywhere.
 */
export const GIVE_CONTACT_EMAIL = "hi@give.vn"

/** The `mailto:` link to GIVE_CONTACT_EMAIL. */
export const GIVE_CONTACT_HREF = `mailto:${GIVE_CONTACT_EMAIL}`

/**
 * The words that follow "liên hệ đội ngũ Give" (or "báo …") in a message,
 * "qua email hi@give.vn". `ContactText` turns the address into a link where
 * the message is shown.
 */
export const VIA_CONTACT_EMAIL = `qua email ${GIVE_CONTACT_EMAIL}`
