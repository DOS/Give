import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

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
  type RowStatus,
} from "@/lib/statement-import"
import { dbAs } from "@/lib/supabase"

export const metadata: Metadata = { title: "Sao kê đã tải", robots: { index: false } }

const STATUS_CLASSES: Record<RowStatus, string> = {
  ready: "text-gray-600",
  duplicate: "text-gray-500",
  ambiguous: "font-semibold text-amber-700",
  imported: "text-green-700",
}

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

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <div>
        <Link href="/me/statements" className="text-sm text-gray-600 hover:text-gray-900">
          ← Tải sao kê
        </Link>
        <h1 className="mt-2 text-3xl font-bold">Sao kê lần #{batch.batch_no}</h1>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">Tài khoản</dt>
            <dd>{account ? accountLabel(account) : "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Định dạng</dt>
            <dd className="font-mono">{batch.parser}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Khoảng thời gian</dt>
            <dd>
              {batch.period_from || batch.period_to
                ? `${formatDate(batch.period_from)} – ${formatDate(batch.period_to)}`
                : "File không ghi"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Tải lúc</dt>
            <dd>{formatDateTime(batch.staged_at)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-gray-500">Kết quả</dt>
            <dd>
              {(["imported", "duplicate", "ambiguous", "ready"] as const)
                .filter((status) => counts.has(status))
                .map((status) => `${counts.get(status)} ${rowStatusLabel(status).toLowerCase()}`)
                .join(" · ") || "—"}
            </dd>
          </div>
        </dl>
        {(counts.get("ambiguous") ?? 0) > 0 && (
          <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
            Các dòng &quot;chờ nhân viên tài chính&quot; chưa được ghi thành giao dịch. Nhân viên tài chính của Give sẽ
            đối chiếu từng dòng và ghi lại lý do.
            {staff && (
              <>
                {" "}
                <Link href="/admin/statements" className="font-medium text-brand-600">
                  Mở hàng chờ xử lý →
                </Link>
              </>
            )}
          </p>
        )}
      </div>

      <div className="overflow-x-auto card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-gray-500">
            <tr>
              <th className="p-3 font-medium">Dòng</th>
              <th className="p-3 font-medium">Ngày</th>
              <th className="p-3 text-right font-medium">Số tiền</th>
              <th className="p-3 font-medium">Nội dung</th>
              <th className="p-3 text-right font-medium">Số dư sau</th>
              <th className="p-3 font-medium">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-gray-100 align-top last:border-0">
                <td className="p-3 text-gray-500">{row.row_no}</td>
                <td className="p-3 whitespace-nowrap">
                  {row.booked_date_only ? formatDate(row.booked_at) : formatDateTime(row.booked_at)}
                </td>
                <td
                  className={`p-3 text-right font-medium whitespace-nowrap ${row.direction === "in" ? "text-green-700" : "text-red-700"}`}
                >
                  {signedAmount(row.direction, row.amount)}
                </td>
                <td className="max-w-xs p-3 break-words">
                  {row.description ?? "—"}
                  {row.counterparty_name && <div className="text-gray-500">{row.counterparty_name}</div>}
                  {row.provider_tx_id && <div className="font-mono text-xs text-gray-400">{row.provider_tx_id}</div>}
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  {row.balance_after === null ? "—" : formatVnd(row.balance_after)}
                </td>
                <td className="p-3">
                  <span className={STATUS_CLASSES[row.status]}>{rowStatusLabel(row.status)}</span>
                  {row.ambiguous_reason && (
                    <div className="text-xs text-gray-600">{ambiguousReasonLabel(row.ambiguous_reason)}</div>
                  )}
                  {row.resolution && (
                    <div className="text-xs text-gray-600">
                      {RESOLUTION_LABELS[row.resolution]}, {formatDateTime(row.resolved_at)}: {row.resolution_note}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
