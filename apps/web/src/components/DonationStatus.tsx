"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"

import {
  donationStatusLabel,
  POLL_INTERVAL_MS,
  POLL_WINDOW_MS,
  STATUS_TOKEN_HEADER,
  type ContributionStatus,
} from "@/lib/contributions"
import { formatVnd } from "@/lib/format"

type Watch = "watching" | "paused" | "lost"

/**
 * The waiting part of the payment page: asks GET /api/contributions/status
 * every 5 seconds for up to 30 minutes until the donation is received, then
 * hides the payment instructions (children) and thanks the donor. Guests pass
 * their status token; signed-in donors are recognised by their session.
 */
export function DonationStatus({
  code,
  token,
  initial,
  children,
}: {
  code: string
  token: string | null
  initial: ContributionStatus
  children: ReactNode
}) {
  const [status, setStatus] = useState(initial)
  const received = status.status === "received"
  const [watch, setWatch] = useState<Watch>(received ? "paused" : "watching")
  const startedAt = useRef(0)

  const check = useCallback(async (): Promise<ContributionStatus | "lost" | null> => {
    try {
      const response = await fetch(
        token ? "/api/contributions/status" : `/api/contributions/status?code=${encodeURIComponent(code)}`,
        { headers: token ? { [STATUS_TOKEN_HEADER]: token } : {}, cache: "no-store" }
      )
      if (response.status === 404 || response.status === 401) return "lost"
      if (!response.ok) return null
      return (await response.json()) as ContributionStatus
    } catch {
      // Offline for a moment: try again on the next tick.
      return null
    }
  }, [code, token])

  useEffect(() => {
    if (watch !== "watching" || received) return
    startedAt.current = Date.now()
    let stopped = false
    const timer = setInterval(async () => {
      if (Date.now() - startedAt.current > POLL_WINDOW_MS) {
        setWatch("paused")
        return
      }
      const next = await check()
      if (stopped) return
      if (next === "lost") setWatch("lost")
      else if (next) setStatus(next)
    }, POLL_INTERVAL_MS)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [watch, received, check])

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

  return (
    <div className="space-y-6">
      <div role="status" className="flex flex-wrap items-center gap-3 card p-4 text-sm">
        <span className="font-semibold">{donationStatusLabel(status.status)}</span>
        {watch === "watching" && (
          <span className="text-gray-600">
            Trang tự cập nhật khi tiền về. Thường mất vài phút, có khi tới hết ngày làm việc nếu chiến dịch nhận qua sao
            kê.
          </span>
        )}
        {watch === "paused" && (
          <>
            <span className="text-gray-600">Trang đã ngừng tự kiểm tra.</span>
            <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={() => setWatch("watching")}>
              Kiểm tra lại
            </button>
          </>
        )}
        {watch === "lost" && (
          <span className="text-gray-600">Không còn xem được trạng thái khoản này ở đây. Hãy tải lại trang.</span>
        )}
      </div>
      {children}
    </div>
  )
}
