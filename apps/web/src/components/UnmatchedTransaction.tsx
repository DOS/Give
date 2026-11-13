import { ActionForm, SubmitButton } from "@/components/forms"
import { buttonClass } from "@/components/ui/Button"
import { Callout } from "@/components/ui/Callout"
import { ChevronDownIcon } from "@/components/ui/icons"
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
import { MachineId } from "@/components/ui/RefCode"

/**
 * One incoming transaction without a match, and the form that matches it to
 * a contribution of its campaign (a pick from the list, or a typed code).
 * With explainAction (finance/admin page), also the form that explains it as
 * money that is not a donation. With matchBlocked, a notice that says why no
 * match can succeed takes the match form's place (DOS/Give#148); the
 * explanation form stays (DOS/Give#137).
 */
export function UnmatchedTransactionCard({
  tx,
  candidates,
  action,
  explainAction,
  campaignTitle,
  matchBlocked,
}: {
  tx: UnmatchedTransaction
  candidates: MatchCandidate[]
  action: (state: ActionResult, form: FormData) => Promise<ActionResult>
  explainAction?: (state: ActionResult, form: FormData) => Promise<ActionResult>
  /** Shown on the admin page, where transactions of many campaigns are listed. */
  campaignTitle?: string
  /** Why the database refuses every match of this transaction, worded for the reader. */
  matchBlocked?: string | null
}) {
  const sameAmount = candidates.filter((c) => waitsFor(c, tx.amount))
  const others = candidates.filter((c) => !waitsFor(c, tx.amount))

  return (
    <li className="min-w-0 space-y-6 card p-4 sm:p-6">
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3 [&>*]:min-w-0">
        <div>
          <dt className="text-sm text-muted">Số tiền vào</dt>
          <dd className="text-h3 font-bold text-primary tabular-nums">+{formatVnd(tx.amount)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Ngày</dt>
          <dd className="text-fg">{tx.booked_date_only ? formatDate(tx.booked_at) : formatDateTime(tx.booked_at)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Người chuyển</dt>
          <dd className="break-words text-fg">
            {tx.counterparty_name ?? "—"}
            {tx.counterparty_account_masked && <span className="text-muted"> ({tx.counterparty_account_masked})</span>}
          </dd>
        </div>
        <div className="sm:col-span-3">
          <dt className="text-sm text-muted">Nội dung chuyển khoản</dt>
          <dd className="text-fg">{tx.description ? <MachineId>{tx.description}</MachineId> : "—"}</dd>
        </div>
        {campaignTitle && (
          <div className="sm:col-span-2">
            <dt className="text-sm text-muted">Chiến dịch</dt>
            <dd className="break-words text-fg">{campaignTitle}</dd>
          </div>
        )}
        {tx.after_close && (
          <div className="font-medium text-warning sm:col-span-3">
            Tiền vào sau khi chiến dịch đã đóng hoặc kết thúc.
          </div>
        )}
      </dl>

      {matchBlocked ? (
        <div className="border-t border-border pt-6">
          <Callout tone="warning">{matchBlocked}</Callout>
        </div>
      ) : (
        <ActionForm
          action={action}
          confirm={`Khớp giao dịch ${formatVnd(tx.amount)} với lượt ủng hộ đã chọn? Mỗi giao dịch chỉ khớp được một lần, và chưa sửa được sau khi khớp.`}
          className="grid gap-4 border-t border-border pt-6 sm:grid-cols-[2fr_1fr_auto] sm:items-end [&>*]:min-w-0"
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
          <SubmitButton className={buttonClass()}>Khớp</SubmitButton>
        </ActionForm>
      )}

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
    <details className="group border-t border-border pt-3">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-medium text-fg hover:text-primary [&::-webkit-details-marker]:hidden">
        Không phải tiền ủng hộ? Giải trình khoản này
        <ChevronDownIcon width={20} height={20} className="group-open:rotate-180" />
      </summary>
      <ActionForm
        action={action}
        confirm={`Giải trình giao dịch ${formatVnd(tx.amount)} là không phải tiền ủng hộ? Loại khoản tiền sẽ hiện trên sao kê công khai; giải trình đã ghi thì không sửa được, và giao dịch không khớp được với lượt ủng hộ nào nữa.`}
        className="mt-3 grid max-w-160 gap-6"
      >
        <Callout tone="warning">
          Không dùng cho tiền chuyển đi bị ngân hàng trả lại (khoản chi hoặc khoản hoàn tiền không thành công): khoản đó
          vẫn đang được tính là đã chi hoặc đã hoàn, nên để nguyên và báo quản trị viên.
        </Callout>
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
          <SubmitButton className={buttonClass({ variant: "secondary" })}>Giải trình</SubmitButton>
        </div>
      </ActionForm>
    </details>
  )
}
