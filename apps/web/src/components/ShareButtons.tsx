"use client"

import { useState, useSyncExternalStore } from "react"

import { buttonClass } from "@/components/ui/Button"
import { ShareIcon } from "@/components/ui/icons"

const noSubscribe = () => () => {}

/**
 * Share a campaign: the phone's share sheet where there is one, otherwise
 * the link is copied. Facebook gets its own link because it is how most
 * Vietnamese campaigns spread. `path` is the campaign's own path; the full
 * URL uses the site origin, or the page's own on previews.
 */
export function ShareButtons({ path, title, origin: siteOrigin }: { path: string; title: string; origin?: string }) {
  const [status, setStatus] = useState<string | null>(null)
  // The canonical origin when the server knows it (so the Facebook link works
  // before hydration), else this page's own origin (previews).
  const origin = useSyncExternalStore(
    noSubscribe,
    () => siteOrigin ?? window.location.origin,
    () => siteOrigin ?? ""
  )
  const url = `${origin}${path}`

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url })
        return
      } catch (error) {
        // The person closed the sheet: nothing to say.
        if (error instanceof DOMException && error.name === "AbortError") return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setStatus("Đã chép đường dẫn")
    } catch {
      setStatus("Không chép được, hãy chép đường dẫn trên thanh địa chỉ")
    }
    setTimeout(() => setStatus(null), 3000)
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button type="button" onClick={share} className={buttonClass({ variant: "secondary", className: "flex-1" })}>
          <ShareIcon />
          Chia sẻ
        </button>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass({ variant: "secondary", className: "flex-1" })}
        >
          Facebook
          <span className="sr-only"> (mở thẻ mới)</span>
        </a>
      </div>
      <p className="text-center text-sm text-muted" aria-live="polite">
        {status}
      </p>
    </div>
  )
}
