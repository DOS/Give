"use client"

import clsx from "clsx"
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react"

import { buttonClass } from "@/components/ui/Button"
import { CheckIcon, CodeIcon } from "@/components/ui/icons"
import { trackShareClick } from "@/lib/analytics-client"
import {
  buildEmbedIframeCode,
  EMBED_HEIGHT_COMPACT,
  EMBED_HEIGHT_DEFAULT,
  EMBED_THEME_LABELS,
  EMBED_THEMES,
  type EmbedTheme,
} from "@/lib/embed"

const noSubscribe = () => () => {}

/**
 * Collapsible `"Nhúng vào website / báo chí"` panel inside the campaign
 * sidebar (DOS/Give#335). Builds a copyable, HTML-escaped `<iframe>` snippet
 * with compact/default height and light/dark/auto theme controls.
 */
export function EmbedWidgetDisclosure({
  slug,
  title,
  origin: siteOrigin,
  campaignId,
  ambassadorRef,
}: {
  slug: string
  title: string
  origin?: string
  campaignId?: string
  ambassadorRef?: string | null
}) {
  const [compact, setCompact] = useState(false)
  const [theme, setTheme] = useState<EmbedTheme>("light")
  const [status, setStatus] = useState<string | null>(null)
  const codeId = useId()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  const origin = useSyncExternalStore(
    noSubscribe,
    () => siteOrigin ?? window.location.origin,
    () => siteOrigin ?? ""
  )

  const snippet = buildEmbedIframeCode({
    slug,
    title,
    origin,
    theme,
    compact,
    ref: ambassadorRef,
  })

  const handleCopy = async () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    try {
      await navigator.clipboard.writeText(snippet)
      if (campaignId) trackShareClick(campaignId)
      if (!mountedRef.current) return
      setStatus("Đã sao chép mã nhúng")
    } catch {
      if (!mountedRef.current) return
      setStatus("Không chép được tự động. Hãy chọn và sao chép đoạn mã ở trên.")
    }
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setStatus(null)
    }, 3000)
  }

  return (
    <details className="group">
      <summary
        className={buttonClass({
          variant: "secondary",
          full: true,
          className: "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
        })}
      >
        <CodeIcon />
        Nhúng vào website / báo chí
      </summary>
      <div className="mt-4 space-y-4 border-t border-border pt-4">
        <p className="text-sm text-muted">
          Dán mã HTML dưới đây vào bài viết hoặc website. Thẻ nhúng chỉ đọc dữ liệu công khai và mở trang ủng hộ chính
          thức trên Give.
        </p>

        <div className="space-y-2">
          <p className="text-sm font-medium text-fg">Kích thước</p>
          <div role="group" aria-label="Kích thước widget" className="grid grid-cols-2 gap-1 rounded bg-surface p-1">
            {[
              { value: false, label: `Tiêu chuẩn (${EMBED_HEIGHT_DEFAULT}px)` },
              { value: true, label: `Thu gọn (${EMBED_HEIGHT_COMPACT}px)` },
            ].map((option) => {
              const active = compact === option.value
              return (
                <button
                  key={option.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setCompact(option.value)
                    setStatus(null)
                  }}
                  className={clsx(
                    "min-h-9 rounded px-2 text-sm font-semibold transition-colors duration-150 focus-visible:-outline-offset-2",
                    active ? "border border-border bg-raised text-fg" : "text-muted hover:text-fg"
                  )}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-fg">Giao diện</p>
          <div role="group" aria-label="Giao diện widget" className="grid grid-cols-3 gap-1 rounded bg-surface p-1">
            {EMBED_THEMES.map((option) => {
              const active = theme === option
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setTheme(option)
                    setStatus(null)
                  }}
                  className={clsx(
                    "min-h-9 rounded px-2 text-sm font-semibold transition-colors duration-150 focus-visible:-outline-offset-2",
                    active ? "border border-border bg-raised text-fg" : "text-muted hover:text-fg"
                  )}
                >
                  {EMBED_THEME_LABELS[option]}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label htmlFor={codeId} className="label">
            Mã nhúng iframe
          </label>
          <textarea
            id={codeId}
            readOnly
            rows={4}
            value={snippet}
            onFocus={(event) => event.currentTarget.select()}
            className="field font-mono text-base"
          />
        </div>

        <div className="space-y-2">
          <button type="button" onClick={handleCopy} className={buttonClass({ variant: "secondary", full: true })}>
            {status?.startsWith("Đã") ? <CheckIcon /> : <CodeIcon />}
            Sao chép mã nhúng
          </button>
          <p className="min-h-5 text-center text-sm text-muted" aria-live="polite">
            {status}
          </p>
        </div>
      </div>
    </details>
  )
}
