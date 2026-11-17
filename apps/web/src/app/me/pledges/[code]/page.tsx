import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import type { ReactNode } from "react"

import { ActionForm, SubmitButton } from "@/components/forms"
import { TransferDetails } from "@/components/TransferDetails"
import { buttonClass, ButtonLink } from "@/components/ui/Button"
import { Callout, type CalloutTone } from "@/components/ui/Callout"
import { Money } from "@/components/ui/Money"
import { PledgeStatusBadge } from "@/components/ui/PledgeStatusBadge"
import { requireSession } from "@/lib/auth/session"
import { formatDateTime, formatVnd } from "@/lib/format"
import {
  acceptsPledges,
  overpaid,
  deliveryMonth,
  paymentWindowClosed,
  fulfillmentLabel,
  paymentView,
  readShippingAddress,
} from "@/lib/pledges"
import { stopHoldsPledge } from "@/lib/payment-requests"
import { dbAs, dbService } from "@/lib/supabase"
import { cancelPledge } from "@/app/campaigns/[slug]/pledge/actions"
import { isSessionRejected, paymentCampaign } from "@/server/contributions"
import { getTierTitle, loadPledgeMoney, ownPledgeByCode, type OwnPledge } from "@/server/pledges"
import { buildDonationPayload, isDonationCode, renderVietQrSvg } from "@/server/vietqr"
import { RefCode } from "@/components/ui/RefCode"

export const metadata: Metadata = { title: "Cam kết ủng hộ", robots: { index: false, follow: false } }

/** The signed-in backer's own pledge; anyone else gets the not-found page. */
async function loadPledge(code: string): Promise<{ pledge: OwnPledge; userId: string; token: string }> {
  const session = await requireSession(`/me/pledges/${code}`)
  try {
    const pledge = await ownPledgeByCode(dbAs(session.accessToken), session.user.id, code)
    if (!pledge) notFound()
    return { pledge, userId: session.user.id, token: session.accessToken }
  } catch (error) {
    if (isSessionRejected(error)) redirect(`/auth/login?return_path=${encodeURIComponent(`/me/pledges/${code}`)}`)
    throw error
  }
}

const NOTE_TONES: Record<"gray" | "amber" | "green" | "red", CalloutTone> = {
  gray: "neutral",
  amber: "warning",
  green: "success",
  red: "danger",
}

function Note({ tone = "gray", children }: { tone?: "gray" | "amber" | "green" | "red"; children: ReactNode }) {
  return <Callout tone={NOTE_TONES[tone]}>{children}</Callout>
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-fg">{children}</dd>
    </div>
  )
}

/**
 * A backer's pledge (section 4.2): what was chosen and its status. While the
 * campaign is live the pledge can still be changed or cancelled; once the
 * campaign reaches its goal this is the payment page, with a VietQR code to
 * the creator's own account for the amount still due and the reference code
 * as the transfer content. Give holds no money. While a moderator has stopped
 * the campaign's payment requests (DOS/Give#89) the page shows no transfer
 * details. Amounts owed back are net of refunds already made
 * (give.pledge_balance).
 */
export default async function PledgePaymentPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  if (!isDonationCode(code)) notFound()
  const { pledge, userId, token } = await loadPledge(code)

  const service = dbService()
  const [campaign, tier] = await Promise.all([
    paymentCampaign(service, pledge.campaign_id),
    pledge.reward_tier_id ? getTierTitle(dbAs(token), pledge.reward_tier_id).catch(() => null) : null,
  ])
  if (!campaign) notFound()
  // Never asks for the payment details while payment requests are stopped.
  const { payment, balance } = await loadPledgeMoney(service, pledge, campaign, userId)
  // Without the balance, amounts that refunds could change are left out.
  const excess = balance ? (pledge.status === "paid" ? balance.refund_owed_amount : 0) : null
  const refunded = balance?.refunded_amount ?? 0
  const shipping = readShippingAddress(pledge.shipping_address)
  const fulfillment = pledge.status === "paid" ? fulfillmentLabel(pledge.fulfillment_status) : null
  const month = deliveryMonth(tier?.estimated_delivery)

  let body: ReactNode = null
  switch (pledge.status) {
    case "pledged":
      body = acceptsPledges(campaign) ? (
        <Note>
          <p>
            Bạn chưa phải chuyển tiền. Khi dự án kết thúc ({formatDateTime(campaign.ends_at)}), nếu tổng cam kết đạt mục
            tiêu, Give báo bạn chuyển khoản; nếu không đạt, cam kết tự hủy.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <ButtonLink href={`/campaigns/${campaign.slug}/pledge`} variant="secondary">
              Đổi cam kết
            </ButtonLink>
            <ActionForm
              action={cancelPledge.bind(null, pledge.id)}
              confirm="Hủy cam kết này? Suất quà của bạn sẽ được nhả cho người khác."
            >
              <SubmitButton className={buttonClass({ variant: "danger" })}>Hủy cam kết</SubmitButton>
            </ActionForm>
          </div>
        </Note>
      ) : campaign.status === "live" && campaign.ends_at && new Date(campaign.ends_at) <= new Date() ? (
        <Note>Dự án đã hết thời gian nhận cam kết. Give đang chốt kết quả; bạn sẽ nhận thông báo khi có kết quả.</Note>
      ) : (
        <Note tone="amber">
          Dự án đang tạm dừng nên chưa đổi hay hủy được cam kết. Bạn chưa phải chuyển tiền; Give sẽ báo khi dự án tiếp
          tục hoặc có kết quả.
        </Note>
      )
      break
    case "payment_due":
    case "partially_paid": {
      // A pledge overdue before the stop began is not held by it: "closed", and
      // loadPledgeMoney still never asked for the payment details.
      const view = paymentView(stopHoldsPledge(campaign, pledge), paymentWindowClosed(pledge), payment, isDonationCode)
      if (view === "stopped") {
        body = (
          <Note tone="red">
            <p className="font-semibold">
              Give đã tạm dừng yêu cầu thanh toán của dự án này. Đừng chuyển tiền cho cam kết này, kể cả theo thông tin
              chuyển khoản bạn đã nhận trước đó.
            </p>
            {campaign.payments_stopped_note && <p className="whitespace-pre-line">{campaign.payments_stopped_note}</p>}
            <p>
              Give sẽ báo khi yêu cầu thanh toán được mở lại. Thời gian tạm dừng không tính vào hạn thanh toán: cam kết
              không hết hiệu lực trong lúc tạm dừng, và khi mở lại, hạn được lùi thêm đúng số ngày đã tạm dừng.
            </p>
          </Note>
        )
      } else if (view === "unavailable") {
        body = (
          <Note tone="amber">
            Give chưa hiển thị được thông tin chuyển khoản của cam kết này. Đừng chuyển tiền theo thông tin từ nơi khác;
            hãy tải lại trang sau ít phút. Hạn thanh toán là {formatDateTime(pledge.payment_due_at)}.
          </Note>
        )
      } else if (!payment) {
        body = (
          <Note tone="amber">
            Đã quá hạn thanh toán của cam kết này. Đừng chuyển thêm tiền. Nếu bạn đã chuyển, Give vẫn ghi nhận khi đối
            soát được khoản này.
          </Note>
        )
      } else if (view === "nothing_due") {
        // amount_due is net of refunds, so this is only a pledge Give has not marked paid yet: no QR for 0 đồng.
        body = (
          <Note tone="amber">
            Give ghi nhận cam kết này không còn thiếu tiền, nên không hiển thị mã chuyển khoản. Đừng chuyển thêm; Give
            cập nhật trạng thái khi đối soát sao kê.
          </Note>
        )
      } else if (view === "no_account" || !payment.account) {
        body = (
          <Note tone="amber">
            Dự án đạt mục tiêu nhưng tài khoản nhận của người tạo dự án hiện chưa dùng được, nên Give chưa hiển thị
            thông tin chuyển khoản. Đừng chuyển tiền theo thông tin từ nơi khác. Hãy quay lại sau; hạn thanh toán là{" "}
            {formatDateTime(payment.payment_due_at)}.
          </Note>
        )
      } else {
        const svg = renderVietQrSvg(
          buildDonationPayload({
            bankBin: payment.account.bank_bin,
            accountNumber: payment.account.account_number,
            amount: payment.amount_due,
            addInfo: payment.reference_code,
          })
        )
        body = (
          <>
            <Note tone="green">
              <p>
                Dự án đã đạt mục tiêu. Hãy chuyển {formatVnd(payment.amount_due)} trước{" "}
                <span className="font-semibold">{formatDateTime(payment.payment_due_at)}</span>.
                {payment.received_amount > 0 &&
                  ` Give đã ghi nhận ${formatVnd(payment.received_amount)}${
                    refunded > 0 ? ` và đã hoàn lại ${formatVnd(refunded)}` : ""
                  }.`}
              </p>
              <p>
                Nếu bạn đã chuyển khoản, đừng chuyển lại: Give cập nhật trạng thái khi đối soát sao kê, có thể sau vài
                ngày. Quá hạn mà chưa chuyển đủ, cam kết hết hiệu lực và suất quà được nhả; phần đã chuyển sẽ được hoàn
                lại.
              </p>
            </Note>
            <TransferDetails
              svg={svg}
              filename={`give-${payment.reference_code}.png`}
              qrCaption="Mã đã điền sẵn số tiền và nội dung chuyển khoản."
              bankBin={payment.account.bank_bin}
              accountNumber={payment.account.account_number}
              accountName={payment.account.account_name}
              amount={payment.amount_due}
              reference={payment.reference_code}
              footnote={
                <>
                  Giữ nguyên nội dung <RefCode>{payment.reference_code}</RefCode> để Give khớp khoản thanh toán. Tiền đi
                  thẳng vào tài khoản của người tạo dự án; Give không giữ tiền. Give cập nhật trạng thái khi đối soát
                  sao kê, có thể sau vài ngày.
                </>
              }
            />
          </>
        )
      }
      break
    }
    case "paid":
      body = (
        <Note tone="green">
          <p>Bạn đã thanh toán đủ {formatVnd(pledge.intended_amount)}. Cảm ơn bạn đã đồng hành cùng dự án.</p>
          {(excess === null ? overpaid(pledge) > 0 : excess > 0) && (
            <p>
              Give ghi nhận bạn đã chuyển {formatVnd(pledge.received_amount)}, nhiều hơn số cam kết
              {refunded > 0 ? ` (đã hoàn lại ${formatVnd(refunded)})` : ""}. Người tạo dự án
              {excess === null ? " phải hoàn lại phần thừa" : ` còn phải hoàn lại phần thừa ${formatVnd(excess)}`};
              trang dự án công khai khoản còn nợ cho tới khi hoàn xong.
            </p>
          )}
          {pledge.reward_tier_id && (
            <p>
              Tình trạng giao quà: <span className="font-semibold">{fulfillment}</span>
              {pledge.fulfillment_updated_at && ` (cập nhật ${formatDateTime(pledge.fulfillment_updated_at)})`}
            </p>
          )}
          {pledge.fulfillment_note && <p className="whitespace-pre-line">Ghi chú: {pledge.fulfillment_note}</p>}
        </Note>
      )
      break
    case "refund_due":
      body = (
        <Note tone="red">
          Cam kết này không còn hiệu lực (chưa được thanh toán đủ trước hạn, hoặc tiền đến sau khi cam kết đã hết hiệu
          lực), nên người tạo dự án phải hoàn lại cho bạn{" "}
          {balance ? formatVnd(balance.refund_owed_amount) : "số tiền bạn đã chuyển"}
          {pledge.refund_due_at ? ` trước ${formatDateTime(pledge.refund_due_at)}` : ""}.
          {refunded > 0 ? ` Đã hoàn ${formatVnd(refunded)}; số trên là phần còn lại.` : ""} Trang dự án công khai số
          tiền hoàn còn nợ cho tới khi hoàn xong.
        </Note>
      )
      break
    case "refunded":
      body = <Note>Khoản bạn đã chuyển cho cam kết này đã được hoàn lại.</Note>
      break
    case "lapsed":
      body = (
        <Note>Cam kết đã quá hạn thanh toán mà chưa có khoản chuyển nào, nên đã hết hiệu lực. Bạn không mất tiền.</Note>
      )
      break
    case "cancelled":
      body = (
        <Note>
          Cam kết này đã được hủy (bạn hủy hoặc đổi sang cam kết khác, hoặc dự án không đạt mục tiêu). Bạn không phải
          trả tiền.{" "}
          <Link href="/me/contributions" className="link">
            Xem các ủng hộ của tôi
          </Link>
        </Note>
      )
      break
  }

  return (
    <div className="container-page pt-6 pb-16 sm:pt-8 lg:pb-24">
      <header className="min-w-0">
        <p className="text-sm text-muted">Cam kết ủng hộ dự án</p>
        <h1 className="mt-2 text-h1-phone tracking-tight break-words sm:text-h1">
          <Link href={`/campaigns/${campaign.slug}`} className="underline-offset-4 hover:underline">
            {campaign.title}
          </Link>
        </h1>
      </header>

      <div className="mt-8 flex flex-col gap-8 lg:grid lg:grid-cols-12 lg:gap-x-6">
        <aside
          aria-label="Cam kết"
          className="min-w-0 lg:sticky lg:top-24 lg:col-span-4 lg:col-start-9 lg:row-start-1 lg:self-start"
        >
          <dl className="grid gap-4 card p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-1">
            <div className="min-w-0">
              <dt className="text-sm text-muted">Số tiền cam kết</dt>
              <dd className="mt-1">
                <Money amount={pledge.intended_amount} size="xl" />
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-sm text-muted">Mã cam kết</dt>
              <dd className="mt-1">
                <RefCode size="lg">{pledge.reference_code}</RefCode>
              </dd>
            </div>
            <div className="min-w-0 sm:col-span-2 lg:col-span-1">
              <dt className="text-sm text-muted">Trạng thái</dt>
              <dd className="mt-1">
                <PledgeStatusBadge status={pledge.status} />
              </dd>
            </div>
          </dl>
        </aside>

        <div className="min-w-0 space-y-8 lg:col-span-8 lg:row-start-1">
          {body}

          <section aria-labelledby="pledge-details">
            <h2 id="pledge-details" className="text-h2">
              Chi tiết cam kết
            </h2>
            <dl className="mt-6 divide-y divide-border border-y border-border">
              <Detail label="Phần quà">
                <span className="font-semibold">
                  {pledge.reward_tier_id ? (tier?.title ?? "Phần quà của dự án") : "Ủng hộ không nhận quà"}
                </span>
                {month && <span className="text-muted"> · dự kiến giao {month}</span>}
              </Detail>
              {shipping && (
                <Detail label="Giao tới">
                  {shipping.recipient} · {shipping.phone}
                  <br />
                  {shipping.address}
                </Detail>
              )}
              <Detail label="Hiển thị">{pledge.is_anonymous ? "Ẩn danh" : (pledge.public_name ?? "—")}</Detail>
              <Detail label="Cam kết lúc">{formatDateTime(pledge.created_at)}</Detail>
            </dl>
          </section>
        </div>
      </div>
    </div>
  )
}
