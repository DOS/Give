import { describeAccountChange, type PublicAccountChange } from "@/lib/account-swaps"

/**
 * Public notice that a campaign's receiving account was replaced, with the
 * date (DOS/Give#55). Shown on the campaign page and its statement, so donors
 * know which account the campaign's statement covers when.
 */
export function AccountChanges({ changes }: { changes: readonly PublicAccountChange[] }) {
  if (changes.length === 0) return null
  return (
    <section aria-labelledby="account-changes-heading" className="space-y-2 card p-6 text-sm">
      <h2 id="account-changes-heading" className="font-semibold">
        Chiến dịch đã đổi tài khoản nhận
      </h2>
      <ul className="space-y-2 text-gray-700">
        {changes.map((change) => (
          <li key={change.id}>
            <p>{describeAccountChange(change)}</p>
            {change.public_note && <p className="mt-1 text-gray-500">Ghi chú của Give: {change.public_note}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}
