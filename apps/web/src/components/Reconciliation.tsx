import { formatDateTime, formatVnd } from "@/lib/format"
import type { ManualMatch, PaidBreakdown } from "@/lib/reconciliation"

/** "Đã thanh toán" and its two parts; a manual match moves money between the parts only. */
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
