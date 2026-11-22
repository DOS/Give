import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ActionForm, SubmitButton } from "@/components/forms"
import { Callout } from "@/components/ui/Callout"
import { EmptyState } from "@/components/ui/EmptyState"
import { MachineId } from "@/components/ui/RefCode"
import { requireSession } from "@/lib/auth/session"
import { isStaff } from "@/lib/campaigns"
import {
  countEmailsByStatus,
  listDeadEmails,
  listHeldEmails,
  listRetryingEmails,
  maskEmail,
  OUTBOX_KIND_LABELS,
  OUTBOX_STATUS_LABELS,
  outboxExpiresAt,
  outboxMaxAgeDays,
  type OutboxRow,
} from "@/lib/email-outbox"
import { daysLeft, formatDateTime } from "@/lib/format"
import { dbAs, dbService } from "@/lib/supabase"

import { AdminPage, AdminSection, DataTable, Fact, Facts, ItemActions, ItemCard, ItemList } from "../_components/ui"
import { retryEmail } from "./actions"

export const metadata: Metadata = { title: "Email", robots: { index: false } }

export default async function AdminEmailsPage() {
  const session = await requireSession("/admin/emails")
  // Admins only; others get a 404. The outbox is read with the service client
  // after this check, since no client role may read it.
  if (!(await isStaff(dbAs(session.accessToken), ["admin"]))) notFound()

  const service = dbService()
  const [held, dead, retrying, counts] = await Promise.all([
    listHeldEmails(service),
    listDeadEmails(service),
    listRetryingEmails(service),
    countEmailsByStatus(service),
  ])

  return (
    <AdminPage
      title="Email"
      intro={
        <p>
          Give gửi email qua một hàng chờ: mỗi email được tạo cùng lúc với sự kiện gây ra nó (tiền ủng hộ được ghi nhận,
          đến hạn thanh toán, quyết định kiểm duyệt, chiến dịch kết thúc) và được gửi trong vòng một phút. Gửi lỗi thì
          Give tự thử lại sau 1, 5, 15, 60 phút, 3 giờ và 6 giờ; sau 7 lần vẫn lỗi, email dừng ở đây. Gửi lại khi nguyên
          nhân đã được khắc phục; mỗi lần gửi lại được ghi vào nhật ký kiểm toán.
        </p>
      }
    >
      {held.total > 0 && (
        <AdminSection
          id="held"
          title="Đang giữ: nhà cung cấp email đang giới hạn gửi"
          count={held.total > held.rows.length ? `${held.rows.length} / ${held.total}` : held.total}
        >
          <Callout tone="danger" title="Tài khoản gửi email đã chạm giới hạn gửi">
            <p className="text-sm">
              Amazon SES đang từ chối mọi email vì tài khoản đã hết hạn mức gửi trong 24 giờ (lỗi bắt đầu bằng{" "}
              <MachineId>THROTTLE:</MachineId>), nên Give giữ các email dưới đây và thử lại mỗi giờ mà không tính lượt
              thử. Email nào quá hạn trước khi gửi được sẽ bị bỏ, không gửi nữa: nhắc thanh toán sau{" "}
              {outboxMaxAgeDays("pledge_payment_reminder")} ngày, yêu cầu thanh toán và tổng kết chiến dịch sau{" "}
              {outboxMaxAgeDays("pledge_payment_due")} ngày, các email khác (biên nhận, quyết định kiểm duyệt) sau{" "}
              {outboxMaxAgeDays("donation_received")} ngày; hạn của từng email ở cột cuối. Hạn mức SES dùng chung với
              DOS.Me; nếu kéo dài, chủ tài khoản cần xin tăng hạn mức trong AWS SES.
            </p>
          </Callout>
          <DataTable
            label="Email đang giữ"
            head={["Email", "Người nhận", "Lỗi cuối", "Thử lại lúc", "Bỏ nếu chưa gửi lúc"]}
          >
            {held.rows.map((row) => {
              const expires = outboxExpiresAt(row).toISOString()
              return (
                <tr key={row.id}>
                  <td className="px-4 py-3">{OUTBOX_KIND_LABELS[row.kind] ?? row.kind}</td>
                  <td className="px-4 py-3 break-all">{recipient(row)}</td>
                  <td className="max-w-xs px-4 py-3 break-words">
                    <MachineId className="text-muted">{row.last_error ?? "—"}</MachineId>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDateTime(row.next_attempt_at)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatDateTime(expires)} <span className="text-muted">(còn {daysLeft(expires)} ngày)</span>
                  </td>
                </tr>
              )
            })}
          </DataTable>
        </AdminSection>
      )}

      <AdminSection id="summary" title="Tổng quan">
        <DataTable label="Số email theo trạng thái" head={["Trạng thái", "Số email"]}>
          {Object.entries(OUTBOX_STATUS_LABELS).map(([status, label]) => (
            <tr key={status}>
              <td className="px-4 py-3">{label}</td>
              <td className="px-4 py-3 tabular-nums">{counts[status] ?? 0}</td>
            </tr>
          ))}
        </DataTable>
      </AdminSection>

      <AdminSection
        id="dead"
        title="Không gửi được"
        count={dead.total > dead.rows.length ? `${dead.rows.length} mới nhất / ${dead.total}` : dead.total}
      >
        {dead.rows.length === 0 ? (
          <EmptyState title="Không có email nào dừng ở đây.">Mọi email đều đã gửi hoặc đang chờ gửi.</EmptyState>
        ) : (
          <ItemList>
            {dead.rows.map((row) => (
              <DeadCard key={row.id} row={row} />
            ))}
          </ItemList>
        )}
      </AdminSection>

      <AdminSection
        id="retrying"
        title="Đang chờ thử lại"
        count={retrying.total > retrying.rows.length ? `${retrying.rows.length} / ${retrying.total}` : retrying.total}
        lead="Email gửi lỗi ít nhất một lần, Give sẽ tự thử lại."
      >
        {retrying.rows.length === 0 ? (
          <EmptyState title="Không có email nào đang chờ thử lại." />
        ) : (
          <DataTable label="Email đang chờ thử lại" head={["Email", "Người nhận", "Đã thử", "Lỗi cuối", "Thử lại lúc"]}>
            {retrying.rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3">{OUTBOX_KIND_LABELS[row.kind] ?? row.kind}</td>
                <td className="px-4 py-3 break-all">{recipient(row)}</td>
                <td className="px-4 py-3 tabular-nums">
                  {row.attempts}/{row.max_attempts}
                </td>
                <td className="max-w-xs px-4 py-3 break-words">
                  <MachineId className="text-muted">{row.last_error ?? "—"}</MachineId>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDateTime(row.next_attempt_at)}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </AdminSection>
    </AdminPage>
  )
}

function recipient(row: OutboxRow): string {
  return row.recipient_email ? maskEmail(row.recipient_email) : row.recipient_user_id ? "Tài khoản DOS.Me" : "—"
}

function DeadCard({ row }: { row: OutboxRow }) {
  return (
    <ItemCard>
      <div className="space-y-3">
        <p className="font-medium text-fg">{OUTBOX_KIND_LABELS[row.kind] ?? row.kind}</p>
        <Callout tone="warning" title="Không gửi được">
          <p className="text-sm">
            Lỗi cuối: <MachineId className="text-muted">{row.last_error ?? "—"}</MachineId>
          </p>
        </Callout>
        <Facts>
          <Fact label="Người nhận">{recipient(row)}</Fact>
          <Fact label="Đã thử">
            {row.attempts}/{row.max_attempts} lần
          </Fact>
          <Fact label="Tạo lúc">{formatDateTime(row.created_at)}</Fact>
          <Fact label="Dừng lúc">{formatDateTime(row.dead_at)}</Fact>
        </Facts>
        <p className="text-muted">
          <MachineId>{row.id}</MachineId>
        </p>
      </div>
      <ItemActions>
        <ActionForm
          action={retryEmail.bind(null, row.id)}
          confirm="Gửi lại email này? Give sẽ gửi trong lần chạy tới."
          className="space-y-2"
        >
          <p className="label">Gửi lại</p>
          <p className="text-sm text-muted">
            Give gửi trong lần chạy tới, với 7 lượt thử mới. Chỉ nên gửi lại khi nguyên nhân đã được khắc phục.
          </p>
          <SubmitButton className="btn-secondary">Gửi lại</SubmitButton>
        </ActionForm>
      </ItemActions>
    </ItemCard>
  )
}
