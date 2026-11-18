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
  accountOwners,
  allowsNotATransaction,
  ambiguousReasonLabel,
  AUDIT_ACTION_LABELS,
  DUPLICATE_WINDOW_DAYS,
  getCandidateRows,
  getReviewSettings,
  isOwnStatementRow,
  listAccountBindings,
  listAmbiguousRows,
  listDuplicateTargets,
  listReconciliationAudit,
  listResolvedRows,
  listTrustBlocks,
  reconciliationAuditSummary,
  RESOLUTION_LABELS,
  resolutionLabel,
  rowStatusLabel,
  signedAmount,
  type AuditEntry,
  type DuplicateTargets,
  type QueueRow,
  type ReviewSettings,
  type TrustBlock,
  type StatementRowView,
} from "@/lib/statement-import"
import { dbAs, dbService } from "@/lib/supabase"

import { AdminPage, AdminSection, DataTable, ItemActions, ItemCard, ItemList } from "../_components/ui"
import { resolveStatementRow, restoreCampaignTrust, setReviewDailyLimit, setReviewThreshold } from "./actions"
import { MachineId } from "@/components/ui/RefCode"

export const metadata: Metadata = { title: "Đối soát sao kê", robots: { index: false } }

function bookedLabel(row: { booked_at: string; booked_date_only: boolean }): string {
  return row.booked_date_only ? formatDate(row.booked_at) : formatDateTime(row.booked_at)
}

export default async function AdminStatementsPage() {
  const session = await requireSession("/admin/statements")
  const db = dbAs(session.accessToken)
  // Finance and admin staff only; others get a 404.
  if (!(await isStaff(db, FINANCE_ROLES))) notFound()

  const [{ rows: queue, total }, resolved, isAdmin, reviewSettings, trustBlocks] = await Promise.all([
    listAmbiguousRows(db),
    listResolvedRows(db),
    isStaff(db, ["admin"]),
    getReviewSettings(db),
    // Finance/admin only: the page returned 404 to anyone else above.
    listTrustBlocks(dbService(), session.user.id),
  ])
  const accountIds = queue.map((row) => row.batch.receiving_account_id)
  // Void candidates (not_a_transaction rows) are never offered (DOS/Give#78).
  const [{ rows: candidates, voidIds }, owners, bindings] = await Promise.all([
    getCandidateRows(
      db,
      queue.map((row) => row.candidate_row_id).filter((id): id is string => Boolean(id))
    ),
    accountOwners(db, accountIds),
    listAccountBindings(db, accountIds),
  ])
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
          bắt buộc; mỗi lần xử lý được ghi vào nhật ký kiểm toán và không đổi được. Sao kê do người tổ chức tự tải lên
          còn chờ đội tài chính duyệt cho đến khi một lần tải của chiến dịch được duyệt trọn vẹn, ở mọi dòng từ ngưỡng
          duyệt trở lên, và khi tổng trong ngày chạm giới hạn mỗi ngày.
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
                voidCandidate={row.candidate_row_id !== null && voidIds.has(row.candidate_row_id)}
                own={isOwnStatementRow(row, row.batch.receiving_account_id, session.user.id, owners, bindings)}
                targets={targets[i]}
              />
            ))}
          </ItemList>
        )}
      </AdminSection>

      <ReviewThreshold settings={reviewSettings} />

      <TrustBlocks blocks={trustBlocks} />

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
                  <p className="font-semibold text-fg">{resolutionLabel(row.resolution)}</p>
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
          · <MachineId>{row.provider_tx_id}</MachineId>
        </span>
      ) : null}
    </>
  )
}

function QueueCard({
  row,
  account,
  candidate,
  voidCandidate,
  own,
  targets,
}: {
  row: QueueRow
  account: string | undefined
  candidate: StatementRowView | undefined
  /** The row's candidate was resolved as not a transaction: nothing to line up with. */
  voidCandidate: boolean
  /** The viewer owns the account or organizes its campaign (GIVE_SELF_REVIEW). */
  own: boolean
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

      {own ? (
        <Callout tone="warning">
          Tài khoản nhận này là của bạn, hoặc dòng thuộc thời gian tài khoản gắn với chiến dịch do bạn tổ chức. Một nhân
          viên tài chính khác cần xử lý dòng này.
        </Callout>
      ) : (
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
                        <MachineId className="text-muted">{tx.provider_tx_id}</MachineId>
                        {tx.id === candidateTx && (
                          <span className="text-muted"> (dòng trước ứng với giao dịch này)</span>
                        )}
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
            {/* A void candidate is no earlier transaction: the import says so by itself. */}
            {voidCandidate && <input type="hidden" name="override_candidate" value="on" />}
            {row.candidate_row_id && !voidCandidate && (
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

          {allowsNotATransaction(row.ambiguous_reason) && (
            <ActionForm
              action={resolveStatementRow.bind(null, row.id)}
              confirm="Đánh dấu dòng này không phải giao dịch thật? Dòng sẽ được bỏ qua, không ghi vào sổ và không đổi lại được."
              className="space-y-4"
            >
              <input type="hidden" name="resolution" value="not_a_transaction" />
              <p className="label">{RESOLUTION_LABELS.not_a_transaction}</p>
              <p className="text-sm text-muted">
                {row.ambiguous_reason === "finance_review"
                  ? "Từ chối: chỉ chọn khi dòng này không có trên sao kê của tài khoản trên trang ngân hàng (sao kê bị sửa hoặc không phải của tài khoản này)."
                  : "Chỉ chọn khi dòng này không có trên sao kê thật của tài khoản (ví dụ file thử, tải nhầm tài khoản)."}
              </p>
              <NoteField
                id={`not-tx-note-${row.id}`}
                placeholder={
                  row.ambiguous_reason === "finance_review"
                    ? "Ghi chú bắt buộc: đã đối chiếu với nguồn nào và thấy gì khác (ngày giờ, số tiền, mã giao dịch)"
                    : "Ghi chú bắt buộc: vì sao không phải giao dịch thật và đã đối chiếu với nguồn nào (ví dụ: file thử, tải nhầm tài khoản)"
                }
              />
              <SubmitButton className="btn-secondary">Không phải giao dịch thật</SubmitButton>
            </ActionForm>
          )}
        </ItemActions>
      )}
    </ItemCard>
  )
}

/**
 * Campaigns whose trust a rejected row blocks (DOS/Give#57): every organizer
 * upload of them waits for review until finance restores the trust.
 */
function TrustBlocks({ blocks }: { blocks: TrustBlock[] | null }) {
  return (
    <AdminSection
      id="trust-blocks"
      title="Chiến dịch bị chặn tin cậy sao kê"
      count={blocks?.length}
      lead="Một dòng sao kê do người tổ chức tải lên đã bị từ chối, nên mọi lần tải sau của chiến dịch đều chờ đội tài chính duyệt. Chỉ khôi phục khi đã xác minh với người tổ chức và sao kê thật của ngân hàng."
    >
      {blocks === null ? (
        <Callout tone="warning">Chưa đọc được danh sách chiến dịch bị chặn. Hãy tải lại trang sau.</Callout>
      ) : blocks.length === 0 ? (
        <EmptyState title="Không có chiến dịch nào bị chặn." />
      ) : (
        <ItemList>
          {blocks.map((block) => (
            <ItemCard key={block.campaign_id}>
              <div className="space-y-2">
                <p className="font-semibold text-fg">
                  <Link href={`/campaigns/${block.slug}`} className="link">
                    {block.title}
                  </Link>
                </p>
                <p className="text-sm text-muted">
                  {block.rejected} dòng bị từ chối, lần cuối {formatDateTime(block.last_rejected_at)}
                  {block.last_restored_at ? ` · khôi phục lần trước ${formatDateTime(block.last_restored_at)}` : ""}
                </p>
              </div>
              <ItemActions>
                <ActionForm
                  action={restoreCampaignTrust.bind(null, block.campaign_id, block.rejected)}
                  confirm="Khôi phục tin cậy sao kê của chiến dịch này?"
                  className="space-y-4"
                >
                  <NoteField
                    id={`restore-note-${block.campaign_id}`}
                    placeholder="Ghi chú bắt buộc: đã xác minh gì để chiến dịch đáng tin trở lại"
                  />
                  <SubmitButton className="btn-secondary">Khôi phục tin cậy</SubmitButton>
                </ActionForm>
              </ItemActions>
            </ItemCard>
          ))}
        </ItemList>
      )}
    </AdminSection>
  )
}

/** The finance review settings of organizer uploads (DOS/Give#57), with the forms to change them. */
function ReviewThreshold({ settings }: { settings: ReviewSettings | null }) {
  return (
    <AdminSection
      id="review-threshold"
      title="Ngưỡng duyệt sao kê"
      lead="Dòng sao kê do người tổ chức tự tải lên chờ đội tài chính duyệt trước khi được ghi khi: chiến dịch chưa có lần tải nào được duyệt; số tiền (vào hoặc ra) từ ngưỡng duyệt trở lên; hoặc tổng các dòng tự ghi của chiến dịch trong một ngày chạm giới hạn mỗi ngày (chống chia nhỏ số tiền)."
    >
      {settings === null ? (
        <Callout tone="warning">Chưa đọc được ngưỡng duyệt. Hãy tải lại trang sau.</Callout>
      ) : (
        <div className="grid gap-8 md:grid-cols-2">
          <SettingForm
            id="review-threshold"
            action={setReviewThreshold}
            label="Ngưỡng duyệt mỗi dòng"
            value={settings.thresholdVnd}
            confirm="Đổi ngưỡng duyệt sao kê?"
          />
          <SettingForm
            id="review-daily-limit"
            action={setReviewDailyLimit}
            label="Giới hạn mỗi ngày của chiến dịch"
            value={settings.dailyLimitVnd}
            confirm="Đổi giới hạn mỗi ngày?"
          />
        </div>
      )}
    </AdminSection>
  )
}

function SettingForm({
  id,
  action,
  label,
  value,
  confirm,
}: {
  id: string
  action: typeof setReviewThreshold
  label: string
  value: number
  confirm: string
}) {
  return (
    <ActionForm action={action} className="space-y-4" confirm={confirm}>
      <p className="text-sm">
        {label}: <span className="font-semibold text-fg tabular-nums">{formatVnd(value)}</span>
      </p>
      <div className="space-y-1">
        <label htmlFor={`${id}-amount`} className="label">
          Giá trị mới (VND)
        </label>
        <input
          id={`${id}-amount`}
          name="threshold"
          className="field tabular-nums"
          inputMode="numeric"
          required
          maxLength={32}
          defaultValue={value.toLocaleString("vi-VN")}
        />
      </div>
      <NoteField id={`${id}-note`} placeholder="Ghi chú bắt buộc: lý do thay đổi" />
      <SubmitButton className="btn-secondary">Lưu</SubmitButton>
    </ActionForm>
  )
}

function NoteField({
  id,
  placeholder = "Ghi chú bắt buộc: đã đối chiếu với nguồn nào (sao kê trên trang ngân hàng, ngày giờ, mã giao dịch)",
}: {
  id: string
  placeholder?: string
}) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        Ghi chú
      </label>
      <textarea id={id} name="note" className="field" rows={2} required maxLength={1000} placeholder={placeholder} />
    </>
  )
}

function auditSummary(entry: AuditEntry): string {
  return reconciliationAuditSummary(entry)
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
                {entry.actor_id ? (names.get(entry.actor_id) ?? entry.actor_id) : "Hệ thống"}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDateTime(entry.created_at)}</td>
            </tr>
          ))}
        </DataTable>
      )}
    </AdminSection>
  )
}
