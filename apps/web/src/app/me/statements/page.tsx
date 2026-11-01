import type { Metadata } from "next"
import Link from "next/link"

import { requireSession } from "@/lib/auth/session"
import { isStaff } from "@/lib/campaigns"
import { formatDate, formatDateTime } from "@/lib/format"
import { FINANCE_ROLES } from "@/lib/receiving-accounts"
import {
  accountLabel,
  accountLabels,
  countWaitingRows,
  listBatches,
  listUploadAccounts,
  MAX_UPLOAD_BYTES,
} from "@/lib/statement-import"
import { dbAs } from "@/lib/supabase"
import { statementParsers } from "@/server/statement-parsers"

import { uploadStatement } from "./actions"
import { UploadForm, type UploadChoice } from "./UploadForm"

export const metadata: Metadata = { title: "Tải sao kê", robots: { index: false } }

// The upload action processes the file inline; this stays below the inbound
// reprocess grace period (src/server/inbound REPROCESS_GRACE_MS).
export const maxDuration = 60

export default async function StatementsPage() {
  const session = await requireSession("/me/statements")
  const db = dbAs(session.accessToken)
  const staff = await isStaff(db, FINANCE_ROLES)
  const [accounts, batches] = await Promise.all([listUploadAccounts(db, session.user.id, staff), listBatches(db)])
  const [waiting, labels] = await Promise.all([
    countWaitingRows(
      db,
      batches.map((b) => b.id)
    ),
    accountLabels(
      db,
      batches.map((b) => b.receiving_account_id)
    ),
  ])
  const choices: UploadChoice[] = accounts.map((account) => ({
    id: account.id,
    label: `${accountLabel(account)}${account.owner_user_id === session.user.id ? "" : " (của người tổ chức khác)"}`,
    parsers: account.bank_bin
      ? statementParsers.forBank(account.bank_bin).map((p) => ({ name: p.name, label: p.label }))
      : [],
  }))

  return (
    <div className="mx-auto max-w-4xl space-y-10 px-4 py-10">
      <div>
        <Link href="/me/accounts" className="text-sm text-gray-600 hover:text-gray-900">
          ← Tài khoản nhận tiền
        </Link>
        <h1 className="mt-2 text-3xl font-bold">Tải sao kê ngân hàng</h1>
        <p className="mt-2 text-gray-600">
          Tải file sao kê của tài khoản nhận để Give ghi các khoản tiền vào, tiền ra và khớp với lượt ủng hộ theo mã ủng
          hộ. Dòng nào Give chưa chắc (có thể trùng với lần tải trước, số dư không liền mạch) sẽ chờ nhân viên tài chính
          xem, không bao giờ bị bỏ qua. Tiền vào không có mã ủng hộ được ghi là &quot;chưa khớp&quot;; bạn khớp tay ở
          trang quản lý chiến dịch.
        </p>
      </div>

      <section>
        <h2 className="mb-4 text-xl font-bold">Tải sao kê mới</h2>
        {choices.length === 0 ? (
          <p className="card p-6 text-gray-600">
            Bạn chưa có tài khoản nhận nào nhận tiền qua sao kê.{" "}
            <Link href="/me/accounts" className="font-medium text-brand-600">
              Khai báo tài khoản
            </Link>
          </p>
        ) : (
          <UploadForm action={uploadStatement} accounts={choices} maxBytes={MAX_UPLOAD_BYTES} />
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold">Các lần tải gần đây ({batches.length})</h2>
        {batches.length === 0 ? (
          <p className="card p-6 text-gray-600">Chưa có sao kê nào được tải lên.</p>
        ) : (
          <div className="overflow-x-auto card">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-500">
                <tr>
                  <th className="p-3 font-medium">Lần</th>
                  <th className="p-3 font-medium">Tài khoản</th>
                  <th className="p-3 font-medium">Khoảng thời gian</th>
                  <th className="p-3 font-medium">Số dòng</th>
                  <th className="p-3 font-medium">Tải lúc</th>
                  <th className="p-3 font-medium">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => {
                  const left = waiting.get(batch.id) ?? 0
                  return (
                    <tr key={batch.id} className="border-b border-gray-100 last:border-0">
                      <td className="p-3">
                        <Link href={`/me/statements/${batch.id}`} className="font-medium text-brand-600">
                          #{batch.batch_no}
                        </Link>
                      </td>
                      <td className="p-3">{labels.get(batch.receiving_account_id) ?? "Tài khoản khác"}</td>
                      <td className="p-3">
                        {batch.period_from || batch.period_to
                          ? `${formatDate(batch.period_from)} – ${formatDate(batch.period_to)}`
                          : "—"}
                      </td>
                      <td className="p-3">{batch.row_count}</td>
                      <td className="p-3">{formatDateTime(batch.staged_at)}</td>
                      <td className="p-3">
                        {left > 0 ? (
                          <span className="text-amber-700">{left} dòng chờ nhân viên tài chính</span>
                        ) : batch.imported_at ? (
                          <span className="text-green-700">Đã nhập</span>
                        ) : (
                          <span className="text-gray-600">Đang xử lý</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
