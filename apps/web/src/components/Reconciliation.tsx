import { formatDateTime, formatVnd } from "@/lib/format"
import type { InboundExplanation, ManualMatch, PaidBreakdown } from "@/lib/reconciliation"
import { inboundExplanationLabel } from "@/lib/statement"

/**
 * "Đã thanh toán" and its parts; a manual match or an explanation moves money
 * between the parts only.
 */
export function PaidBreakdownCard({ breakdown }: { breakdown: PaidBreakdown }) {
  return (
    <section className="card p-6">
      <dl className="grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-gray-500">Đã thanh toán (tiền đã vào tài khoản)</dt>
          <dd className="text-xl font-bold">{formatVnd(breakdown.paid)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Đã khớp với lượt ủng hộ</dt>
          <dd className="text-xl font-semibold text-green-700">{formatVnd(breakdown.received)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Chưa khớp</dt>
          <dd className={`text-xl font-semibold ${breakdown.unmatched > 0 ? "text-amber-700" : "text-gray-700"}`}>
            {formatVnd(breakdown.unmatched)}
          </dd>
        </div>
        {breakdown.other !== 0 && (
          <div>
            <dt className="text-gray-500">Không phải tiền ủng hộ (đã giải trình)</dt>
            <dd className="text-xl font-semibold text-gray-700">{formatVnd(breakdown.other)}</dd>
          </div>
        )}
      </dl>
    </section>
  )
}

export function ManualMatchList({ matches, titles }: { matches: ManualMatch[]; titles?: Map<string, string> }) {
  return (
    <section>
      <h2 className="mb-4 text-xl font-bold">Đã khớp tay gần đây ({matches.length})</h2>
      {matches.length === 0 ? (
        <p className="card p-6 text-gray-600">Chưa có giao dịch nào được khớp tay.</p>
      ) : (
        <ul className="divide-y divide-gray-100 card text-sm">
          {matches.map((m) => (
            <li key={m.bank_transaction_id} className="flex flex-wrap justify-between gap-2 p-4">
              <span>
                +{formatVnd(m.tx.amount)} → lượt ủng hộ{" "}
                <span className="font-mono">{m.contribution?.reference_code ?? m.contribution_id}</span>
                {titles && <span className="text-gray-500"> · {titles.get(m.tx.campaign_id) ?? "Chiến dịch"}</span>}
              </span>
              <span className="text-gray-500">Khớp lúc {formatDateTime(m.matched_at)}</span>
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
    <section>
      <h2 className="mb-4 text-xl font-bold">Đã giải trình gần đây ({explanations.length})</h2>
      {explanations.length === 0 ? (
        <p className="card p-6 text-gray-600">Chưa có khoản tiền vào nào được giải trình là không phải tiền ủng hộ.</p>
      ) : (
        <ul className="divide-y divide-gray-100 card text-sm">
          {explanations.map((e) => (
            <li key={e.bank_transaction_id} className="space-y-1 p-4">
              <p className="flex flex-wrap justify-between gap-2">
                <span>
                  +{formatVnd(e.tx.amount)} · {inboundExplanationLabel(e.kind)}
                  {titles && <span className="text-gray-500"> · {titles.get(e.tx.campaign_id) ?? "Chiến dịch"}</span>}
                </span>
                <span className="text-gray-500">Giải trình lúc {formatDateTime(e.explained_at)}</span>
              </p>
              <p className="break-words text-gray-700">Lý do: {e.reason}</p>
              <p className="break-words text-gray-500">Bằng chứng: {e.evidence}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
