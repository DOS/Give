import Link from "next/link"

import { ActionForm, SubmitButton } from "@/components/forms"
import { buttonClass } from "@/components/ui/Button"
import { Callout } from "@/components/ui/Callout"
import { EmptyState } from "@/components/ui/EmptyState"
import { ChevronDownIcon } from "@/components/ui/icons"
import type { ActionResult } from "@/lib/errors"
import { formatDate, formatDateTime, formatVnd } from "@/lib/format"
import {
  candidateLabel,
  MAX_CORRECTION_REASON_LENGTH,
  MAX_RETURN_TO_UNMATCHED_REASON_LENGTH,
  REFUSAL_REASON_LABELS,
  RETURN_TO_UNMATCHED_EFFECT,
  transactionSourceLabel,
  waitsFor,
  type InboundCorrection,
  type InboundExplanation,
  type InboundReturn,
  type MatchCandidate,
  type ManualMatch,
  type PaidBreakdown,
  type RefusalReason,
  type ReturnedTransfer,
  type UnattributedTransaction,
} from "@/lib/reconciliation"
import { inboundExplanationLabel } from "@/lib/statement"
import { MachineId, RefCode } from "@/components/ui/RefCode"

/**
 * "Đã thanh toán" and its parts; a manual match or an explanation moves money
 * between the parts only.
 */
export function PaidBreakdownCard({ breakdown }: { breakdown: PaidBreakdown }) {
  return (
    <section aria-label="Tiền đã vào tài khoản" className="card p-4 sm:p-6">
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-3 [&>*]:min-w-0">
        <div>
          <dt className="text-sm text-muted">Đã thanh toán (tiền đã vào tài khoản)</dt>
          <dd className="mt-1 text-h2 figure break-words">{formatVnd(breakdown.paid)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Đã khớp với lượt ủng hộ</dt>
          <dd className="mt-1 text-h2 font-bold break-words text-primary tabular-nums">
            {formatVnd(breakdown.received)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Chưa khớp</dt>
          <dd
            className={`mt-1 text-h2 font-bold break-words tabular-nums ${breakdown.unmatched > 0 ? "text-warning" : "text-fg"}`}
          >
            {formatVnd(breakdown.unmatched)}
          </dd>
        </div>
        {breakdown.other !== 0 && (
          <div>
            <dt className="text-sm text-muted">Không phải tiền ủng hộ (đã giải trình)</dt>
            <dd className="mt-1 text-h2 figure break-words">{formatVnd(breakdown.other)}</dd>
          </div>
        )}
      </dl>
    </section>
  )
}

export function ManualMatchList({ matches, titles }: { matches: ManualMatch[]; titles?: Map<string, string> }) {
  return (
    <section aria-labelledby="manual-matches-heading">
      <h2 id="manual-matches-heading" className="mb-6 text-h2">
        Đã khớp tay gần đây ({matches.length})
      </h2>
      {matches.length === 0 ? (
        <EmptyState title="Chưa có giao dịch nào được khớp tay." />
      ) : (
        <ul className="divide-y divide-border card">
          {matches.map((m) => (
            <li key={m.bank_transaction_id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 p-4 sm:px-6">
              <span className="min-w-0 break-words">
                <span className="font-semibold text-fg tabular-nums">+{formatVnd(m.tx.amount)}</span> → lượt ủng hộ{" "}
                {m.contribution ? (
                  <RefCode>{m.contribution.reference_code}</RefCode>
                ) : (
                  <MachineId className="text-muted">{m.contribution_id}</MachineId>
                )}
                {titles && <span className="text-muted"> · {titles.get(m.tx.campaign_id) ?? "Chiến dịch"}</span>}
              </span>
              <span className="text-sm text-muted">Khớp lúc {formatDateTime(m.matched_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * What an admin may do about one explanation (DOS/Give#71): correct it with
 * these candidates, or a sentence saying why they may not.
 */
export type CorrectionOffer =
  | { action: (state: ActionResult, form: FormData) => Promise<ActionResult>; candidates: MatchCandidate[] }
  | { blocked: string }

/**
 * What an admin may do about returning one explanation to unmatched
 * (DOS/Give#196): the action, or a sentence saying why they may not.
 */
export type ReturnToUnmatchedOffer =
  { action: (state: ActionResult, form: FormData) => Promise<ActionResult> } | { blocked: string }

/**
 * Recent explanations of incoming money that is not a donation, with their
 * private reason and evidence. A corrected one shows its correction and a
 * returned one its return (DOS/Give#196); with offers (admins only), one that
 * is neither offers "Đưa về chưa khớp" and "Sửa giải trình".
 */
export function InboundExplanationList({
  explanations,
  titles,
  corrections,
  returns,
}: {
  explanations: InboundExplanation[]
  titles?: Map<string, string>
  /** By transaction id; an explanation without an entry offers nothing. */
  corrections?: Map<string, CorrectionOffer>
  /** By transaction id; an explanation without an entry offers nothing. */
  returns?: Map<string, ReturnToUnmatchedOffer>
}) {
  return (
    <section aria-labelledby="inbound-explanations-heading">
      <h2 id="inbound-explanations-heading" className="mb-6 text-h2">
        Đã giải trình gần đây ({explanations.length})
      </h2>
      {explanations.length === 0 ? (
        <EmptyState title="Chưa có khoản tiền vào nào được giải trình là không phải tiền ủng hộ." />
      ) : (
        <ul className="divide-y divide-border card">
          {explanations.map((e) => {
            const superseded = Boolean(e.correction || e.returned)
            const offer = superseded ? undefined : corrections?.get(e.bank_transaction_id)
            const returnOffer = superseded ? undefined : returns?.get(e.bank_transaction_id)
            return (
              <li key={e.bank_transaction_id} className="space-y-1 p-4 sm:px-6">
                <p className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                  <span className="min-w-0 break-words">
                    <span
                      className={`font-semibold tabular-nums ${superseded ? "text-muted line-through" : "text-fg"}`}
                    >
                      +{formatVnd(e.tx.amount)}
                    </span>{" "}
                    · {inboundExplanationLabel(e.kind)}
                    {titles && <span className="text-muted"> · {titles.get(e.tx.campaign_id) ?? "Chiến dịch"}</span>}
                  </span>
                  <span className="text-sm text-muted">Giải trình lúc {formatDateTime(e.explained_at)}</span>
                </p>
                <p className="break-words text-fg">Lý do: {e.reason}</p>
                <p className="break-words text-muted">Bằng chứng: {e.evidence}</p>
                {e.correction && <CorrectedNote amount={e.tx.amount} correction={e.correction} />}
                {e.returned && <ReturnedNote amount={e.tx.amount} returned={e.returned} />}
                {returnOffer && "blocked" in returnOffer && (
                  <p className="pt-2 text-sm text-muted">{returnOffer.blocked}</p>
                )}
                {returnOffer && "action" in returnOffer && (
                  <ReturnToUnmatchedForm
                    txId={e.bank_transaction_id}
                    amount={e.tx.amount}
                    action={returnOffer.action}
                  />
                )}
                {offer && "blocked" in offer && <p className="pt-2 text-sm text-muted">{offer.blocked}</p>}
                {offer && "action" in offer && (
                  <CorrectExplanationForm
                    txId={e.bank_transaction_id}
                    amount={e.tx.amount}
                    candidates={offer.candidates}
                    action={offer.action}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** A correction replaces the explanation: the money is a donation of this contribution. */
function CorrectedNote({ amount, correction }: { amount: number; correction: InboundCorrection }) {
  return (
    <div className="pt-2">
      <Callout tone="info" title="Giải trình này đã được sửa.">
        <p className="break-words">
          {formatVnd(amount)} là tiền của lượt ủng hộ{" "}
          {correction.contribution ? (
            <RefCode>{correction.contribution.reference_code}</RefCode>
          ) : (
            <MachineId>{correction.contribution_id}</MachineId>
          )}
          , không còn tính là &quot;không phải tiền ủng hộ&quot;. Sửa lúc {formatDateTime(correction.corrected_at)}.
        </p>
        <p className="break-words">Lý do sửa: {correction.reason}</p>
      </Callout>
    </div>
  )
}

/** A return supersedes the explanation: the money is unmatched again (DOS/Give#196). */
function ReturnedNote({ amount, returned }: { amount: number; returned: InboundReturn }) {
  return (
    <div className="pt-2">
      <Callout tone="info" title="Giải trình này đã được đưa về chưa khớp.">
        <p className="break-words">
          {formatVnd(amount)} không còn tính là &quot;không phải tiền ủng hộ&quot;: khoản tiền được đưa về chưa khớp để
          khớp với một lượt ủng hộ. Đưa về lúc {formatDateTime(returned.returned_at)}.
        </p>
        <p className="break-words">Lý do đưa về: {returned.reason}</p>
      </Callout>
    </div>
  )
}

/**
 * Admin only (DOS/Give#196): sends the explanation back to unmatched, with a
 * required reason, for money that is a donation whose contribution is not
 * known yet. Says plainly that it is never explained again.
 */
function ReturnToUnmatchedForm({
  txId,
  amount,
  action,
}: {
  txId: string
  amount: number
  action: (state: ActionResult, form: FormData) => Promise<ActionResult>
}) {
  return (
    <details className="group pt-2">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-medium text-fg hover:text-primary [&::-webkit-details-marker]:hidden">
        Giải trình nhầm, chưa rõ của lượt nào? Đưa về chưa khớp
        <ChevronDownIcon width={20} height={20} className="group-open:rotate-180" />
      </summary>
      <ActionForm
        action={action}
        confirm={`Đưa ${formatVnd(amount)} về chưa khớp? Tiền chuyển từ "không phải tiền ủng hộ" sang "chưa khớp", tổng đã thanh toán không đổi. Sau đó khoản này chỉ khớp được với một lượt ủng hộ: không giải trình lại được là "không phải tiền ủng hộ". Mỗi giao dịch chỉ đưa về được một lần.`}
        className="mt-3 grid max-w-160 gap-6"
      >
        <p className="text-fg">
          Dùng khi khoản này thực ra là tiền ủng hộ nhưng chưa rõ của lượt nào (nếu đã rõ, dùng &quot;Sửa giải
          trình&quot;). {RETURN_TO_UNMATCHED_EFFECT} Giải trình cũ vẫn được giữ trong nhật ký; lần đưa về được ghi vào
          nhật ký kiểm toán.
        </p>
        <div>
          <label htmlFor={`return-unmatched-reason-${txId}`} className="label">
            Lý do đưa về (không công khai)
          </label>
          <textarea
            id={`return-unmatched-reason-${txId}`}
            name="reason"
            className="field"
            rows={2}
            maxLength={MAX_RETURN_TO_UNMATCHED_REASON_LENGTH}
            required
            placeholder="Vì sao giải trình trước là nhầm, và bạn đã kiểm tra những gì"
          />
        </div>
        <div>
          <SubmitButton className={buttonClass({ variant: "secondary" })}>Đưa về chưa khớp</SubmitButton>
        </div>
      </ActionForm>
    </details>
  )
}

/**
 * Admin only (DOS/Give#71): credits explained money to a contribution of the
 * same campaign (picked from the list or typed as a reference code), with a
 * required reason. Contributions waiting for exactly this amount come first;
 * the admin's own contributions are left out of the list.
 */
function CorrectExplanationForm({
  txId,
  amount,
  candidates,
  action,
}: {
  txId: string
  amount: number
  candidates: MatchCandidate[]
  action: (state: ActionResult, form: FormData) => Promise<ActionResult>
}) {
  const sameAmount = candidates.filter((c) => waitsFor(c, amount))
  const others = candidates.filter((c) => !waitsFor(c, amount))
  return (
    <details className="group pt-2">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-medium text-fg hover:text-primary [&::-webkit-details-marker]:hidden">
        Giải trình nhầm? Sửa giải trình
        <ChevronDownIcon width={20} height={20} className="group-open:rotate-180" />
      </summary>
      <ActionForm
        action={action}
        confirm={`Sửa giải trình: ghi nhận ${formatVnd(amount)} là tiền của lượt ủng hộ đã chọn? Tiền chuyển từ "không phải tiền ủng hộ" sang "đã khớp", tổng đã thanh toán không đổi, và sao kê công khai hiện giao dịch là tiền ủng hộ. Mỗi giải trình chỉ sửa được một lần.`}
        className="mt-3 grid max-w-160 gap-6"
      >
        <p className="text-fg">
          Dùng khi khoản này thực ra là tiền ủng hộ của một lượt trong cùng chiến dịch. Giải trình cũ vẫn được giữ trong
          nhật ký; lần sửa được ghi vào nhật ký kiểm toán.
        </p>
        <div>
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr] [&>*]:min-w-0">
            <div>
              <label htmlFor={`correct-contribution-${txId}`} className="label">
                Lượt ủng hộ
              </label>
              <select id={`correct-contribution-${txId}`} name="contribution_id" className="field" defaultValue="">
                <option value="">
                  {candidates.length > 0 ? "Chọn lượt ủng hộ…" : "Không có lượt nào trong danh sách"}
                </option>
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
              <label htmlFor={`correct-code-${txId}`} className="label">
                hoặc mã ủng hộ
              </label>
              <input
                id={`correct-code-${txId}`}
                name="reference_code"
                className="field font-mono uppercase"
                placeholder="GV…"
                maxLength={16}
              />
            </div>
          </div>
          <p className="mt-2 text-sm text-muted">
            Danh sách có tối đa 200 lượt mới nhất còn nhận tiền, không gồm lượt của chính bạn. Lượt cũ hơn thì nhập mã
            ủng hộ.
          </p>
        </div>
        <div>
          <label htmlFor={`correct-reason-${txId}`} className="label">
            Lý do sửa (không công khai)
          </label>
          <textarea
            id={`correct-reason-${txId}`}
            name="reason"
            className="field"
            rows={2}
            maxLength={MAX_CORRECTION_REASON_LENGTH}
            required
            placeholder="Vì sao giải trình trước là nhầm, và bạn đã kiểm tra những gì"
          />
        </div>
        <div>
          <SubmitButton className={buttonClass({ variant: "secondary" })}>Sửa giải trình</SubmitButton>
        </div>
      </ActionForm>
    </details>
  )
}

/**
 * Recent links of money a bank returned to the outgoing transaction it came
 * from (DOS/Give#72), with their private reason and evidence.
 */
/**
 * The fee a bank kept on a returned transfer, for finance (DOS/Give#195): on
 * a refund it is a bank fee the organizer bears, and the backer is owed the
 * whole refund again; on a payment it stays spent.
 */
export function returnedFeeText(fee: number, isRefund: boolean | null): string {
  const head = `Ngân hàng giữ ${formatVnd(fee)} phí`
  if (isRefund) {
    return `${head}: tính là phí ngân hàng (đã chi) của chiến dịch, không tính là đã hoàn. Người ủng hộ cần được hoàn đủ bằng một khoản chuyển mới; người tổ chức chịu phí.`
  }
  if (isRefund === false) return `${head}: vẫn tính là đã chi.`
  return `${head}.`
}

export function ReturnedTransferList({
  returns,
  titles,
}: {
  returns: ReturnedTransfer[]
  titles?: Map<string, string>
}) {
  return (
    <section aria-labelledby="returned-transfers-heading">
      <h2 id="returned-transfers-heading" className="mb-6 text-h2">
        Tiền bị trả lại đã ghi nhận gần đây ({returns.length})
      </h2>
      {returns.length === 0 ? (
        <EmptyState title="Chưa có khoản tiền nào được ghi nhận là bị ngân hàng trả lại." />
      ) : (
        <ul className="divide-y divide-border card">
          {returns.map((r) => (
            <li key={r.bank_transaction_id} className="space-y-1 p-4 sm:px-6">
              <p className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                <span className="min-w-0 break-words">
                  <span className="font-semibold text-fg tabular-nums">+{formatVnd(r.tx.amount)}</span> trả lại{" "}
                  {r.original?.is_refund ? "khoản hoàn tiền" : "khoản chi"}
                  {r.original && (
                    <>
                      {" "}
                      <span className="tabular-nums">−{formatVnd(r.original.amount)}</span> ngày{" "}
                      {formatDate(r.original.booked_at)}
                    </>
                  )}
                  {titles && <span className="text-muted"> · {titles.get(r.tx.campaign_id) ?? "Chiến dịch"}</span>}
                </span>
                <span className="text-sm text-muted">Ghi nhận lúc {formatDateTime(r.linked_at)}</span>
              </p>
              {r.original && r.original.amount > r.tx.amount && (
                <p className="break-words text-fg" data-figure="return_bank_fee">
                  {returnedFeeText(r.original.amount - r.tx.amount, r.original.is_refund)}
                </p>
              )}
              <p className="break-words text-fg">Lý do: {r.reason}</p>
              <p className="break-words text-muted">Bằng chứng: {r.evidence}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** One refusal reason: what happened, in words, and a link to the campaign it names. */
function RefusalReasonLine({
  reason,
  campaigns,
}: {
  reason: RefusalReason
  campaigns: Map<string, { slug: string; title: string }>
}) {
  const campaign = reason.campaign_id ? campaigns.get(reason.campaign_id) : undefined
  return (
    <p className="break-words text-fg">
      <span className="font-medium text-warning">Lý do: {REFUSAL_REASON_LABELS[reason.action]}.</span>
      {reason.campaign_id && (
        <>
          {" "}
          Chiến dịch:{" "}
          {campaign ? (
            <Link href={`/campaigns/${campaign.slug}`} className="link" target="_blank">
              {campaign.title}
              <span className="sr-only"> (mở thẻ mới)</span>
            </Link>
          ) : (
            <MachineId>{reason.campaign_id}</MachineId>
          )}
        </>
      )}
    </p>
  )
}

/**
 * Incoming money recorded with no campaign, read only (DOS/Give#148): what
 * came in, when, to which account and from whom, and why it has no campaign
 * when the database recorded a reason (give.bank_transaction_refusal_reasons,
 * DOS/Give#138).
 */
export function UnattributedList({
  transactions,
  total,
  accounts,
  reasons = new Map(),
  campaigns = new Map(),
}: {
  transactions: UnattributedTransaction[]
  total: number
  /** Labels of the receiving accounts, by id. */
  accounts: Map<string, string>
  /** Why each transaction was not given to a campaign, by transaction id (DOS/Give#138). */
  reasons?: Map<string, RefusalReason[]>
  /** Slug and title of the campaigns the reasons name, by id. */
  campaigns?: Map<string, { slug: string; title: string }>
}) {
  return (
    <div className="space-y-3">
      {total > transactions.length && (
        <p className="text-sm text-muted">
          Đang hiện {transactions.length} khoản mới nhất trong tổng số {total} khoản.
        </p>
      )}
      <ul className="divide-y divide-border card">
        {transactions.map((tx) => (
          <li key={tx.id} className="space-y-1 p-4 sm:px-6">
            <p className="flex flex-wrap justify-between gap-x-4 gap-y-1">
              <span className="min-w-0 break-words">
                <span className="font-semibold text-fg tabular-nums">+{formatVnd(tx.amount)}</span>
                <span className="text-muted"> · </span>
                {accounts.get(tx.receiving_account_id) ?? "Tài khoản nhận"}
              </span>
              <span className="text-sm text-muted">
                {tx.booked_date_only ? formatDate(tx.booked_at) : formatDateTime(tx.booked_at)} · nguồn:{" "}
                {transactionSourceLabel(tx.source)}
              </span>
            </p>
            <p className="break-words text-fg">
              Người chuyển: {tx.counterparty_name ?? "—"}
              {tx.counterparty_account_masked && (
                <span className="text-muted"> ({tx.counterparty_account_masked})</span>
              )}
            </p>
            <p className="break-words text-muted">
              Nội dung chuyển khoản: {tx.description ? <MachineId>{tx.description}</MachineId> : "—"}
            </p>
            <p className="text-sm break-words text-muted">
              Mã giao dịch: <MachineId>{tx.provider_tx_id}</MachineId>
            </p>
            {reasons.get(tx.id)?.map((reason) => (
              <RefusalReasonLine key={`${reason.action}:${reason.created_at}`} reason={reason} campaigns={campaigns} />
            ))}
          </li>
        ))}
      </ul>
    </div>
  )
}
