import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { ActionForm, SubmitButton } from "@/components/forms"
import { requireSession } from "@/lib/auth/session"
import { isStaff } from "@/lib/campaigns"
import { formatDate, formatDateTime, formatVnd } from "@/lib/format"
import { FINANCE_ROLES } from "@/lib/receiving-accounts"
import { listStaff } from "@/lib/staff"
import {
  accountLabels,
  ambiguousReasonLabel,
  AUDIT_ACTION_LABELS,
  DUPLICATE_WINDOW_DAYS,
  getRows,
  listAmbiguousRows,
  listDuplicateTargets,
  listReconciliationAudit,
  listResolvedRows,
  RESOLUTION_LABELS,
  rowStatusLabel,
  signedAmount,
  type AuditEntry,
  type QueueRow,
  type DuplicateTargets,
  type StatementRowView,
} from "@/lib/statement-import"
import { dbAs } from "@/lib/supabase"

import { resolveStatementRow } from "./actions"

export const metadata: Metadata = { title: "Đối soát sao kê", robots: { index: false } }

function bookedLabel(row: { booked_at: string; booked_date_only: boolean }): string {
  return row.booked_date_only ? formatDate(row.booked_at) : formatDateTime(row.booked_at)
}

export default async function AdminStatementsPage() {
  const session = await requireSession("/admin/statements")
  const db = dbAs(session.accessToken)
  // Finance and admin staff only; others get a 404.
  if (!(await isStaff(db, FINANCE_ROLES))) notFound()

  const [{ rows: queue, total }, resolved, isAdmin] = await Promise.all([
    listAmbiguousRows(db),
    listResolvedRows(db),
    isStaff(db, ["admin"]),
  ])
  const candidates = await getRows(
    db,
    queue.map((row) => row.candidate_row_id).filter((id): id is string => Boolean(id))
  )
  const [targets, labels, audit, staff] = await Promise.all([
    Promise.all(
      queue.map((row) =>
        listDuplicateTargets(
          db,
          row,
          row.batch.receiving_account_id,
          row.candidate_row_id ? (candidates.get(row.candidate_row_id)?.bank_transaction_id ?? null) : null
        )
      )
    ),
    accountLabels(
      db,
      [...queue, ...resolved].map((row) => row.batch.receiving_account_id)
    ),
    // give.audit_log and the staff list are readable by admins only.
    isAdmin ? listReconciliationAudit(db) : Promise.resolve([]),
    isAdmin ? listStaff(db) : Promise.resolve([]),
  ])
  const staffEmails = new Map(staff.map((s) => [s.user_id, s.email ?? s.display_name ?? s.user_id]))

  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-10">
      <div>
        <Link href="/admin/accounts" className="text-sm text-gray-600 hover:text-gray-900">
          ← Xác minh tài khoản nhận
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-bold">Đối soát sao kê</h1>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/unmatched" className="btn-secondary">
              Giao dịch chưa khớp
            </Link>
            <Link href="/me/statements" className="btn-secondary">
              Tải sao kê
            </Link>
          </div>
        </div>
        <p className="mt-2 text-sm text-gray-600">
          Các dòng sao kê dưới đây chưa được ghi thành giao dịch vì Give không chắc chúng là giao dịch mới hay lặp lại
          một giao dịch đã ghi. Đối chiếu với sao kê trên trang của chính ngân hàng rồi chọn một cách xử lý. Ghi chú là
          bắt buộc; mỗi lần xử lý được ghi vào nhật ký kiểm toán và không đổi được.
        </p>
      </div>

      <section>
        <h2 className="mb-4 text-xl font-bold">
          Chờ xử lý ({total > queue.length ? `${queue.length} đầu tiên / ${total}` : total})
        </h2>
        {queue.length === 0 ? (
          <p className="card p-6 text-gray-600">Không có dòng sao kê nào chờ xử lý.</p>
        ) : (
          <ul className="space-y-4">
            {queue.map((row, i) => (
              <QueueCard
                key={row.id}
                row={row}
                account={labels.get(row.batch.receiving_account_id)}
                candidate={row.candidate_row_id ? candidates.get(row.candidate_row_id) : undefined}
                targets={targets[i]}
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold">Đã xử lý gần đây ({resolved.length})</h2>
        {resolved.length === 0 ? (
          <p className="card p-6 text-gray-600">Chưa có dòng nào được xử lý.</p>
        ) : (
          <ul className="divide-y divide-gray-100 card text-sm">
            {resolved.map((row) => (
              <li key={row.id} className="space-y-1 p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <span>
                    <span className="font-medium">{signedAmount(row.direction, row.amount)}</span> · {bookedLabel(row)}{" "}
                    · {labels.get(row.batch.receiving_account_id) ?? "—"} · lần #{row.batch.batch_no} dòng {row.row_no}
                  </span>
                  <span className="text-gray-500">{formatDateTime(row.resolved_at)}</span>
                </div>
                <div>
                  <span className="font-semibold">{row.resolution ? RESOLUTION_LABELS[row.resolution] : "—"}</span> (
                  {rowStatusLabel(row.status).toLowerCase()}). Lý do vào hàng chờ:{" "}
                  {ambiguousReasonLabel(row.ambiguous_reason)}
                </div>
                <div className="text-gray-700">Ghi chú: {row.resolution_note}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isAdmin && <AuditTrail entries={audit} names={staffEmails} />}
    </div>
  )
}

function RowFacts({ row }: { row: StatementRowView }) {
  return (
    <>
      <span className={`font-semibold ${row.direction === "in" ? "text-green-700" : "text-red-700"}`}>
        {signedAmount(row.direction, row.amount)}
      </span>{" "}
      · {bookedLabel(row)} · {row.description ?? "không có nội dung"}
      {row.counterparty_name ? ` · ${row.counterparty_name}` : ""}
      {row.balance_after !== null ? ` · số dư sau ${formatVnd(row.balance_after)}` : ""}
      {row.provider_tx_id ? <span className="font-mono text-gray-500"> · {row.provider_tx_id}</span> : null}
    </>
  )
}

function QueueCard({
  row,
  account,
  candidate,
  targets,
}: {
  row: QueueRow
  account: string | undefined
  candidate: StatementRowView | undefined
  targets: DuplicateTargets
}) {
  const candidateTx = candidate?.bank_transaction_id ?? null
  return (
    <li className="space-y-4 card p-6">
      <div className="space-y-2 text-sm">
        <p className="text-gray-500">
          {account ?? "Tài khoản"} ·{" "}
          <Link href={`/me/statements/${row.batch.id}`} className="text-brand-600">
            lần tải #{row.batch.batch_no}
          </Link>{" "}
          ({row.batch.parser}) · dòng {row.row_no}
        </p>
        <p className="text-base">
          <RowFacts row={row} />
        </p>
        <p className="text-amber-800">{ambiguousReasonLabel(row.ambiguous_reason)}</p>
        {candidate && (
          <p className="rounded-md bg-gray-50 p-3">
            Khớp với dòng {candidate.row_no} của một lần tải trước ({rowStatusLabel(candidate.status).toLowerCase()}):{" "}
            <RowFacts row={candidate} />
          </p>
        )}
      </div>

      <div className="grid gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2">
        <ActionForm
          action={resolveStatementRow.bind(null, row.id)}
          confirm="Đánh dấu dòng này là giao dịch đã ghi? Dòng sẽ không được ghi thêm lần nữa."
          className="space-y-2"
        >
          <input type="hidden" name="resolution" value="duplicate" />
          <p className="label">{RESOLUTION_LABELS.duplicate}</p>
          {targets.shown.length === 0 ? (
            <p className="text-sm text-gray-600">
              Không có giao dịch đã ghi nào cùng chiều, cùng số tiền trong vòng {DUPLICATE_WINDOW_DAYS} ngày.
            </p>
          ) : (
            <>
              <fieldset className="space-y-1 text-sm">
                <legend className="sr-only">Giao dịch mà dòng này lặp lại</legend>
                {targets.shown.map((tx) => (
                  <label key={tx.id} className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="bank_transaction_id"
                      value={tx.id}
                      required
                      defaultChecked={tx.id === candidateTx}
                      className="mt-1"
                    />
                    <span>
                      {bookedLabel(tx)} · {formatVnd(tx.amount)} · {tx.description ?? "—"}
                      {tx.counterparty_name ? ` · ${tx.counterparty_name}` : ""}{" "}
                      <span className="font-mono text-gray-500">{tx.provider_tx_id}</span>
                      {tx.id === candidateTx && (
                        <span className="text-gray-600"> (dòng trước ứng với giao dịch này)</span>
                      )}
                    </span>
                  </label>
                ))}
              </fieldset>
              {targets.total > targets.shown.length && (
                <p className="text-sm text-amber-800">
                  Còn {targets.total - targets.shown.length} giao dịch khác cùng số tiền xa ngày hơn không hiện ở đây.
                  Nếu không thấy đúng giao dịch, đừng chọn đại một giao dịch.
                </p>
              )}
              <NoteField id={`dup-note-${row.id}`} />
              <SubmitButton className="btn-secondary">Là giao dịch đã ghi</SubmitButton>
            </>
          )}
        </ActionForm>

        <ActionForm
          action={resolveStatementRow.bind(null, row.id)}
          confirm="Nhập dòng này thành một giao dịch mới? Số tiền sẽ được tính vào sao kê của chiến dịch và không xóa được."
          className="space-y-2"
        >
          <input type="hidden" name="resolution" value="import" />
          <p className="label">{RESOLUTION_LABELS.import}</p>
          <p className="text-sm text-gray-600">
            Chỉ chọn khi bạn đã thấy giao dịch này trên sao kê của ngân hàng và nó chưa được ghi.
          </p>
          {row.candidate_row_id && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="override_candidate" required className="mt-1" />
              <span>
                Tôi đã đối chiếu: đây là giao dịch khác với dòng {candidate ? `${candidate.row_no} ` : ""}của lần tải
                trước.
              </span>
            </label>
          )}
          <NoteField id={`import-note-${row.id}`} />
          <SubmitButton>Nhập thành giao dịch mới</SubmitButton>
        </ActionForm>
      </div>
    </li>
  )
}

function NoteField({ id }: { id: string }) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        Ghi chú
      </label>
      <textarea
        id={id}
        name="note"
        className="field"
        rows={2}
        required
        maxLength={1000}
        placeholder="Ghi chú bắt buộc: đã đối chiếu với nguồn nào (sao kê trên trang ngân hàng, ngày giờ, mã giao dịch)"
      />
    </>
  )
}

function auditSummary(entry: AuditEntry): string {
  const after = entry.after ?? {}
  if (entry.action === "statement_import_row.resolve") {
    const resolution = after.resolution === "import" || after.resolution === "duplicate" ? after.resolution : null
    const note = typeof after.note === "string" ? after.note : ""
    return `${resolution ? RESOLUTION_LABELS[resolution] : "—"}${after.override_candidate === true ? " (xác nhận khác dòng trước)" : ""}: ${note}`
  }
  if (entry.action === "bank_transaction.manual_match") {
    return `${formatVnd(Number(after.amount ?? 0))} chuyển từ "chưa khớp" sang "đã khớp", lượt ủng hộ ${String(after.contribution_id ?? "—")}`
  }
  return ""
}

function AuditTrail({ entries, names }: { entries: AuditEntry[]; names: Map<string, string> }) {
  return (
    <section>
      <h2 className="mb-2 text-xl font-bold">Nhật ký kiểm toán ({entries.length})</h2>
      <p className="mb-4 text-sm text-gray-600">Xử lý dòng sao kê và khớp tay gần đây. Chỉ quản trị viên xem được.</p>
      {entries.length === 0 ? (
        <p className="card p-6 text-gray-600">Chưa có mục nào.</p>
      ) : (
        <ul className="divide-y divide-gray-100 card text-sm">
          {entries.map((entry) => (
            <li key={entry.id} className="space-y-1 p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">{AUDIT_ACTION_LABELS[entry.action] ?? entry.action}</span>
                <span className="text-gray-500">{formatDateTime(entry.created_at)}</span>
              </div>
              <div className="text-gray-700">{auditSummary(entry)}</div>
              <div className="text-gray-500">
                Người thực hiện: {entry.actor_id ? (names.get(entry.actor_id) ?? entry.actor_id) : "—"}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
