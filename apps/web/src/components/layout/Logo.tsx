import Link from "next/link"

/** The Give wordmark (DESIGN.md 7): a 28px primary square with a tick, then the name. */
export function Logo() {
  return (
    <Link href="/" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded" aria-label="Give, trang chủ">
      <span className="inline-flex size-7 items-center justify-center rounded bg-primary text-primary-fg" aria-hidden>
        <svg viewBox="0 0 24 24" width={16} height={16} fill="none" focusable="false">
          <path
            d="M20 6 9 17l-5-5"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="text-xl font-bold text-fg">Give</span>
    </Link>
  )
}
