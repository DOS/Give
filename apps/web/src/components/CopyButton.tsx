"use client"

import { useState } from "react"

/** Copies a value to the clipboard and says so for a moment. */
export function CopyButton({ value, label = "Sao chép" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState<boolean | null>(null)

  return (
    <button
      type="button"
      className="btn-secondary px-2.5 py-1 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
        } catch {
          setCopied(false)
        }
        setTimeout(() => setCopied(null), 2000)
      }}
    >
      <span aria-live="polite">{copied === null ? label : copied ? "Đã chép" : "Không chép được"}</span>
    </button>
  )
}
