import { EmptyState } from "@/components/ui/EmptyState"
import { formatDate, formatDateTime, formatVnd } from "@/lib/format"
import {
  transactionSourceLabel,
  type InboundExplanation,
  type ManualMatch,
  type PaidBreakdown,
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

/** Recent explanations of incoming money that is not a donation, with their private reason and evidence. */
export function InboundExplanationList({
  explanations,
  titles,
}: {
  explanations: InboundExplanation[]
  titles?: Map<string, string>
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
          {explanations.map((e) => (
            <li key={e.bank_transaction_id} className="space-y-1 p-4 sm:px-6">
              <p className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                <span className="min-w-0 break-words">
                  <span className="font-semibold text-fg tabular-nums">+{formatVnd(e.tx.amount)}</span> ·{" "}
                  {inboundExplanationLabel(e.kind)}
                  {titles && <span className="text-muted"> · {titles.get(e.tx.campaign_id) ?? "Chiến dịch"}</span>}
                </span>
                <span className="text-sm text-muted">Giải trình lúc {formatDateTime(e.explained_at)}</span>
              </p>
              <p className="break-words text-fg">Lý do: {e.reason}</p>
              <p className="break-words text-muted">Bằng chứng: {e.evidence}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Incoming money recorded with no campaign, read only (DOS/Give#148): what
 * came in, when, to which account and from whom. Why it has no campaign is
 * for DOS/Give#138, since give.audit_log is readable by admins only.
 */
export function UnattributedList({
  transactions,
  total,
  accounts,
}: {
  transactions: UnattributedTransaction[]
  total: number
  /** Labels of the receiving accounts, by id. */
  accounts: Map<string, string>
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
          </li>
        ))}
      </ul>
    </div>
  )
}
