import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { Badge } from "@/components/ui/Badge"
import { Callout } from "@/components/ui/Callout"
import { EmptyState } from "@/components/ui/EmptyState"
import { PageHeader } from "@/components/ui/PageHeader"
import { requireSession } from "@/lib/auth/session"
import { isStaff } from "@/lib/campaigns"
import { formatDate, formatDateTime, formatVnd } from "@/lib/format"
import { isUuid } from "@/lib/ids"
import { FINANCE_ROLES, getAccount } from "@/lib/receiving-accounts"
import {
  accountLabel,
  ambiguousReasonLabel,
  getBatch,
  listBatchRows,
  RESOLUTION_LABELS,
  rowStatusLabel,
  signedAmount,
} from "@/lib/statement-import"
import { dbAs } from "@/lib/supabase"

import { MeDetail } from "../../_components/MePage"
import { ROW_TONES } from "../../_components/tones"

export const metadata: Metadata = { title: "Sao kê đã tải", robots: { index: false } }

export default async function BatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params
  const session = await requireSession(`/me/statements/${batchId}`)
  if (!isUuid(batchId)) notFound()
  const db = dbAs(session.accessToken)
  // RLS: the account's owner and finance/admin staff only.
  const batch = await getBatch(db, batchId)
  if (!batch) notFound()
  const [rows, account, staff] = await Promise.all([
    listBatchRows(db, batch.id),
    getAccount(db, batch.receiving_account_id),
    isStaff(db, FINANCE_ROLES),
  ])
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1)

  const ambiguous = counts.get("ambiguous") ?? 0

  return (
    <MeDetail>
      <PageHeader back={{ href: "/me/statements", label: "Tải sao kê" }} title={`Sao kê lần #${batch.batch_no}`} />

      <dl className="grid gap-x-6 gap-y-4 card p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-4 [&>*]:min-w-0">
        <div className="min-w-0">
          <dt className="text-sm text-muted">Tài khoản</dt>
          <dd className="mt-1 font-medium break-words text-fg">{account ? accountLabel(account) : "—"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-sm text-muted">Định dạng</dt>
          <dd className="mt-1 font-mono break-words text-fg">{batch.parser}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Khoảng thời gian</dt>
          <dd className="mt-1 text-fg">
            {batch.period_from || batch.period_to
              ? `${formatDate(batch.period_from)} – ${formatDate(batch.period_to)}`
              : "File không ghi"}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Tải lúc</dt>
          <dd className="mt-1 text-fg">{formatDateTime(batch.staged_at)}</dd>
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <dt className="text-sm text-muted">Kết quả</dt>
          <dd className="mt-1 font-medium break-words text-fg">
            {(["imported", "duplicate", "ambiguous", "ready"] as const)
              .filter((status) => counts.has(status))
              .map((status) => `${counts.get(status)} ${rowStatusLabel(status).toLowerCase()}`)
              .join(" · ") || "—"}
          </dd>
        </div>
      </dl>

      {ambiguous > 0 && (
        <Callout tone="warning">
          Các dòng &quot;chờ nhân viên tài chính&quot; chưa được ghi thành giao dịch. Nhân viên tài chính của Give sẽ
          đối chiếu từng dòng và ghi lại lý do.
          {staff && (
            <>
              {" "}
              <Link href="/admin/statements" className="link">
                Mở hàng chờ xử lý →
              </Link>
            </>
          )}
        </Callout>
      )}

      <section aria-labelledby="rows-heading" className="min-w-0">
        <h2 id="rows-heading" className="mb-6 text-h2">
          Các dòng của sao kê ({rows.length})
        </h2>
        {rows.length === 0 ? (
          <EmptyState title="File này không có dòng giao dịch nào." />
        ) : (
          <div
            role="region"
            aria-label="Bảng các dòng sao kê (cuộn ngang)"
            tabIndex={0}
            className="overflow-x-auto card"
          >
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="border-b border-border bg-surface text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Dòng
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Ngày
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Số tiền
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Nội dung
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Số dư sau
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Trạng thái
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-fg">
                {rows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-4 py-3 text-muted tabular-nums">{row.row_no}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.booked_date_only ? formatDate(row.booked_at) : formatDateTime(row.booked_at)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-semibold whitespace-nowrap tabular-nums ${row.direction === "in" ? "text-primary" : "text-fg"}`}
                    >
                      {signedAmount(row.direction, row.amount)}
                    </td>
                    <td className="max-w-xs px-4 py-3 break-words">
                      {row.description ?? "—"}
                      {row.counterparty_name && <div className="text-sm text-muted">{row.counterparty_name}</div>}
                      {row.provider_tx_id && (
                        <div className="font-mono text-sm break-all text-muted">{row.provider_tx_id}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                      {row.balance_after === null ? "—" : formatVnd(row.balance_after)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={ROW_TONES[row.status]}>{rowStatusLabel(row.status)}</Badge>
                      {row.ambiguous_reason && (
                        <div className="mt-1 text-sm text-fg">{ambiguousReasonLabel(row.ambiguous_reason)}</div>
                      )}
                      {row.resolution && (
                        <div className="mt-1 text-sm text-fg">
                          {RESOLUTION_LABELS[row.resolution]}, {formatDateTime(row.resolved_at)}: {row.resolution_note}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </MeDetail>
  )
}
