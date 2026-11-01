import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { ActionForm, SubmitButton } from "@/components/forms"
import { requireSession } from "@/lib/auth/session"
import { isStaff } from "@/lib/campaigns"
import { formatDate } from "@/lib/format"
import { describeChange, listRoleChanges, listStaff, ROLE_DESCRIPTIONS, ROLE_LABELS, STAFF_ROLES } from "@/lib/staff"
import { dbAs } from "@/lib/supabase"

import { grantRole, revokeRole } from "./actions"

export const metadata: Metadata = { title: "Phân quyền nhân sự", robots: { index: false } }

export default async function StaffRolesPage() {
  const session = await requireSession("/admin/roles")
  const db = dbAs(session.accessToken)
  // Only admins manage roles; everyone else gets a plain 404.
  if (!(await isStaff(db, ["admin"]))) notFound()

  const [staff, changes] = await Promise.all([listStaff(db), listRoleChanges(db)])

  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-10">
      <div>
        <Link href="/admin" className="text-sm text-gray-600 hover:underline">
          ← Kiểm duyệt
        </Link>
        <h1 className="mt-2 text-3xl font-bold">Phân quyền nhân sự</h1>
        <p className="mt-2 text-sm text-gray-600">
          Mỗi lần cấp, đổi hoặc thu quyền đều được ghi vào nhật ký. Luôn phải còn ít nhất một quản trị viên.
        </p>
      </div>

      <section className="space-y-4 card p-6">
        <h2 className="text-xl font-bold">Cấp quyền</h2>
        <ActionForm action={grantRole} resetOnSuccess className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="grant-user" className="label">
                Email hoặc mã người dùng DOS.Me
              </label>
              <input
                id="grant-user"
                name="user"
                className="field"
                required
                maxLength={320}
                autoComplete="off"
                placeholder="ten@vidu.com"
              />
            </div>
            <div>
              <label htmlFor="grant-role" className="label">
                Quyền
              </label>
              <select id="grant-role" name="role" className="field" defaultValue="moderator">
                {STAFF_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}: {ROLE_DESCRIPTIONS[role]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="grant-reason" className="label">
              Lý do (không bắt buộc)
            </label>
            <input id="grant-reason" name="reason" className="field" maxLength={500} />
          </div>
          <p className="text-sm text-gray-600">Nếu người này đã có quyền khác, quyền cũ sẽ được thay bằng quyền mới.</p>
          <SubmitButton>Cấp quyền</SubmitButton>
        </ActionForm>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold">Nhân sự hiện tại ({staff.length})</h2>
        <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200">
          {staff.map((member) => {
            const self = member.user_id === session.user.id
            const name = member.display_name || member.email || member.user_id
            return (
              <li key={member.user_id} className="flex flex-wrap items-start gap-4 p-4">
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold">
                    {name}
                    {self && <span className="ml-2 font-normal text-gray-500">(bạn)</span>}
                  </p>
                  {member.email && member.email !== name && <p className="text-gray-600">{member.email}</p>}
                  <p className="text-gray-600">
                    {ROLE_LABELS[member.role] ?? member.role} · từ {formatDate(member.created_at)}
                  </p>
                  <p className="mt-1 font-mono text-xs break-all text-gray-400">{member.user_id}</p>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <ActionForm action={grantRole} className="flex items-start gap-2">
                    <input type="hidden" name="user" value={member.user_id} />
                    <label htmlFor={`role-${member.user_id}`} className="sr-only">
                      Đổi quyền của {name}
                    </label>
                    <select
                      id={`role-${member.user_id}`}
                      name="role"
                      className="field w-auto"
                      defaultValue={member.role}
                    >
                      {STAFF_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                    <SubmitButton className="btn-secondary">Đổi quyền</SubmitButton>
                  </ActionForm>
                  <ActionForm
                    action={revokeRole.bind(null, member.user_id)}
                    confirm={
                      self
                        ? "Thu quyền của chính bạn? Bạn sẽ mất quyền truy cập trang này ngay."
                        : `Thu quyền ${ROLE_LABELS[member.role] ?? member.role} của ${name}?`
                    }
                  >
                    <SubmitButton className="btn-danger">Thu quyền</SubmitButton>
                  </ActionForm>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold">Nhật ký phân quyền</h2>
        {changes.length === 0 ? (
          <p className="card p-6 text-gray-600">Chưa có thay đổi nào qua trang này.</p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 text-sm">
            {changes.map((change) => (
              <li key={change.id} className="p-4">
                <p>
                  <span className="font-semibold">{describeChange(change)}</span> cho{" "}
                  {change.user_email ?? change.user_id}
                </p>
                <p className="text-gray-600">
                  {formatDate(change.created_at)} · bởi {change.actor_email ?? change.actor_id ?? "hệ thống"}
                  {change.reason ? ` · Lý do: ${change.reason}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
