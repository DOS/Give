import { ActionForm, SubmitButton } from "@/components/forms"
import type { ActionResult } from "@/lib/errors"
import { formatDate, formatDateTime, formatVnd } from "@/lib/format"
import { candidateLabel, waitsFor, type MatchCandidate, type UnmatchedTransaction } from "@/lib/reconciliation"

/**
 * One incoming transaction without a match, and the form that matches it to
 * a contribution of its campaign (a pick from the list, or a typed code).
 */
export function UnmatchedTransactionCard({
  tx,
  candidates,
  action,
  campaignTitle,
}: {
  tx: UnmatchedTransaction
  candidates: MatchCandidate[]
  action: (state: ActionResult, form: FormData) => Promise<ActionResult>
  /** Shown on the admin page, where transactions of many campaigns are listed. */
  campaignTitle?: string
}) {
  const sameAmount = candidates.filter((c) => waitsFor(c, tx.amount))
  const others = candidates.filter((c) => !waitsFor(c, tx.amount))

  return (
    <li className="space-y-4 card p-6">
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-gray-500">Số tiền vào</dt>
          <dd className="text-lg font-semibold text-green-700">+{formatVnd(tx.amount)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Ngày</dt>
          <dd>{tx.booked_date_only ? formatDate(tx.booked_at) : formatDateTime(tx.booked_at)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Người chuyển</dt>
          <dd>
            {tx.counterparty_name ?? "—"}
            {tx.counterparty_account_masked && (
              <span className="text-gray-500"> ({tx.counterparty_account_masked})</span>
            )}
          </dd>
        </div>
        <div className="sm:col-span-3">
          <dt className="text-gray-500">Nội dung chuyển khoản</dt>
          <dd className="font-mono break-words">{tx.description ?? "—"}</dd>
        </div>
        {campaignTitle && (
          <div className="sm:col-span-2">
            <dt className="text-gray-500">Chiến dịch</dt>
            <dd>{campaignTitle}</dd>
          </div>
        )}
        {tx.after_close && (
          <div className="text-amber-800 sm:col-span-3">Tiền vào sau khi chiến dịch đã đóng hoặc kết thúc.</div>
        )}
      </dl>

      <ActionForm
        action={action}
        confirm={`Khớp giao dịch ${formatVnd(tx.amount)} với lượt ủng hộ đã chọn? Mỗi giao dịch chỉ khớp được một lần, và chưa sửa được sau khi khớp.`}
        className="grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end"
      >
        <div>
          <label htmlFor={`contribution-${tx.id}`} className="label">
            Lượt ủng hộ
          </label>
          <select id={`contribution-${tx.id}`} name="contribution_id" className="field" defaultValue="">
            <option value="">Chọn lượt ủng hộ…</option>
            {sameAmount.length > 0 && (
              <optgroup label="Đang chờ đúng số tiền này">
                {sameAmount.map((c) => (
                  <option key={c.id} value={c.id}>
                    {candidateLabel(c)}
                  </option>
                ))}
              </optgroup>
            )}
            {others.length > 0 && (
              <optgroup label="Lượt ủng hộ khác">
                {others.map((c) => (
                  <option key={c.id} value={c.id}>
                    {candidateLabel(c)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        <div>
          <label htmlFor={`code-${tx.id}`} className="label">
            hoặc mã ủng hộ
          </label>
          <input
            id={`code-${tx.id}`}
            name="reference_code"
            className="field font-mono uppercase"
            placeholder="GV…"
            maxLength={16}
          />
        </div>
        <SubmitButton>Khớp</SubmitButton>
      </ActionForm>
    </li>
  )
}
