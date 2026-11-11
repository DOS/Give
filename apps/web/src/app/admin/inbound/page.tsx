import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ActionForm, SubmitButton } from "@/components/forms"
import { Callout } from "@/components/ui/Callout"
import { EmptyState } from "@/components/ui/EmptyState"
import { requireSession } from "@/lib/auth/session"
import { isStaff } from "@/lib/campaigns"
import { formatDateTime } from "@/lib/format"
import {
  INBOUND_AUDIT_LABELS,
  INBOUND_CHANNEL_LABELS,
  listInboundAudit,
  listParkedInbound,
  MAX_DISMISS_NOTE_LENGTH,
  parkedReasonLabel,
  statementEventRef,
  type ParkedInboundEvent,
} from "@/lib/inbound"
import { FINANCE_ROLES } from "@/lib/receiving-accounts"
import { listStaff } from "@/lib/staff"
import { accountLabels, type AuditEntry } from "@/lib/statement-import"
import { dbAs } from "@/lib/supabase"

import { AdminPage, AdminSection, DataTable, ItemActions, ItemCard, ItemList } from "../_components/ui"
import { dismissInboundEvent, retryInboundEvent } from "./actions"

export const metadata: Metadata = { title: "Sự kiện tiền vào bị dừng", robots: { index: false } }

export default async function AdminInboundPage() {
  const session = await requireSession("/admin/inbound")
  const db = dbAs(session.accessToken)
  // Finance and admin staff only; others get a 404.
  if (!(await isStaff(db, FINANCE_ROLES))) notFound()

  const [{ events, total }, isAdmin] = await Promise.all([listParkedInbound(db), isStaff(db, ["admin"])])
  const refs = new Map(
    events.map((e) => [e.id, e.channel === "statement_import" ? statementEventRef(e.dedupe_key) : null])
  )
  const [labels, audit, staff] = await Promise.all([
    accountLabels(
      db,
      [...refs.values()].flatMap((ref) => (ref ? [ref.accountId] : []))
    ),
    // give.audit_log and the staff list are readable by admins only.
    isAdmin ? listInboundAudit(db) : Promise.resolve([]),
    isAdmin ? listStaff(db) : Promise.resolve([]),
  ])
  const staffNames = new Map(staff.map((s) => [s.user_id, s.email ?? s.display_name ?? s.user_id]))

  return (
    <AdminPage
      title="Sự kiện tiền vào bị dừng"
      intro={
        <p>
          Mỗi sao kê tải lên (hoặc thông báo từ ngân hàng, cổng thanh toán) là một sự kiện Give xử lý tự động. Sự kiện
          nào thử 10 lần vẫn lỗi thì dừng ở đây, chờ nhân viên tài chính quyết định. Gửi lại khi nguyên nhân đã được
          khắc phục (ví dụ cơ sở dữ liệu đã chạy lại bình thường): Give thử lại từ đầu trong vài phút. Bỏ qua khi sự
          kiện không bao giờ nên được xử lý (file thử, tải nhầm tài khoản): ghi lý do; dữ liệu đã ghi trước đó vẫn giữ
          nguyên. Mỗi lần gửi lại hay bỏ qua đều được ghi vào nhật ký kiểm toán.
        </p>
      }
    >
      <AdminSection
        id="parked"
        title="Đang dừng"
        count={total > events.length ? `${events.length} cũ nhất / ${total}` : total}
      >
        {events.length === 0 ? (
          <EmptyState title="Không có sự kiện nào đang dừng.">
            Mọi sao kê và thông báo tiền vào đều đang được xử lý tự động.
          </EmptyState>
        ) : (
          <ItemList>
            {events.map((event) => {
              const ref = refs.get(event.id) ?? null
              return (
                <ParkedCard
                  key={event.id}
                  event={event}
                  account={ref ? (labels.get(ref.accountId) ?? "Tài khoản không còn xem được") : null}
                  part={ref?.part ?? null}
                />
              )
            })}
          </ItemList>
        )}
      </AdminSection>

      {isAdmin && <AuditTrail entries={audit} names={staffNames} />}
    </AdminPage>
  )
}

function ParkedCard({
  event,
  account,
  part,
}: {
  event: ParkedInboundEvent
  account: string | null
  part: { number: number; count: number } | null
}) {
  return (
    <ItemCard>
      <div className="space-y-3">
        <p className="text-sm text-muted">
          {INBOUND_CHANNEL_LABELS[event.channel] ?? event.channel}
          {account ? ` · ${account}` : ""}
          {part ? ` · phần ${part.number}/${part.count} của file` : ""} · nhận lúc {formatDateTime(event.received_at)}
        </p>
        <Callout tone="warning" title={parkedReasonLabel(event.last_error)}>
          <p className="text-sm">
            Mã lỗi: <span className="font-mono text-[length:max(1em,1rem)] text-muted">{event.last_error ?? "—"}</span>{" "}
            · đã thử {event.attempts} lần
            {event.last_attempt_at ? `, lần cuối ${formatDateTime(event.last_attempt_at)}` : ""} · dừng lúc{" "}
            {formatDateTime(event.parked_at)}
          </p>
        </Callout>
        <p className="font-mono text-base break-all text-muted">{event.id}</p>
      </div>

      <ItemActions>
        <ActionForm
          action={retryInboundEvent.bind(null, event.id)}
          confirm="Gửi lại sự kiện này để Give tự xử lý lại?"
          className="space-y-2"
        >
          <p className="label">Gửi lại</p>
          <p className="text-sm text-muted">
            Give thử lại trong lần chạy tới, với 10 lượt thử mới. Chỉ nên gửi lại khi nguyên nhân đã được khắc phục.
          </p>
          <SubmitButton className="btn-secondary">Gửi lại</SubmitButton>
        </ActionForm>
        <ActionForm
          action={dismissInboundEvent.bind(null, event.id)}
          confirm="Bỏ qua sự kiện này? Give sẽ không bao giờ tự xử lý nó nữa."
          className="space-y-2"
        >
          <label htmlFor={`note-${event.id}`} className="label">
            Bỏ qua
          </label>
          <textarea
            id={`note-${event.id}`}
            name="note"
            required
            rows={2}
            maxLength={MAX_DISMISS_NOTE_LENGTH}
            className="field"
            placeholder="Lý do (bắt buộc), ví dụ: file thử, tải nhầm tài khoản"
          />
          <SubmitButton className="btn-secondary">Bỏ qua</SubmitButton>
        </ActionForm>
      </ItemActions>
    </ItemCard>
  )
}

function auditSummary(entry: AuditEntry): string {
  const before = entry.before ?? {}
  const after = entry.after ?? {}
  const error = typeof before.error === "string" ? before.error : "—"
  const attempts = typeof before.attempts === "number" ? before.attempts : null
  const lastState = `lỗi cuối ${error}${attempts !== null ? `, ${attempts} lần thử` : ""}`
  if (entry.action === "inbound_event.dismiss") {
    return `${typeof after.note === "string" ? after.note : ""} (${lastState})`
  }
  return lastState
}

function AuditTrail({ entries, names }: { entries: AuditEntry[]; names: Map<string, string> }) {
  return (
    <AdminSection
      id="audit"
      title="Nhật ký kiểm toán"
      count={entries.length}
      lead="Gửi lại và bỏ qua gần đây. Chỉ quản trị viên xem được."
    >
      {entries.length === 0 ? (
        <EmptyState title="Chưa có mục nào." />
      ) : (
        <DataTable label="Nhật ký gửi lại và bỏ qua" head={["Thao tác", "Chi tiết", "Người thực hiện", "Lúc"]}>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td className="px-4 py-3">
                <p className="font-medium text-fg">{INBOUND_AUDIT_LABELS[entry.action] ?? entry.action}</p>
                <p className="font-mono text-base break-all text-muted">{entry.entity_id}</p>
              </td>
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
