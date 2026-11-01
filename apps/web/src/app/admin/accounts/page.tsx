import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { AccountStatusBadge, VerificationBadge } from "@/components/badges"
import { ActionForm, SubmitButton } from "@/components/forms"
import { requireSession } from "@/lib/auth/session"
import { bankByBin } from "@/lib/banks"
import { isStaff } from "@/lib/campaigns"
import { formatDate, formatVnd } from "@/lib/format"
import {
  ACCOUNT_KIND_LABELS,
  accountNameMatches,
  activeBinding,
  campaignRefs,
  FINANCE_ROLES,
  hostnameOf,
  listAccountsToReview,
  listReviewedAccounts,
  reviewOptions,
  VERIFICATION_TRANSFER_AMOUNT,
  type AccountForReview,
  type CampaignRef,
} from "@/lib/receiving-accounts"
import { dbAs } from "@/lib/supabase"

import { reviewAccount } from "./actions"

export const metadata: Metadata = { title: "Xác minh tài khoản nhận", robots: { index: false } }

export default async function AdminAccountsPage() {
  const session = await requireSession("/admin/accounts")
  const db = dbAs(session.accessToken)
  // Only finance and admin staff read receiving accounts (RLS); others get a 404.
  if (!(await isStaff(db, FINANCE_ROLES))) notFound()

  const [pending, reviewed] = await Promise.all([listAccountsToReview(db), listReviewedAccounts(db)])
  const refs = await campaignRefs(
    db,
    [...pending, ...reviewed].map((a) => activeBinding(a)?.campaign_id).filter((id): id is string => Boolean(id))
  )

  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-10">
      <div>
        <Link href="/admin" className="text-sm text-gray-600 hover:text-gray-900">
          ← Kiểm duyệt
        </Link>
        <h1 className="mt-2 text-3xl font-bold">Xác minh tài khoản nhận</h1>
        <p className="mt-2 text-sm text-gray-600">
          Xác minh khi đã thấy, từ một nguồn do ngân hàng phát hành (sao kê trên trang của chính ngân hàng, hoặc biên
          lai và sao kê đã đối chiếu với ngân hàng), một giao dịch chuyển đi {formatVnd(VERIFICATION_TRANSFER_AMOUNT)}{" "}
          từ đúng số tài khoản này, nội dung đúng bằng mã xác minh, và tên người chuyển trên giao dịch trùng tên pháp lý
          của người tổ chức đã được xác minh. Tên chủ tài khoản và đường dẫn sao kê là do người tổ chức tự khai, chưa
          được kiểm chứng. Mọi thao tác được ghi vào nhật ký kiểm toán.
        </p>
      </div>

      <section>
        <h2 className="mb-4 text-xl font-bold">Chờ xác minh ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="card p-6 text-gray-600">Không có tài khoản nào chờ xác minh.</p>
        ) : (
          <ul className="space-y-4">
            {pending.map((account) => (
              <AccountCard key={account.id} account={account} refs={refs} selfId={session.user.id} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold">Đã xử lý gần đây ({reviewed.length})</h2>
        {reviewed.length === 0 ? (
          <p className="card p-6 text-gray-600">Chưa có tài khoản nào được xử lý.</p>
        ) : (
          <ul className="space-y-4">
            {reviewed.map((account) => (
              <AccountCard key={account.id} account={account} refs={refs} selfId={session.user.id} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function AccountCard({
  account,
  refs,
  selfId,
}: {
  account: AccountForReview
  refs: Map<string, CampaignRef>
  selfId: string
}) {
  const bank = bankByBin(account.bank_bin)
  const organizer = account.organizer
  const nameMatches = accountNameMatches(account.account_name, organizer?.legal_name)
  const holder = activeBinding(account)
  const boundCampaign = holder ? refs.get(holder.campaign_id) : undefined
  const options = reviewOptions(account, organizer)
  const own = account.owner_user_id === selfId
  const status = account.verification_status

  return (
    <li className="space-y-4 card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <dl className="grid min-w-0 flex-1 gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">Ngân hàng</dt>
            <dd>
              {bank ? `${bank.shortName} – ${bank.name}` : account.bank_bin} (BIN {account.bank_bin})
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Số tài khoản</dt>
            <dd className="font-mono">{account.account_number}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Tên chủ tài khoản (người tổ chức khai)</dt>
            <dd>
              {account.account_name}{" "}
              <span className={nameMatches ? "text-gray-600" : "font-semibold text-red-700"}>
                {nameMatches ? "(tên khai trùng tên pháp lý)" : "✗ tên khai không trùng tên pháp lý"}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Người tổ chức</dt>
            <dd className="flex flex-wrap items-center gap-2">
              {organizer ? (
                <>
                  {organizer.display_name} (tên pháp lý: {organizer.legal_name})
                  {organizer.phone ? ` · ${organizer.phone}` : ""}
                  <VerificationBadge status={organizer.verification_status} />
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Loại</dt>
            <dd>{account.account_kind ? ACCOUNT_KIND_LABELS[account.account_kind] : "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Khai báo</dt>
            <dd>{formatDate(account.created_at)}</dd>
          </div>
          {account.public_statement_url && (
            <div className="sm:col-span-2">
              <dt className="text-gray-500">
                Sao kê công khai (người tổ chức cung cấp, chưa kiểm chứng; tên miền:{" "}
                <span className="font-semibold text-gray-900">{hostnameOf(account.public_statement_url)}</span>)
              </dt>
              <dd className="break-all">
                <a
                  href={account.public_statement_url}
                  className="text-brand-600"
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                >
                  {account.public_statement_url}
                </a>
              </dd>
            </div>
          )}
          {status === "pending" && (
            <div className="sm:col-span-2">
              <dt className="text-gray-500">Giao dịch cần thấy</dt>
              <dd>
                Chuyển đi {formatVnd(VERIFICATION_TRANSFER_AMOUNT)}, nội dung{" "}
                <span className="font-mono font-bold">{account.verification_code}</span>
              </dd>
            </div>
          )}
          {account.review_note && (
            <div className="sm:col-span-2">
              <dt className="text-gray-500">Lý do</dt>
              <dd>{account.review_note}</dd>
            </div>
          )}
          {status === "verified" && (
            <div>
              <dt className="text-gray-500">Xác minh ngày</dt>
              <dd>{formatDate(account.verified_at)}</dd>
            </div>
          )}
          <div className="sm:col-span-2">
            <dt className="text-gray-500">Chiến dịch đang gắn</dt>
            <dd>{holder ? (boundCampaign?.title ?? holder.campaign_id) : "Chưa gắn"}</dd>
          </div>
        </dl>
        <AccountStatusBadge status={status} />
      </div>

      {own ? (
        <p className="text-sm text-amber-800">Đây là tài khoản của bạn; một nhân viên khác cần xử lý.</p>
      ) : (
        <div className="grid gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2">
          {status === "pending" && options.verifyBlocked && (
            <p className="text-sm text-amber-800">Chưa xác minh được: {options.verifyBlocked}</p>
          )}
          {status === "pending" && !options.verifyBlocked && (
            <ActionForm
              action={reviewAccount.bind(null, account.id)}
              confirm="Xác minh tài khoản này? Sau đó người tổ chức có thể gắn nó với chiến dịch để nhận tiền."
              className="space-y-2"
            >
              <input type="hidden" name="decision" value="verified" />
              <input type="hidden" name="expected_code" value={account.verification_code} />
              <label htmlFor={`sender-${account.id}`} className="label">
                Tên người chuyển trên giao dịch (đọc từ nguồn của ngân hàng)
              </label>
              <input id={`sender-${account.id}`} name="sender_name" className="field" required maxLength={120} />
              <label htmlFor={`evidence-${account.id}`} className="label">
                Bằng chứng giao dịch xác minh
              </label>
              <textarea
                id={`evidence-${account.id}`}
                name="evidence"
                className="field"
                rows={2}
                required
                maxLength={500}
                placeholder="Mã giao dịch ngân hàng, ngày giờ, nguồn (trang sao kê của ngân hàng, biên lai đã đối chiếu)"
              />
              <SubmitButton>Xác minh</SubmitButton>
            </ActionForm>
          )}
          {options.close && (
            <ActionForm
              action={reviewAccount.bind(null, account.id)}
              confirm={
                options.close === "rejected"
                  ? "Từ chối tài khoản này? Số tài khoản sẽ được giải phóng để khai báo lại."
                  : "Khóa tài khoản này? Chiến dịch đang gắn với nó sẽ không nhận được tiền ủng hộ mới."
              }
              className="space-y-2"
            >
              {/* Rejecting frees the number; an account that was ever bound can only be disabled. */}
              <input type="hidden" name="decision" value={options.close} />
              <label htmlFor={`reason-${account.id}`} className="label">
                {options.close === "rejected" ? "Từ chối" : "Khóa tài khoản"}
              </label>
              <textarea
                id={`reason-${account.id}`}
                name="reason"
                className="field"
                rows={2}
                required
                maxLength={1000}
                placeholder="Lý do (người tổ chức sẽ thấy)"
              />
              <SubmitButton className="btn-danger">{options.close === "rejected" ? "Từ chối" : "Khóa"}</SubmitButton>
            </ActionForm>
          )}
          {options.reopen && (
            <ActionForm
              action={reviewAccount.bind(null, account.id)}
              confirm="Mở lại tài khoản để xác minh? Người tổ chức sẽ nhận mã xác minh mới."
            >
              <input type="hidden" name="decision" value="pending" />
              <SubmitButton className="btn-secondary">Mở lại để xác minh</SubmitButton>
            </ActionForm>
          )}
        </div>
      )}
    </li>
  )
}
