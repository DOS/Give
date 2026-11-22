"use client"

import clsx from "clsx"
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react"

import { buttonClass } from "@/components/ui/Button"
import { DownloadIcon, QrCodeIcon } from "@/components/ui/icons"
import { ModalDialog } from "@/components/ui/ModalDialog"
import { trackShareClick } from "@/lib/analytics-client"
import { exportCanvasPng, renderPosterCanvas, waitForCanvasFonts } from "@/lib/canvas-cards"
import { POSTER_DIMENSIONS, type CampaignPosterData, type PosterFormat } from "@/lib/viral-sharing"

const noSubscribe = () => () => {}

/**
 * "Tải poster QR" trigger and modal on public /campaigns/[slug] pages (DOS/Give#313).
 *
 * Lets supporters and organizers preview and download a Story (9:16) or Square (1:1)
 * PNG poster generated entirely on a client-side canvas. VietQR payment data is
 * strictly gated on the server (`data.vietQr === null` whenever payments are stopped
 * or the campaign is not accepting donations).
 */
export function QrPosterButton({ data }: { data: CampaignPosterData }) {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<PosterFormat>("story")
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const titleId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const origin = useSyncExternalStore(
    noSubscribe,
    () => data.origin ?? window.location.origin,
    () => data.origin ?? ""
  )
  const campaignUrl = `${origin}${data.path}`

  useEffect(() => {
    if (!open || !canvasRef.current) return
    let cancelled = false
    renderPosterCanvas(canvasRef.current, data, format, campaignUrl)
    void waitForCanvasFonts().then(() => {
      if (!cancelled && canvasRef.current) {
        renderPosterCanvas(canvasRef.current, data, format, campaignUrl)
      }
    })
    return () => {
      cancelled = true
    }
  }, [open, data, format, campaignUrl])

  const handleDownload = async () => {
    if (!canvasRef.current || busy) return
    setBusy(true)
    setStatus(null)
    try {
      await waitForCanvasFonts()
      if (!canvasRef.current) return
      renderPosterCanvas(canvasRef.current, data, format, campaignUrl)
      const filename = `give-poster-${data.slug}-${format}.png`
      const ok = await exportCanvasPng(canvasRef.current, filename)
      if (ok) {
        trackShareClick(data.campaignId)
        setStatus("Đã tải poster PNG.")
      } else {
        setStatus("Không tạo được ảnh PNG. Hãy thử lại trên trình duyệt khác.")
      }
    } catch {
      setStatus("Không tạo được ảnh PNG. Hãy thử lại trên trình duyệt khác.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setStatus(null)
          setOpen(true)
        }}
        className={buttonClass({ variant: "secondary", full: true })}
      >
        <QrCodeIcon />
        Tải poster QR
      </button>

      <ModalDialog
        open={open}
        onClose={() => setOpen(false)}
        titleId={titleId}
        title="Tải poster QR"
        returnFocusRef={triggerRef}
      >
        <p className="mt-2 text-sm text-muted">
          {data.vietQr
            ? `Poster gồm mã QR trang chiến dịch và mã VietQR (${data.vietQr.bankName} · ${data.vietQr.maskedAccount}).`
            : "Poster chỉ gắn mã QR dẫn tới trang chiến dịch (không gắn mã chuyển khoản)."}
        </p>

        {/* Format segmented control (DESIGN.md 6) */}
        <div role="group" aria-label="Khổ ảnh poster" className="mt-4 grid grid-cols-2 gap-1 rounded bg-surface p-1">
          {(["story", "square"] as const).map((option) => {
            const active = format === option
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setFormat(option)
                  setStatus(null)
                }}
                className={clsx(
                  "min-h-9 rounded px-3 text-sm font-semibold transition-colors duration-150 focus-visible:-outline-offset-2",
                  active ? "border border-border bg-raised text-fg" : "text-muted hover:text-fg"
                )}
              >
                {POSTER_DIMENSIONS[option].label}
              </button>
            )
          })}
        </div>

        <div className="mt-4 flex justify-center rounded-md bg-surface p-4">
          <canvas
            ref={canvasRef}
            aria-label={`Xem trước poster QR khổ ${POSTER_DIMENSIONS[format].label} cho chiến dịch ${data.title}`}
            className={clsx(
              "max-w-full rounded border border-border bg-bg",
              format === "story" ? "max-h-[420px] w-auto" : "max-h-[360px] w-auto"
            )}
          />
        </div>

        <div className="mt-4 space-y-2">
          <button
            type="button"
            disabled={busy}
            onClick={handleDownload}
            className={buttonClass({ variant: "primary", full: true })}
          >
            <DownloadIcon />
            {busy ? "Đang tạo ảnh…" : format === "story" ? "Tải ảnh PNG (9:16)" : "Tải ảnh PNG (1:1)"}
          </button>
          <p className="min-h-5 text-center text-sm text-muted" aria-live="polite">
            {status}
          </p>
        </div>
      </ModalDialog>
    </>
  )
}
