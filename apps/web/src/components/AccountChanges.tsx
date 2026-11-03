import { describeAccountChange, type PublicAccountChange } from "@/lib/account-swaps"

/**
 * Public notice that a campaign's receiving account was replaced, with the
 * date (DOS/Give#55). Shown on the campaign page and its statement, so donors
 * know which account the campaign's statement covers when.
 */
export function AccountChanges({ changes }: { changes: readonly PublicAccountChange[] }) {
  if (changes.length === 0) return null
  return (
    <section
      aria-labelledby="account-changes-heading"
      className="space-y-2 rounded-md border border-sky-200 bg-sky-50 p-5 text-sky-950"
    >
      <h2 id="account-changes-heading" className="font-semibold text-sky-950">
        Chiến dịch đã đổi tài khoản nhận
      </h2>
      <ul className="space-y-2">
        {changes.map((change) => (
          <li key={change.id}>
            <p>{describeAccountChange(change)}</p>
            {change.public_note && <p className="mt-1 text-sky-900">Ghi chú của Give: {change.public_note}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}
