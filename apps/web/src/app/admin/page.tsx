import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { TypeBadge, VerificationBadge } from "@/components/badges"
import { ActionForm, SubmitButton } from "@/components/forms"
import { requireSession } from "@/lib/auth/session"
import { isStaff, listOrganizersToVerify, listReviewQueue } from "@/lib/campaigns"
import { formatDate, formatVnd } from "@/lib/format"
import { dbAs } from "@/lib/supabase"

import { approveCampaign, requestChanges, setVerification } from "./actions"

export const metadata: Metadata = { title: "Kiểm duyệt", robots: { index: false } }

export default async function AdminPage() {
  const session = await requireSession("/admin")
  const db = dbAs(session.accessToken)
  // Non-staff get a plain 404 so the page does not advertise itself.
  if (!(await isStaff(db))) notFound()

  const [queue, organizers] = await Promise.all([listReviewQueue(db), listOrganizersToVerify(db)])

  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-10">
      <h1 className="text-3xl font-bold">Kiểm duyệt</h1>

      <section>
        <h2 className="mb-4 text-xl font-bold">Chiến dịch chờ duyệt ({queue.length})</h2>
        {queue.length === 0 ? (
          <p className="card p-6 text-gray-600">Không có chiến dịch nào chờ duyệt.</p>
        ) : (
          <ul className="space-y-4">
            {queue.map((campaign) => {
              const own = campaign.organizer_id === session.user.id
              return (
                <li key={campaign.id} className="space-y-4 card p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <TypeBadge type={campaign.type} />
                        {campaign.category && (
                          <span className="text-sm text-gray-600">
                            {campaign.category.icon} {campaign.category.name}
                          </span>
                        )}
                      </div>
                      <h3 className="mt-1 text-lg font-semibold">{campaign.title}</h3>
                      <p className="text-sm text-gray-600">{campaign.summary}</p>
                    </div>
                    <Link href={`/campaigns/${campaign.slug}`} className="btn-secondary" target="_blank">
                      Xem trước
                    </Link>
                  </div>
                  <dl className="grid gap-2 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-gray-500">Mục tiêu</dt>
                      <dd>{formatVnd(campaign.goal_amount)}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Thời gian</dt>
                      <dd>
                        {campaign.starts_at ? formatDate(campaign.starts_at) : "Khi duyệt"} →{" "}
                        {formatDate(campaign.ends_at)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Gửi duyệt</dt>
                      <dd>{formatDate(campaign.submitted_at)}</dd>
                    </div>
                    {campaign.organizer && (
                      <div className="sm:col-span-3">
                        <dt className="text-gray-500">Người tổ chức</dt>
                        <dd className="flex flex-wrap items-center gap-2">
                          {campaign.organizer.display_name} (tên pháp lý: {campaign.organizer.legal_name},{" "}
                          {campaign.organizer.kind === "organization" ? "tổ chức" : "cá nhân"})
                          <VerificationBadge status={campaign.organizer.verification_status} />
                        </dd>
                      </div>
                    )}
                    {campaign.type === "give" && (
                      <div className="sm:col-span-3">
                        <dt className="text-gray-500">Người thụ hưởng</dt>
                        <dd>
                          {campaign.beneficiary_name}
                          {campaign.beneficiary_relation ? ` (${campaign.beneficiary_relation})` : ""}
                        </dd>
                      </div>
                    )}
                  </dl>
                  {own ? (
                    <p className="text-sm text-amber-800">
                      Đây là chiến dịch của bạn; một kiểm duyệt viên khác cần duyệt.
                    </p>
                  ) : (
                    <div className="grid gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2">
                      <ActionForm
                        action={approveCampaign.bind(null, campaign.id)}
                        confirm="Duyệt chiến dịch này? Nếu đã tới ngày bắt đầu, chiến dịch sẽ công khai ngay."
                      >
                        <SubmitButton>Duyệt</SubmitButton>
                      </ActionForm>
                      <ActionForm action={requestChanges.bind(null, campaign.id)} resetOnSuccess className="space-y-2">
                        <label htmlFor={`reason-${campaign.id}`} className="label">
                          Yêu cầu chỉnh sửa
                        </label>
                        <textarea
                          id={`reason-${campaign.id}`}
                          name="reason"
                          className="field"
                          rows={2}
                          required
                          maxLength={2000}
                          placeholder="Người tổ chức cần sửa gì?"
                        />
                        <SubmitButton className="btn-secondary">Gửi yêu cầu</SubmitButton>
                      </ActionForm>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xl font-bold">Xác minh người tổ chức ({organizers.length})</h2>
        <p className="mb-4 text-sm text-gray-600">
          Xác minh khi đã đối chiếu tên pháp lý với giấy tờ hoặc tài khoản ngân hàng. Nếu người tổ chức đổi tên sau khi
          trang này tải, thao tác sẽ bị từ chối để bạn xem lại.
        </p>
        {organizers.length === 0 ? (
          <p className="card p-6 text-gray-600">Không có hồ sơ nào chờ xác minh.</p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200">
            {organizers.map((organizer) => (
              <li key={organizer.user_id} className="flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold">{organizer.display_name}</p>
                  <p className="text-gray-600">
                    Tên pháp lý: {organizer.legal_name} · {organizer.kind === "organization" ? "Tổ chức" : "Cá nhân"}
                    {organizer.phone ? ` · ${organizer.phone}` : ""}
                  </p>
                  <p className="mt-1">
                    <VerificationBadge status={organizer.verification_status} />
                  </p>
                </div>
                {organizer.user_id !== session.user.id && (
                  <ActionForm action={setVerification.bind(null, organizer.user_id)} className="flex flex-wrap gap-2">
                    <input type="hidden" name="expected_legal_name" value={organizer.legal_name} />
                    <input type="hidden" name="expected_display_name" value={organizer.display_name} />
                    <input type="hidden" name="expected_kind" value={organizer.kind} />
                    <SubmitButton name="status" value="verified">
                      Xác minh
                    </SubmitButton>
                    <SubmitButton name="status" value="rejected" className="btn-danger">
                      Từ chối
                    </SubmitButton>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
