import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ActionForm, SubmitButton } from "@/components/forms"
import { EmptyState } from "@/components/ui/EmptyState"
import { Field } from "@/components/ui/Field"
import { requireSession } from "@/lib/auth/session"
import { isStaff } from "@/lib/campaigns"
import { formatDate } from "@/lib/format"
import { describeChange, listRoleChanges, listStaff, ROLE_DESCRIPTIONS, ROLE_LABELS, STAFF_ROLES } from "@/lib/staff"
import { dbAs } from "@/lib/supabase"

import { AdminPage, AdminSection, DataTable } from "../_components/ui"
import { grantRole, revokeRole } from "./actions"

export const metadata: Metadata = { title: "Phân quyền nhân sự", robots: { index: false } }

export default async function StaffRolesPage() {
  const session = await requireSession("/admin/roles")
  const db = dbAs(session.accessToken)
  // Only admins manage roles; everyone else gets a plain 404.
  if (!(await isStaff(db, ["admin"]))) notFound()

  const [staff, changes] = await Promise.all([listStaff(db), listRoleChanges(db)])

  return (
    <AdminPage
      title="Phân quyền nhân sự"
      intro={<p>Mỗi lần cấp, đổi hoặc thu quyền đều được ghi vào nhật ký. Luôn phải còn ít nhất một quản trị viên.</p>}
    >
      <AdminSection id="grant" title="Cấp quyền">
        <ActionForm action={grantRole} resetOnSuccess className="max-w-160 space-y-6">
          <div className="grid gap-6 sm:grid-cols-2 [&>*]:min-w-0">
            <Field htmlFor="grant-user" label="Email hoặc mã người dùng DOS.Me">
              <input
                id="grant-user"
                name="user"
                className="field"
                required
                maxLength={320}
                autoComplete="off"
                placeholder="ten@vidu.com"
              />
            </Field>
            <Field
              htmlFor="grant-role"
              label="Quyền"
              hint="Nếu người này đã có quyền khác, quyền cũ sẽ được thay bằng quyền mới."
            >
              <select id="grant-role" name="role" className="field" defaultValue="moderator">
                {STAFF_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}: {ROLE_DESCRIPTIONS[role]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field htmlFor="grant-reason" label="Lý do (không bắt buộc)">
            <input id="grant-reason" name="reason" className="field" maxLength={500} />
          </Field>
          <SubmitButton>Cấp quyền</SubmitButton>
        </ActionForm>
      </AdminSection>

      <AdminSection id="staff" title="Nhân sự hiện tại" count={staff.length}>
        {staff.length === 0 ? (
          <EmptyState title="Chưa có nhân sự nào." />
        ) : (
          <ul className="divide-y divide-border card">
            {staff.map((member) => {
              const self = member.user_id === session.user.id
              const name = member.display_name || member.email || member.user_id
              return (
                <li key={member.user_id} className="flex flex-wrap items-start gap-4 p-4 sm:p-6">
                  <div className="min-w-0 flex-1 basis-60 text-sm">
                    <p className="text-base font-semibold break-words text-fg">
                      {name}
                      {self && <span className="ml-2 font-normal text-muted">(bạn)</span>}
                    </p>
                    {member.email && member.email !== name && <p className="text-muted">{member.email}</p>}
                    <p className="text-muted">
                      {ROLE_LABELS[member.role] ?? member.role} · từ {formatDate(member.created_at)}
                    </p>
                    <p className="mt-1 font-mono text-sm break-all text-muted">{member.user_id}</p>
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    <ActionForm
                      action={grantRole}
                      className="flex flex-wrap items-start gap-2"
                      confirm={
                        self
                          ? "Đổi quyền của chính bạn? Nếu hạ quyền, bạn sẽ mất quyền truy cập trang này ngay."
                          : undefined
                      }
                    >
                      <input type="hidden" name="user" value={member.user_id} />
                      {self && <input type="hidden" name="confirm_self" value="yes" />}
                      <label htmlFor={`role-${member.user_id}`} className="sr-only">
                        Đổi quyền của {name}
                      </label>
                      <div className="w-44">
                        <select id={`role-${member.user_id}`} name="role" className="field" defaultValue={member.role}>
                          {STAFF_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                      </div>
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
        )}
      </AdminSection>

      <AdminSection id="changes" title="Nhật ký phân quyền">
        {changes.length === 0 ? (
          <EmptyState title="Chưa có thay đổi nào qua trang này." />
        ) : (
          <DataTable label="Nhật ký phân quyền" head={["Thay đổi", "Bởi", "Lý do", "Ngày"]}>
            {changes.map((change) => (
              <tr key={change.id}>
                <td className="px-4 py-3">
                  <span className="font-semibold text-fg">{describeChange(change)}</span>{" "}
                  {change.action === "admin.revoke" ? "của" : "cho"} {change.user_email ?? change.user_id}
                </td>
                <td className="px-4 py-3 break-all">{change.actor_email ?? change.actor_id ?? "hệ thống"}</td>
                <td className="max-w-xs px-4 py-3 break-words">{change.reason || "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDate(change.created_at)}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </AdminSection>
    </AdminPage>
  )
}
