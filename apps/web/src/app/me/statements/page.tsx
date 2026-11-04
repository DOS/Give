import type { Metadata } from "next"
import Link from "next/link"

import { Badge } from "@/components/ui/Badge"
import { ButtonLink } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { PageHeader } from "@/components/ui/PageHeader"
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

import { MeDetail } from "../_components/MePage"
import { Panel } from "../_components/Panel"

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
    <MeDetail>
      <PageHeader back={{ href: "/me/accounts", label: "Tài khoản nhận tiền" }} title="Tải sao kê ngân hàng">
        Tải file sao kê của tài khoản nhận để Give ghi các khoản tiền vào, tiền ra và khớp với lượt ủng hộ theo mã ủng
        hộ. Dòng nào Give chưa chắc (có thể trùng với lần tải trước, số dư không liền mạch) sẽ chờ nhân viên tài chính
        xem, không bao giờ bị bỏ qua. Tiền vào không có mã ủng hộ được ghi là &quot;chưa khớp&quot;; bạn khớp tay ở
        trang quản lý chiến dịch.
      </PageHeader>

      <Panel id="upload" title="Tải sao kê mới">
        {choices.length === 0 ? (
          <EmptyState
            title="Bạn chưa có tài khoản nhận nào nhận tiền qua sao kê."
            action={<ButtonLink href="/me/accounts">Khai báo tài khoản</ButtonLink>}
          />
        ) : (
          <UploadForm action={uploadStatement} accounts={choices} maxBytes={MAX_UPLOAD_BYTES} />
        )}
      </Panel>

      <section aria-labelledby="batches-heading">
        <h2 id="batches-heading" className="mb-4 text-xl font-semibold tracking-tight">
          Các lần tải gần đây ({batches.length})
        </h2>
        {batches.length === 0 ? (
          <EmptyState title="Chưa có sao kê nào được tải lên." />
        ) : (
          <div role="region" aria-label="Bảng các lần tải (cuộn ngang)" tabIndex={0} className="overflow-x-auto card">
            <table className="w-full min-w-[44rem] text-left">
              <thead className="border-b border-line bg-surface text-sm text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Lần
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Tài khoản
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Khoảng thời gian
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Số dòng
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Tải lúc
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Trạng thái
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {batches.map((batch) => {
                  const left = waiting.get(batch.id) ?? 0
                  return (
                    <tr key={batch.id} className="align-top">
                      <td className="px-4 py-3">
                        <Link
                          href={`/me/statements/${batch.id}`}
                          className="inline-flex min-h-11 items-center link tabular-nums"
                        >
                          #{batch.batch_no}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{labels.get(batch.receiving_account_id) ?? "Tài khoản khác"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {batch.period_from || batch.period_to
                          ? `${formatDate(batch.period_from)} – ${formatDate(batch.period_to)}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{batch.row_count}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(batch.staged_at)}</td>
                      <td className="px-4 py-3">
                        {left > 0 ? (
                          <Badge tone="warning">{left} dòng chờ nhân viên tài chính</Badge>
                        ) : batch.imported_at ? (
                          <Badge tone="brand">Đã nhập</Badge>
                        ) : (
                          <Badge>Đang xử lý</Badge>
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
    </MeDetail>
  )
}
