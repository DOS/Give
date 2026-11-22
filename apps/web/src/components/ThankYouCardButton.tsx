"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"

import { buttonClass, type ButtonSize } from "@/components/ui/Button"
import { DownloadIcon, HeartIcon } from "@/components/ui/icons"
import { ModalDialog } from "@/components/ui/ModalDialog"
import { RefCode } from "@/components/ui/RefCode"
import { exportCanvasPng, renderThankYouCanvas, waitForCanvasFonts } from "@/lib/canvas-cards"
import { buildThankYouCardModel, type ThankYouCardInput } from "@/lib/viral-sharing"

/**
 * Shareable "Tôi đã chung tay" thank-you card button and modal (DOS/Give#313).
 *
 * Available only for matched/received contributions on /donations/[code] and
 * /me/contributions. Exports a 1080x1080 PNG on a client-side canvas with a
 * user-controlled toggle to hide/show the VND amount (shown clearly by default).
 * Zero PII or bank details are accepted or rendered.
 */
export function ThankYouCardButton({
  card,
  size = "md",
  label = "Tải thẻ “Tôi đã chung tay”",
  className,
}: {
  card: ThankYouCardInput
  size?: ButtonSize
  label?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [hideAmount, setHideAmount] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const titleId = useId()
  const toggleId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const model = useMemo(() => buildThankYouCardModel(card, { hideAmount }), [card, hideAmount])

  useEffect(() => {
    if (!open || !canvasRef.current) return
    let cancelled = false
    renderThankYouCanvas(canvasRef.current, model)
    void waitForCanvasFonts().then(() => {
      if (!cancelled && canvasRef.current) {
        renderThankYouCanvas(canvasRef.current, model)
      }
    })
    return () => {
      cancelled = true
    }
  }, [open, model])

  const handleDownload = async () => {
    if (!canvasRef.current || busy) return
    setBusy(true)
    setStatus(null)
    try {
      await waitForCanvasFonts()
      if (!canvasRef.current) return
      renderThankYouCanvas(canvasRef.current, model)
      const filename = `give-chung-tay-${model.referenceCode.toLowerCase()}.png`
      const ok = await exportCanvasPng(canvasRef.current, filename)
      setStatus(ok ? "Đã tải thẻ cảm ơn PNG." : "Không tạo được ảnh PNG. Hãy thử lại trên trình duyệt khác.")
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
        className={buttonClass({ variant: "secondary", size, className })}
      >
        <HeartIcon width={20} height={20} />
        {label}
      </button>

      <ModalDialog
        open={open}
        onClose={() => setOpen(false)}
        titleId={titleId}
        title="Thẻ “Tôi đã chung tay”"
        returnFocusRef={triggerRef}
      >
        <p className="mt-2 text-sm text-muted">
          Tải ảnh cảm ơn để chia sẻ lên mạng xã hội. Thẻ chỉ hiển thị tên hiển thị, chiến dịch và mã đối chiếu sao kê —
          không chứa thông tin cá nhân hay tài khoản ngân hàng.
        </p>

        <label
          htmlFor={toggleId}
          className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 rounded bg-surface px-3 py-2 text-sm font-medium text-fg"
        >
          <input
            id={toggleId}
            type="checkbox"
            checked={hideAmount}
            onChange={(event) => {
              setHideAmount(event.target.checked)
              setStatus(null)
            }}
            className="size-4 shrink-0 rounded border border-border accent-primary"
          />
          <span>Ẩn số tiền trên thẻ</span>
        </label>

        <div className="mt-4 flex justify-center rounded-md bg-surface p-4">
          <canvas
            ref={canvasRef}
            aria-label={`Xem trước thẻ Tôi đã chung tay cho chiến dịch ${model.campaignTitle}`}
            className="max-h-[340px] w-auto max-w-full rounded border border-border bg-bg"
          />
        </div>

        <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted">Tên hiển thị</dt>
            <dd className="min-w-0 truncate font-medium text-fg">{model.donorName}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted">Số tiền trên thẻ</dt>
            <dd className="font-semibold text-fg tabular-nums">{model.amountText ?? "Đã ẩn theo lựa chọn của bạn"}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted">Mã đối chiếu</dt>
            <dd>
              <RefCode>{model.referenceCode}</RefCode>
            </dd>
          </div>
        </dl>

        <div className="mt-4 space-y-2">
          <button
            type="button"
            disabled={busy}
            onClick={handleDownload}
            className={buttonClass({ variant: "primary", full: true })}
          >
            <DownloadIcon />
            {busy ? "Đang tạo ảnh…" : "Tải ảnh PNG"}
          </button>
          <p className="min-h-5 text-center text-sm text-muted" aria-live="polite">
            {status}
          </p>
        </div>
      </ModalDialog>
    </>
  )
}
