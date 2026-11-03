import Link from "next/link"

/** The Give wordmark: a green square with a ledger tick, then the name. */
export function Logo() {
  return (
    <Link href="/" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded" aria-label="Give, trang chủ">
      <svg viewBox="0 0 32 32" width={32} height={32} aria-hidden focusable="false">
        <rect width="32" height="32" rx="5" fill="#059669" />
        <path d="M9 11h14M9 16h8" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
        <path
          d="m17.5 21.5 2.5 2.5 4.5-5"
          fill="none"
          stroke="#fed7aa"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-2xl font-bold tracking-tight text-ink">Give</span>
    </Link>
  )
}
