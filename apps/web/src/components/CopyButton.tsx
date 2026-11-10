"use client"

import { useState } from "react"

import { buttonClass } from "@/components/ui/Button"

/**
 * Copies a value to the clipboard and says so for a moment. `name` says
 * what is copied ("số tài khoản") to screen readers, so several copy
 * buttons on one page are told apart.
 */
export function CopyButton({ value, label = "Sao chép", name }: { value: string; label?: string; name?: string }) {
  const [copied, setCopied] = useState<boolean | null>(null)

  return (
    <button
      type="button"
      className={buttonClass({ variant: "secondary", size: "sm", className: "shrink-0" })}
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
      <svg
        viewBox="0 0 24 24"
        width={20}
        height={20}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        focusable="false"
      >
        {copied ? (
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        ) : (
          <>
            <rect x="8.5" y="8.5" width="11" height="11" rx="1.5" />
            <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
          </>
        )}
      </svg>
      <span aria-live="polite">
        {copied === null ? label : copied ? "Đã chép" : "Không chép được"}
        {name && <span className="sr-only"> {name}</span>}
      </span>
    </button>
  )
}
