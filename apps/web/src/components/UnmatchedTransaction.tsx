import { ActionForm, SubmitButton } from "@/components/forms"
import { buttonClass } from "@/components/ui/Button"
import { Callout } from "@/components/ui/Callout"
import { ChevronDownIcon } from "@/components/ui/icons"
import type { ActionResult } from "@/lib/errors"
import { formatDate, formatDateTime, formatVnd } from "@/lib/format"
import {
  candidateLabel,
  MAX_EXPLANATION_LENGTH,
  RETURN_CANDIDATE_LIMIT,
  returnCandidateLabel,
  waitsFor,
  type MatchCandidate,
  type ReturnCandidate,
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
 * explanation form stays (DOS/Give#137). With returnAction (finance/admin
 * page), also the form that links it to the outgoing transaction a bank
 * returned it from (DOS/Give#72), offering returnCandidates.
 */
export function UnmatchedTransactionCard({
  tx,
  candidates,
  action,
  explainAction,
  campaignTitle,
  matchBlocked,
  returnAction,
  returnCandidates = [],
}: {
  tx: UnmatchedTransaction
  candidates: MatchCandidate[]
  action: (state: ActionResult, form: FormData) => Promise<ActionResult>
  explainAction?: (state: ActionResult, form: FormData) => Promise<ActionResult>
  /** Shown on the admin page, where transactions of many campaigns are listed. */
  campaignTitle?: string
  /** Why the database refuses every match of this transaction, worded for the reader. */
  matchBlocked?: string | null
  returnAction?: (state: ActionResult, form: FormData) => Promise<ActionResult>
  /** Outgoing transactions this one may be the return of (returnCandidatesFor). */
  returnCandidates?: ReturnCandidate[]
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
      {returnAction && <ReturnedTransferForm tx={tx} candidates={returnCandidates} action={returnAction} />}
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
          Không dùng cho tiền chuyển đi bị ngân hàng trả lại (khoản chi hoặc khoản hoàn tiền không thành công): ghi nhận
          khoản đó ở mục &quot;Tiền chuyển đi bị ngân hàng trả lại?&quot; bên dưới.
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

/**
 * Finance/admin only: links the transaction to the outgoing transaction a
 * bank returned it from (DOS/Give#72). That transaction's 'disbursed' or
 * 'refunded' post is netted, so the campaign's spent or refunded total drops;
 * the public statement shows both rows as one returned transfer, and the
 * reason and evidence stay private.
 */
function ReturnedTransferForm({
  tx,
  candidates,
  action,
}: {
  tx: UnmatchedTransaction
  candidates: ReturnCandidate[]
  action: (state: ActionResult, form: FormData) => Promise<ActionResult>
}) {
  return (
    <details className="group border-t border-border pt-3">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-medium text-fg hover:text-primary [&::-webkit-details-marker]:hidden">
        Tiền chuyển đi bị ngân hàng trả lại? Ghi nhận khoản này
        <ChevronDownIcon width={20} height={20} className="group-open:rotate-180" />
      </summary>
      {candidates.length === 0 ? (
        <div className="mt-3 max-w-160">
          <Callout tone="info" title="Không có khoản chuyển đi nào phù hợp.">
            Khoản chuyển đi gốc (khoản chi hoặc hoàn tiền) phải cùng chiến dịch và cùng tài khoản nhận, đã được người tổ
            chức giải trình, chưa được ghi nhận là bị trả lại, có số tiền không nhỏ hơn {formatVnd(tx.amount)} và không
            sau ngày tiền về. Nếu khoản gốc chưa được giải trình, hãy nhắc người tổ chức giải trình trước. Chỉ{" "}
            {RETURN_CANDIDATE_LIMIT} khoản chuyển đi gần nhất của chiến dịch được xét.
          </Callout>
        </div>
      ) : (
        <ActionForm
          action={action}
          confirm={`Ghi nhận ${formatVnd(tx.amount)} là tiền bị ngân hàng trả lại của khoản chuyển đi đã chọn? Nếu đó là khoản chi, tổng đã chi của chiến dịch giảm ${formatVnd(tx.amount)}; nếu là khoản hoàn tiền, tổng đã hoàn giảm đúng bằng cả khoản hoàn gốc, còn phí ngân hàng (nếu có) tính vào tổng đã chi. Sao kê công khai hiện hai giao dịch là một khoản chuyển bị trả lại, và ghi nhận đã lưu thì không sửa được.`}
          className="mt-3 grid max-w-160 gap-6"
        >
          <p className="text-fg">
            Chỉ khoản chi và khoản hoàn tiền đã được giải trình mới hiện ở đây. Nếu ngân hàng giữ lại phí, khoản tiền về
            nhỏ hơn khoản gốc. Với khoản chi, phần phí vẫn tính là đã chi. Với khoản hoàn tiền, cả khoản hoàn không còn
            tính là đã hoàn (kể cả phí), phần phí tính vào tổng đã chi, và người tổ chức phải hoàn lại đủ cho người ủng
            hộ.
          </p>
          <div>
            <label htmlFor={`original-${tx.id}`} className="label">
              Khoản chuyển đi gốc
            </label>
            <select id={`original-${tx.id}`} name="original_transaction_id" className="field" defaultValue="" required>
              <option value="" disabled>
                Chọn khoản chi hoặc hoàn tiền…
              </option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {returnCandidateLabel(c)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`return-reason-${tx.id}`} className="label">
              Lý do (không công khai)
            </label>
            <textarea
              id={`return-reason-${tx.id}`}
              name="reason"
              className="field"
              rows={2}
              maxLength={MAX_EXPLANATION_LENGTH}
              required
              placeholder="Vì sao đây là tiền của khoản đã chọn bị trả lại"
            />
          </div>
          <div>
            <label htmlFor={`return-evidence-${tx.id}`} className="label">
              Bằng chứng đã kiểm tra (không công khai)
            </label>
            <input
              id={`return-evidence-${tx.id}`}
              name="evidence"
              className="field"
              maxLength={MAX_EXPLANATION_LENGTH}
              required
              placeholder="Ví dụ: thư báo trả tiền, mã giao dịch gốc"
            />
          </div>
          <div>
            <SubmitButton className={buttonClass({ variant: "secondary" })}>Ghi nhận tiền bị trả lại</SubmitButton>
          </div>
        </ActionForm>
      )}
    </details>
  )
}
