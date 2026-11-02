import { ActionForm, SubmitButton } from "@/components/forms"
import type { ActionResult } from "@/lib/errors"
import { formatDate, formatDateTime, formatVnd } from "@/lib/format"
import {
  candidateLabel,
  MAX_EXPLANATION_LENGTH,
  waitsFor,
  type MatchCandidate,
  type UnmatchedTransaction,
} from "@/lib/reconciliation"
import { INBOUND_EXPLANATION_KINDS } from "@/lib/statement"

/**
 * One incoming transaction without a match, and the form that matches it to
 * a contribution of its campaign (a pick from the list, or a typed code).
 * With explainAction (finance/admin page), also the form that explains it as
 * money that is not a donation.
 */
export function UnmatchedTransactionCard({
  tx,
  candidates,
  action,
  explainAction,
  campaignTitle,
}: {
  tx: UnmatchedTransaction
  candidates: MatchCandidate[]
  action: (state: ActionResult, form: FormData) => Promise<ActionResult>
  explainAction?: (state: ActionResult, form: FormData) => Promise<ActionResult>
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

      {explainAction && <ExplainInboundForm tx={tx} action={explainAction} />}
    </li>
  )
}

/**
 * Finance/admin only: explains the transaction as money that is not a
 * donation (DOS/Give#49). The public statement shows the kind; the reason
 * and evidence stay with staff and the organizer.
 */
function ExplainInboundForm({
  tx,
  action,
}: {
  tx: UnmatchedTransaction
  action: (state: ActionResult, form: FormData) => Promise<ActionResult>
}) {
  return (
    <details className="border-t border-gray-100 pt-4">
      <summary className="cursor-pointer text-sm font-medium text-gray-700">
        Không phải tiền ủng hộ? Giải trình khoản này
      </summary>
      <ActionForm
        action={action}
        confirm={`Giải trình giao dịch ${formatVnd(tx.amount)} là không phải tiền ủng hộ? Loại khoản tiền sẽ hiện trên sao kê công khai; giải trình đã ghi thì không sửa được, và giao dịch không khớp được với lượt ủng hộ nào nữa.`}
        className="mt-3 grid gap-3"
      >
        <div>
          <label htmlFor={`kind-${tx.id}`} className="label">
            Loại khoản tiền
          </label>
          <select id={`kind-${tx.id}`} name="kind" className="field" defaultValue="" required>
            <option value="" disabled>
              Chọn loại…
            </option>
            {Object.entries(INBOUND_EXPLANATION_KINDS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`reason-${tx.id}`} className="label">
            Lý do (không công khai)
          </label>
          <textarea
            id={`reason-${tx.id}`}
            name="reason"
            className="field"
            rows={2}
            maxLength={MAX_EXPLANATION_LENGTH}
            required
            placeholder="Vì sao đây không phải tiền ủng hộ"
          />
        </div>
        <div>
          <label htmlFor={`evidence-${tx.id}`} className="label">
            Bằng chứng đã kiểm tra (không công khai)
          </label>
          <input
            id={`evidence-${tx.id}`}
            name="evidence"
            className="field"
            maxLength={MAX_EXPLANATION_LENGTH}
            required
            placeholder="Ví dụ: thư ngân hàng số …, dòng sao kê ngày …, tin nhắn của người tổ chức"
          />
        </div>
        <div>
          <SubmitButton>Giải trình</SubmitButton>
        </div>
      </ActionForm>
    </details>
  )
}
