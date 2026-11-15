/**
 * Nobody settles money to their own contribution (GIVE_SELF_REVIEW,
 * DOS/Give#199). A contribution is the viewer's own when they gave it signed
 * in, or it is a guest contribution whose email is the viewer's email. The
 * database rule is give.is_own_contribution (DOS/DOS.Me 20261116150000),
 * which give.match_transaction, give.correct_inbound_explanation,
 * give.record_disbursement and give.link_returned_transfer check under their
 * locks. The app uses the same rule only to leave those contributions out of
 * its pickers and to word the refusal before it happens; the database
 * decides.
 *
 * guest_email is read only with the viewer's own token (contributions_read:
 * their own campaign as organizer, or finance/admin staff), only to filter,
 * and is never passed on to a page.
 */

/** The signed-in viewer, as the rule needs them. `email` is the session's (auth.users.email). */
export interface Viewer {
  id: string
  email: string | null
}

/** An email as the database compares it: trimmed of spaces, tabs and line breaks, lowercased; null when empty. */
export function normalizeEmail(email: string | null | undefined): string | null {
  const value = (email ?? "").replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "").toLowerCase()
  return value === "" ? null : value
}

/** True when the contribution is the viewer's own, signed in or as a guest with their email. */
export function isOwnContribution(
  c: { contributor_user_id?: string | null; guest_email?: string | null },
  viewer: Viewer
): boolean {
  if (c.contributor_user_id) return c.contributor_user_id === viewer.id
  const guest = normalizeEmail(c.guest_email)
  return guest !== null && guest === normalizeEmail(viewer.email)
}

/** What the pickers say about the contributions they leave out, in words for "của chính bạn". */
export const OWN_CONTRIBUTION_SCOPE = "lượt bạn ủng hộ khi đăng nhập, hoặc khi không đăng nhập nhưng dùng email của bạn"

/**
 * GIVE_SELF_REVIEW worded for each action on a contribution (DOS/Give#199).
 * The generic text in lib/errors.ts is about receiving accounts, so every
 * caller of the four RPCs words it here.
 */
export const OWN_CONTRIBUTION_MESSAGES = {
  /** The organizer matching on /me/campaigns/[id]/unmatched. */
  matchAsOrganizer: `Bạn không khớp được tiền với lượt ủng hộ của chính mình (${OWN_CONTRIBUTION_SCOPE}). Khoản tiền đó tự khớp khi nội dung chuyển khoản có đúng mã ủng hộ; nếu không, hãy nhờ nhân viên tài chính của Give khớp giúp.`,
  /** Finance/admin staff matching on /admin/unmatched. */
  matchAsStaff: `Bạn không khớp được tiền với lượt ủng hộ của chính mình (${OWN_CONTRIBUTION_SCOPE}). Nhờ một nhân viên tài chính khác khớp khoản này.`,
  /** An admin correcting an explanation on /admin/unmatched, when the chosen contribution is theirs. */
  correction: `Lượt ủng hộ đã chọn là của chính bạn (${OWN_CONTRIBUTION_SCOPE}), nên bạn không chuyển khoản tiền này sang lượt đó được. Nhờ một quản trị viên khác sửa giải trình.`,
  /** The organizer explaining a refund on /me/campaigns/[id]/disbursements. */
  refund: `Bạn không ghi được khoản hoàn tiền cho lượt ủng hộ của chính mình (${OWN_CONTRIBUTION_SCOPE}). Nếu cần hoàn tiền cho lượt đó, hãy liên hệ đội ngũ Give.`,
  /** Finance/admin staff linking a returned refund on /admin/unmatched. */
  returnedRefund: `Khoản chuyển đi đã chọn là khoản hoàn tiền cho lượt ủng hộ của chính bạn (${OWN_CONTRIBUTION_SCOPE}). Ghi nhận tiền bị trả lại sẽ làm chiến dịch lại nợ khoản hoàn đó cho bạn, nên bạn không làm được. Nhờ một nhân viên tài chính khác.`,
} as const
