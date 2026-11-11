import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { ActionForm, SubmitButton } from "@/components/forms"
import { ButtonLink } from "@/components/ui/Button"
import { Callout } from "@/components/ui/Callout"
import { EmptyState } from "@/components/ui/EmptyState"
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
import { inboundExplanationLabel } from "@/lib/statement"
import { dbAs } from "@/lib/supabase"

import { AdminPage, AdminSection, DataTable, ItemActions, ItemCard, ItemList } from "../_components/ui"
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
    <AdminPage
      title="Đối soát sao kê"
      action={
        <ButtonLink href="/me/statements" variant="secondary">
          Tải sao kê
        </ButtonLink>
      }
      intro={
        <p>
          Các dòng sao kê dưới đây chưa được ghi thành giao dịch vì Give không chắc chúng là giao dịch mới hay lặp lại
          một giao dịch đã ghi. Đối chiếu với sao kê trên trang của chính ngân hàng rồi chọn một cách xử lý. Ghi chú là
          bắt buộc; mỗi lần xử lý được ghi vào nhật ký kiểm toán và không đổi được.
        </p>
      }
    >
      <AdminSection
        id="queue"
        title="Chờ xử lý"
        count={total > queue.length ? `${queue.length} đầu tiên / ${total}` : total}
      >
        {queue.length === 0 ? (
          <EmptyState title="Không có dòng sao kê nào chờ xử lý.">
            Dòng sao kê Give không chắc là mới hay lặp lại sẽ hiện ở đây.
          </EmptyState>
        ) : (
          <ItemList>
            {queue.map((row, i) => (
              <QueueCard
                key={row.id}
                row={row}
                account={labels.get(row.batch.receiving_account_id)}
                candidate={row.candidate_row_id ? candidates.get(row.candidate_row_id) : undefined}
                targets={targets[i]}
              />
            ))}
          </ItemList>
        )}
      </AdminSection>

      <AdminSection id="resolved" title="Đã xử lý gần đây" count={resolved.length}>
        {resolved.length === 0 ? (
          <EmptyState title="Chưa có dòng nào được xử lý." />
        ) : (
          <DataTable label="Dòng sao kê đã xử lý gần đây" head={["Dòng sao kê", "Cách xử lý", "Ghi chú", "Xử lý lúc"]}>
            {resolved.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3">
                  <p className="font-semibold text-fg tabular-nums">{signedAmount(row.direction, row.amount)}</p>
                  <p className="text-muted">
                    {bookedLabel(row)} · {labels.get(row.batch.receiving_account_id) ?? "—"} · lần #{row.batch.batch_no}{" "}
                    dòng {row.row_no}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <p className="font-semibold text-fg">{row.resolution ? RESOLUTION_LABELS[row.resolution] : "—"}</p>
                  <p className="text-muted">
                    {rowStatusLabel(row.status)}. Lý do vào hàng chờ: {ambiguousReasonLabel(row.ambiguous_reason)}
                  </p>
                </td>
                <td className="max-w-xs px-4 py-3 break-words">{row.resolution_note}</td>
                <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDateTime(row.resolved_at)}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </AdminSection>

      {isAdmin && <AuditTrail entries={audit} names={staffEmails} />}
    </AdminPage>
  )
}

function RowFacts({ row }: { row: StatementRowView }) {
  return (
    <>
      <span className={`font-semibold tabular-nums ${row.direction === "in" ? "text-primary" : "text-danger"}`}>
        {signedAmount(row.direction, row.amount)}
      </span>{" "}
      · {bookedLabel(row)} · {row.description ?? "không có nội dung"}
      {row.counterparty_name ? ` · ${row.counterparty_name}` : ""}
      {row.balance_after !== null ? ` · số dư sau ${formatVnd(row.balance_after)}` : ""}
      {row.provider_tx_id ? (
        <span className="text-muted">
          {" "}
          · <span className="font-mono text-base">{row.provider_tx_id}</span>
        </span>
      ) : null}
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
    <ItemCard>
      <div className="space-y-3">
        <p className="text-sm text-muted">
          {account ?? "Tài khoản"} ·{" "}
          <Link href={`/me/statements/${row.batch.id}`} className="link">
            lần tải #{row.batch.batch_no}
          </Link>{" "}
          ({row.batch.parser}) · dòng {row.row_no}
        </p>
        <p className="break-words text-fg">
          <RowFacts row={row} />
        </p>
        <Callout tone="warning">{ambiguousReasonLabel(row.ambiguous_reason)}</Callout>
        {candidate && (
          <p className="rounded-md bg-surface p-4 text-sm break-words">
            Khớp với dòng {candidate.row_no} của một lần tải trước ({rowStatusLabel(candidate.status).toLowerCase()}):{" "}
            <RowFacts row={candidate} />
          </p>
        )}
      </div>

      <ItemActions>
        <ActionForm
          action={resolveStatementRow.bind(null, row.id)}
          confirm="Đánh dấu dòng này là giao dịch đã ghi? Dòng sẽ không được ghi thêm lần nữa."
          className="space-y-4"
        >
          <input type="hidden" name="resolution" value="duplicate" />
          <p className="label">{RESOLUTION_LABELS.duplicate}</p>
          {targets.shown.length === 0 ? (
            <p className="text-sm text-muted">
              Không có giao dịch đã ghi nào cùng chiều, cùng số tiền trong vòng {DUPLICATE_WINDOW_DAYS} ngày.
            </p>
          ) : (
            <>
              <fieldset className="space-y-1 text-sm">
                <legend className="sr-only">Giao dịch mà dòng này lặp lại</legend>
                {targets.shown.map((tx) => (
                  <label
                    key={tx.id}
                    className="flex min-w-0 cursor-pointer items-start gap-3 rounded p-3 transition-colors duration-150 hover:bg-surface has-[:checked]:bg-primary-soft"
                  >
                    <input
                      type="radio"
                      name="bank_transaction_id"
                      value={tx.id}
                      required
                      defaultChecked={tx.id === candidateTx}
                      className="mt-1 size-4 shrink-0 accent-primary"
                    />
                    <span className="min-w-0 break-words">
                      {bookedLabel(tx)} · <span className="tabular-nums">{formatVnd(tx.amount)}</span> ·{" "}
                      {tx.description ?? "—"}
                      {tx.counterparty_name ? ` · ${tx.counterparty_name}` : ""}{" "}
                      <span className="font-mono text-base text-muted">{tx.provider_tx_id}</span>
                      {tx.id === candidateTx && <span className="text-muted"> (dòng trước ứng với giao dịch này)</span>}
                    </span>
                  </label>
                ))}
              </fieldset>
              {targets.total > targets.shown.length && (
                <Callout tone="warning">
                  Còn {targets.total - targets.shown.length} giao dịch khác cùng số tiền xa ngày hơn không hiện ở đây.
                  Nếu không thấy đúng giao dịch, đừng chọn đại một giao dịch.
                </Callout>
              )}
              <NoteField id={`dup-note-${row.id}`} />
              <SubmitButton className="btn-secondary">Là giao dịch đã ghi</SubmitButton>
            </>
          )}
        </ActionForm>

        <ActionForm
          action={resolveStatementRow.bind(null, row.id)}
          confirm="Nhập dòng này thành một giao dịch mới? Số tiền sẽ được tính vào sao kê của chiến dịch và không xóa được."
          className="space-y-4"
        >
          <input type="hidden" name="resolution" value="import" />
          <p className="label">{RESOLUTION_LABELS.import}</p>
          <p className="text-sm text-muted">
            Chỉ chọn khi bạn đã thấy giao dịch này trên sao kê của ngân hàng và nó chưa được ghi.
          </p>
          {row.candidate_row_id && (
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                name="override_candidate"
                required
                className="mt-1 size-4 shrink-0 accent-primary"
              />
              <span className="min-w-0">
                Tôi đã đối chiếu: đây là giao dịch khác với dòng {candidate ? `${candidate.row_no} ` : ""}của lần tải
                trước.
              </span>
            </label>
          )}
          <NoteField id={`import-note-${row.id}`} />
          <SubmitButton>Nhập thành giao dịch mới</SubmitButton>
        </ActionForm>
      </ItemActions>
    </ItemCard>
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
  if (entry.action === "bank_transaction.explain_inbound") {
    const kind = typeof after.kind === "string" ? inboundExplanationLabel(after.kind) : "—"
    const reason = typeof after.reason === "string" ? after.reason : ""
    const evidence = typeof after.evidence === "string" ? after.evidence : ""
    return `${formatVnd(Number(after.amount ?? 0))} chuyển từ "chưa khớp" sang "không phải tiền ủng hộ" (${kind}): ${reason}. Bằng chứng: ${evidence}`
  }
  return ""
}

function AuditTrail({ entries, names }: { entries: AuditEntry[]; names: Map<string, string> }) {
  return (
    <AdminSection
      id="audit"
      title="Nhật ký kiểm toán"
      count={entries.length}
      lead="Xử lý dòng sao kê, khớp tay và giải trình tiền vào gần đây. Chỉ quản trị viên xem được."
    >
      {entries.length === 0 ? (
        <EmptyState title="Chưa có mục nào." />
      ) : (
        <DataTable label="Nhật ký kiểm toán đối soát" head={["Thao tác", "Chi tiết", "Người thực hiện", "Lúc"]}>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td className="px-4 py-3 font-medium text-fg">{AUDIT_ACTION_LABELS[entry.action] ?? entry.action}</td>
              <td className="max-w-md px-4 py-3 break-words">{auditSummary(entry)}</td>
              <td className="px-4 py-3 break-all">
                {entry.actor_id ? (names.get(entry.actor_id) ?? entry.actor_id) : "—"}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDateTime(entry.created_at)}</td>
            </tr>
          ))}
        </DataTable>
      )}
    </AdminSection>
  )
}
