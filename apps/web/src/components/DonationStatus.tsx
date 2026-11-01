"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"

import { donationStatusLabel, POLL_INTERVAL_MS, POLL_WINDOW_MS, type ContributionStatus } from "@/lib/contributions"
import { formatVnd } from "@/lib/format"

type Watch = "watching" | "paused" | "lost" | "signed_out"

/**
 * The waiting part of the payment page: asks GET /api/contributions/status
 * every 5 seconds for up to 30 minutes until the donation is received, then
 * thanks the donor. The route recognises the donor by their session or by
 * the guest's status token cookie, so the token never reaches this script.
 *
 * The payment instructions (children) are shown only while the QR code is
 * still valid: once its 24 hours pass, or the donation turns `expired`, the
 * page shows `expiredNote` instead (the server stops sending them too).
 */
export function DonationStatus({
  code,
  initial,
  qrExpired: qrExpiredAtRender,
  qrMsLeft,
  expiredNote,
  children,
}: {
  code: string
  initial: ContributionStatus
  /** Decided by the server, so the browser's clock cannot bring an expired QR back. */
  qrExpired: boolean
  /** Milliseconds the QR had left when the server rendered the page. */
  qrMsLeft: number
  expiredNote: ReactNode
  children: ReactNode
}) {
  const [status, setStatus] = useState(initial)
  const received = status.status === "received"
  const [watch, setWatch] = useState<Watch>(received ? "paused" : "watching")
  const [qrExpired, setQrExpired] = useState(qrExpiredAtRender)
  const resumeNow = useRef(false)

  const check = useCallback(async (): Promise<ContributionStatus | Watch | null> => {
    try {
      const response = await fetch(`/api/contributions/status?code=${encodeURIComponent(code)}`, {
        cache: "no-store",
      })
      if (response.status === 401) return "signed_out"
      if (response.status === 404) return "lost"
      if (!response.ok) return null
      return (await response.json()) as ContributionStatus
    } catch {
      // Offline for a moment: try again on the next round.
      return null
    }
  }, [code])

  // One request at a time: the next check is scheduled after the previous
  // one answers. Resuming checks at once.
  useEffect(() => {
    if (watch !== "watching" || received) return
    const startedAt = Date.now()
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const round = async () => {
      const next = await check()
      if (stopped) return
      if (typeof next === "string") return setWatch(next)
      if (next) setStatus(next)
      if (Date.now() - startedAt >= POLL_WINDOW_MS) return setWatch("paused")
      timer = setTimeout(round, POLL_INTERVAL_MS)
    }
    timer = setTimeout(round, resumeNow.current ? 0 : POLL_INTERVAL_MS)
    resumeNow.current = false
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [watch, received, check])

  // Counted from the server's figure, not the browser's clock.
  useEffect(() => {
    if (qrExpired) return
    const timer = setTimeout(() => setQrExpired(true), Math.min(qrMsLeft, 2 ** 31 - 1))
    return () => clearTimeout(timer)
  }, [qrMsLeft, qrExpired])

  if (received) {
    return (
      <div role="status" className="card border-green-200 bg-green-50 p-6 text-center">
        <p className="text-2xl" aria-hidden>
          🎉
        </p>
        <p className="mt-2 text-lg font-semibold text-green-900">
          Đã nhận {formatVnd(status.received_amount)}. Cảm ơn bạn!
        </p>
        <p className="mt-1 text-sm text-green-800">Khoản ủng hộ đã vào tài khoản nhận của chiến dịch.</p>
      </div>
    )
  }

  const showInstructions = !qrExpired && status.status !== "expired"
  return (
    <div className="space-y-6">
      <div role="status" className="flex flex-wrap items-center gap-3 card p-4 text-sm">
        <span className="font-semibold">
          {showInstructions ? donationStatusLabel(status.status) : donationStatusLabel("expired")}
        </span>
        {watch === "watching" && (
          <span className="text-gray-600">
            Trang tự cập nhật khi tiền về. Thường mất vài phút; nếu chiến dịch đối soát bằng sao kê thì có thể tới một
            ngày làm việc.
          </span>
        )}
        {watch === "paused" && (
          <>
            <span className="text-gray-600">Trang đã ngừng tự kiểm tra.</span>
            <button
              type="button"
              className="btn-secondary px-2.5 py-1 text-xs"
              onClick={() => {
                resumeNow.current = true
                setWatch("watching")
              }}
            >
              Kiểm tra lại
            </button>
          </>
        )}
        {watch === "signed_out" && (
          <span className="text-gray-600">
            Phiên đăng nhập đã hết.{" "}
            <a
              href={`/auth/login?return_path=${encodeURIComponent(`/donations/${code}`)}`}
              className="font-medium text-brand-600"
            >
              Đăng nhập lại
            </a>{" "}
            để xem trạng thái.
          </span>
        )}
        {watch === "lost" && <span className="text-gray-600">Không còn xem được trạng thái khoản này ở đây.</span>}
      </div>
      {showInstructions ? children : expiredNote}
    </div>
  )
}
