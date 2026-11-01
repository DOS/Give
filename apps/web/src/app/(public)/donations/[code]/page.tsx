import type { Metadata } from "next"
import { cookies, headers } from "next/headers"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { CopyButton } from "@/components/CopyButton"
import { DonationStatus } from "@/components/DonationStatus"
import { SaveQrButton } from "@/components/SaveQrButton"
import { getSession } from "@/lib/auth/session"
import { qrExpiresAt } from "@/lib/contributions"
import { formatVnd } from "@/lib/format"
import { dbAs, dbService } from "@/lib/supabase"
import {
  acceptsDonations,
  donationCookieToken,
  guestContribution,
  hostnameFrom,
  isSessionRejected,
  ownContribution,
  paymentAccount,
  paymentCampaign,
  type PaymentContribution,
} from "@/server/contributions"
import { buildDonationPayload, isDonationCode, renderVietQrSvg } from "@/server/vietqr"

export const metadata: Metadata = { title: "Chuyển khoản ủng hộ", robots: { index: false, follow: false } }

const timeFormat = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
})

/**
 * The donation, if the visitor may see it: a signed-in donor's own one, or a
 * guest's whose status token cookie (set by the donate action) matches. A
 * donor whose session ended is sent to sign in and back; anyone else gets
 * the not-found page, which explains where the page can be opened.
 */
async function loadDonation(code: string): Promise<{ donation: PaymentContribution; guest: boolean }> {
  const session = await getSession()
  let sessionRejected = false
  if (session) {
    try {
      const own = await ownContribution(dbAs(session.accessToken), session.user.id, code)
      if (own) return { donation: own, guest: false }
    } catch (error) {
      if (!isSessionRejected(error)) throw error
      sessionRejected = true
    }
  }
  const token = donationCookieToken(await cookies(), code, hostnameFrom((await headers()).get("host")))
  const guest = token ? await guestContribution(dbService(), code, token) : null
  if (guest) return { donation: guest, guest: true }
  if (sessionRejected) redirect(`/auth/login?return_path=${encodeURIComponent(`/donations/${code}`)}`)
  notFound()
}

function Row({ label, value, copy }: { label: string; value: string; copy?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="flex items-center gap-2 font-semibold break-all">
        {value}
        {copy !== undefined && <CopyButton value={copy} />}
      </dd>
    </div>
  )
}

export default async function DonationPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  if (!isDonationCode(code)) notFound()
  const { donation, guest } = await loadDonation(code)

  const service = dbService()
  const [campaign, account] = await Promise.all([
    paymentCampaign(service, donation.campaign_id),
    paymentAccount(service, donation.campaign_id),
  ])
  if (!campaign) notFound()

  const now = new Date()
  const expiresAt = qrExpiresAt(donation.created_at)
  const open = acceptsDonations(campaign, now)
  const received = donation.status === "received"
  const qrExpired = donation.status === "expired" || expiresAt <= now

  const closedNote = (
    <div className="card border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
      Chiến dịch hiện không nhận chuyển khoản nên Give không hiển thị thông tin thanh toán. Đừng chuyển thêm tiền cho
      khoản này. Nếu bạn đã chuyển trước đó, tiền nằm trong tài khoản nhận của chiến dịch và Give vẫn ghi nhận khi đối
      soát được khoản này.
    </div>
  )
  const expiredNote =
    open && account ? (
      <div className="card p-6 text-sm text-gray-700">
        Mã QR của khoản này đã hết hạn hiển thị. Nếu bạn đã chuyển khoản với nội dung {donation.reference_code}, Give
        vẫn ghi nhận khi tiền về.{" "}
        <Link href={`/campaigns/${campaign.slug}`} className="font-medium text-brand-600">
          Ủng hộ khoản mới
        </Link>
      </div>
    ) : (
      closedNote
    )

  let instructions = null
  // The server decides expiry too, so the QR is never sent once its 24 hours have passed.
  if (!received && !qrExpired && open && account) {
    const svg = renderVietQrSvg(
      buildDonationPayload({
        bankBin: account.bank_bin,
        accountNumber: account.account_number,
        amount: donation.intended_amount,
        addInfo: donation.reference_code,
      })
    )
    instructions = (
      <div className="grid gap-6 card p-6 sm:grid-cols-2">
        <div className="text-center">
          <div
            className="mx-auto w-full max-w-64 [&>svg]:h-auto [&>svg]:w-full"
            role="img"
            aria-label="Mã VietQR để chuyển khoản"
            // The SVG is generated here from the payload, not taken from input.
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <p className="mt-2 text-xs text-gray-500">
            Quét bằng app ngân hàng. Mã hiển thị tới {timeFormat.format(expiresAt)}.
          </p>
          <SaveQrButton svg={svg} filename={`give-${donation.reference_code}.png`} />
        </div>
        <div>
          <dl className="divide-y divide-gray-100">
            <Row label="Mã ngân hàng (BIN)" value={account.bank_bin} />
            <Row label="Số tài khoản" value={account.account_number} copy={account.account_number} />
            <Row label="Chủ tài khoản" value={account.account_name} />
            <Row label="Số tiền" value={formatVnd(donation.intended_amount)} copy={String(donation.intended_amount)} />
            <Row label="Nội dung chuyển khoản" value={donation.reference_code} copy={donation.reference_code} />
          </dl>
          <p className="mt-3 text-xs text-gray-500">
            Giữ nguyên nội dung {donation.reference_code} để Give khớp khoản ủng hộ. Tiền đi thẳng vào tài khoản của
            chiến dịch; Give không giữ tiền.
          </p>
        </div>
      </div>
    )
  } else if (!received && !qrExpired) {
    instructions = closedNote
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <div>
        <p className="text-sm text-gray-500">Ủng hộ chiến dịch</p>
        <h1 className="text-2xl font-bold">
          <Link href={`/campaigns/${campaign.slug}`} className="hover:text-brand-600">
            {campaign.title}
          </Link>
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Mã ủng hộ <span className="font-mono font-semibold">{donation.reference_code}</span> ·{" "}
          {formatVnd(donation.intended_amount)}
        </p>
      </div>
      <DonationStatus
        code={donation.reference_code}
        initial={{ status: donation.status, received_amount: Number(donation.received_amount) }}
        qrExpired={qrExpired}
        qrMsLeft={Math.max(0, expiresAt.getTime() - now.getTime())}
        expiredNote={expiredNote}
      >
        {instructions}
      </DonationStatus>
      {guest && (
        <p className="text-xs text-gray-500">
          Trang này chỉ mở được trên trình duyệt bạn vừa dùng để ủng hộ, trong 7 ngày.
        </p>
      )}
    </div>
  )
}
