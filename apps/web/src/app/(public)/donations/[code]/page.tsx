import type { Metadata } from "next"
import { cookies, headers } from "next/headers"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { DonationStatus } from "@/components/DonationStatus"
import { TransferDetails } from "@/components/TransferDetails"
import { Callout } from "@/components/ui/Callout"
import { Money } from "@/components/ui/Money"
import { getSession } from "@/lib/auth/session"
import { qrExpiresAt } from "@/lib/contributions"
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

export default async function DonationPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  if (!isDonationCode(code)) notFound()
  const { donation, guest } = await loadDonation(code)

  const service = dbService()
  const campaign = await paymentCampaign(service, donation.campaign_id)
  if (!campaign) notFound()

  const now = new Date()
  const expiresAt = qrExpiresAt(donation.created_at)
  const open = acceptsDonations(campaign, now)
  const received = donation.status === "received"
  const qrExpired = donation.status === "expired" || expiresAt <= now
  // A received donation, or one on a closed campaign, shows no payment details,
  // so its page does not depend on the account lookup.
  const account = !received && open ? await paymentAccount(service, donation.campaign_id) : null

  const closedNote = (
    <Callout tone="warning" title="Chiến dịch hiện không nhận chuyển khoản">
      <p>
        Vì vậy Give không hiển thị thông tin thanh toán. Đừng chuyển thêm tiền cho khoản này. Nếu bạn đã chuyển trước
        đó, tiền nằm trong tài khoản nhận của chiến dịch và Give vẫn ghi nhận khi đối soát được khoản này.
      </p>
    </Callout>
  )
  const expiredNote =
    open && account ? (
      <Callout title="Mã QR của khoản này đã hết hạn hiển thị">
        <p>
          Nếu bạn đã chuyển khoản với nội dung{" "}
          <span className="font-mono font-semibold">{donation.reference_code}</span>, Give vẫn ghi nhận khi tiền về.
        </p>
        <p>
          <Link href={`/campaigns/${campaign.slug}`} className="link">
            Ủng hộ khoản mới
          </Link>
        </p>
      </Callout>
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
      <TransferDetails
        svg={svg}
        filename={`give-${donation.reference_code}.png`}
        qrCaption={`Mã hiển thị tới ${timeFormat.format(expiresAt)}.`}
        bankBin={account.bank_bin}
        accountNumber={account.account_number}
        accountName={account.account_name}
        amount={donation.intended_amount}
        reference={donation.reference_code}
        footnote={`Giữ nguyên nội dung ${donation.reference_code} để Give khớp khoản ủng hộ. Tiền đi thẳng vào tài khoản của chiến dịch; Give không giữ tiền.`}
      />
    )
  } else if (!received && !qrExpired) {
    instructions = closedNote
  }

  return (
    <div className="container-page pt-6 pb-16 sm:pt-8 lg:pb-24">
      <header className="min-w-0">
        <p className="text-sm text-muted">Ủng hộ chiến dịch</p>
        <h1 className="mt-2 text-h1-phone tracking-tight break-words sm:text-h1">
          <Link href={`/campaigns/${campaign.slug}`} className="underline-offset-4 hover:underline">
            {campaign.title}
          </Link>
        </h1>
      </header>
      <div className="mt-8 flex flex-col gap-8 lg:grid lg:grid-cols-12 lg:gap-x-6">
        <aside
          aria-label="Khoản ủng hộ"
          className="min-w-0 lg:sticky lg:top-24 lg:col-span-4 lg:col-start-9 lg:row-start-1 lg:self-start"
        >
          <dl className="grid gap-4 card p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-1">
            <div className="min-w-0">
              <dt className="text-sm text-muted">Số tiền ủng hộ</dt>
              <dd className="mt-1">
                <Money amount={donation.intended_amount} size="xl" />
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-sm text-muted">Mã ủng hộ</dt>
              <dd className="mt-1 font-mono text-h2 break-all text-fg">{donation.reference_code}</dd>
            </div>
          </dl>
          {guest && (
            <p className="mt-4 text-sm text-muted">
              Trang này chỉ mở được trên trình duyệt bạn vừa dùng để ủng hộ, trong 7 ngày.
            </p>
          )}
        </aside>
        <div className="min-w-0 lg:col-span-8 lg:row-start-1">
          <DonationStatus
            code={donation.reference_code}
            initial={{ status: donation.status, received_amount: Number(donation.received_amount) }}
            qrExpired={qrExpired}
            qrMsLeft={Math.max(0, expiresAt.getTime() - now.getTime())}
            expiredNote={expiredNote}
          >
            {instructions}
          </DonationStatus>
        </div>
      </div>
    </div>
  )
}
