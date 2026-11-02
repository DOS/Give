import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { ActionForm, SubmitButton } from "@/components/forms"
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
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-10">
      <div>
        <Link href="/admin/statements" className="text-sm text-gray-600 hover:text-gray-900">
          ← Đối soát sao kê
        </Link>
        <h1 className="mt-2 text-3xl font-bold">Sự kiện tiền vào bị dừng</h1>
        <p className="mt-2 text-sm text-gray-600">
          Mỗi sao kê tải lên (hoặc thông báo từ ngân hàng, cổng thanh toán) là một sự kiện Give xử lý tự động. Sự kiện
          nào thử 10 lần vẫn lỗi thì dừng ở đây, chờ nhân viên tài chính quyết định. Gửi lại khi nguyên nhân đã được
          khắc phục (ví dụ cơ sở dữ liệu đã chạy lại bình thường): Give thử lại từ đầu trong vài phút. Bỏ qua khi sự
          kiện không bao giờ nên được xử lý (file thử, tải nhầm tài khoản): ghi lý do; dữ liệu đã ghi trước đó vẫn giữ
          nguyên. Mỗi lần gửi lại hay bỏ qua đều được ghi vào nhật ký kiểm toán.
        </p>
      </div>

      <section>
        <h2 className="mb-4 text-xl font-bold">
          Đang dừng ({total > events.length ? `${events.length} cũ nhất / ${total}` : total})
        </h2>
        {events.length === 0 ? (
          <p className="card p-6 text-gray-600">Không có sự kiện nào đang dừng.</p>
        ) : (
          <ul className="space-y-4">
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
          </ul>
        )}
      </section>

      {isAdmin && <AuditTrail entries={audit} names={staffNames} />}
    </div>
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
    <li className="space-y-4 card p-6">
      <div className="space-y-2 text-sm">
        <p className="text-gray-500">
          {INBOUND_CHANNEL_LABELS[event.channel] ?? event.channel}
          {account ? ` · ${account}` : ""}
          {part ? ` · phần ${part.number}/${part.count} của file` : ""} · nhận lúc {formatDateTime(event.received_at)}
        </p>
        <p className="text-base font-medium text-amber-800">{parkedReasonLabel(event.last_error)}</p>
        <p className="text-gray-600">
          Mã lỗi: <span className="font-mono">{event.last_error ?? "—"}</span> · đã thử {event.attempts} lần
          {event.last_attempt_at ? `, lần cuối ${formatDateTime(event.last_attempt_at)}` : ""} · dừng lúc{" "}
          {formatDateTime(event.parked_at)}
        </p>
        <p className="font-mono text-xs break-all text-gray-400">{event.id}</p>
      </div>

      <div className="grid gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2">
        <ActionForm
          action={retryInboundEvent.bind(null, event.id)}
          confirm="Gửi lại sự kiện này để Give tự xử lý lại?"
          className="space-y-2"
        >
          <p className="label">Gửi lại</p>
          <p className="text-sm text-gray-600">
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
      </div>
    </li>
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
    <section>
      <h2 className="mb-2 text-xl font-bold">Nhật ký kiểm toán ({entries.length})</h2>
      <p className="mb-4 text-sm text-gray-600">Gửi lại và bỏ qua gần đây. Chỉ quản trị viên xem được.</p>
      {entries.length === 0 ? (
        <p className="card p-6 text-gray-600">Chưa có mục nào.</p>
      ) : (
        <ul className="divide-y divide-gray-100 card text-sm">
          {entries.map((entry) => (
            <li key={entry.id} className="space-y-1 p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">{INBOUND_AUDIT_LABELS[entry.action] ?? entry.action}</span>
                <span className="text-gray-500">{formatDateTime(entry.created_at)}</span>
              </div>
              <div className="text-gray-700">{auditSummary(entry)}</div>
              <div className="font-mono text-xs break-all text-gray-400">{entry.entity_id}</div>
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
