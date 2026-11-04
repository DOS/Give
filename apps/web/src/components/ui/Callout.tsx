import clsx from "clsx"
import type { ReactNode, SVGProps } from "react"

export type CalloutTone = "neutral" | "info" | "success" | "warning" | "danger"

const TONES: Record<CalloutTone, { box: string; icon: string }> = {
  neutral: { box: "border-line bg-surface text-body", icon: "text-muted" },
  info: { box: "border-sky-200 bg-sky-50 text-sky-950", icon: "text-sky-700" },
  success: { box: "border-brand-200 bg-brand-50 text-brand-900", icon: "text-brand-700" },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-950", icon: "text-amber-700" },
  danger: { box: "border-red-200 bg-red-50 text-red-950", icon: "text-red-700" },
}

function Glyph({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

const ICONS: Record<CalloutTone, ReactNode> = {
  neutral: (
    <Glyph>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </Glyph>
  ),
  info: (
    <Glyph>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </Glyph>
  ),
  success: (
    <Glyph>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.2 2.3 2.3 4.7-4.9" />
    </Glyph>
  ),
  warning: (
    <Glyph>
      <path d="M12 4 21 19.5H3Z" />
      <path d="M12 10v4.5M12 17h.01" />
    </Glyph>
  ),
  danger: (
    <Glyph>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5.5M12 16h.01" />
    </Glyph>
  ),
}

/**
 * A message box inside a page: what happened or what to watch out for, with
 * the tone's icon. Text colours reach 4.5:1 on their tint. Pass `role`
 * ("status" or "alert") only when the box changes while the page is open.
 */
export function Callout({
  tone = "neutral",
  title,
  icon = true,
  role,
  className,
  children,
}: {
  tone?: CalloutTone
  title?: ReactNode
  /** false hides the icon. */
  icon?: boolean
  role?: "status" | "alert"
  className?: string
  children?: ReactNode
}) {
  return (
    <div role={role} className={clsx("flex gap-3 rounded-md border p-4 sm:p-5", TONES[tone].box, className)}>
      {icon && <span className={clsx("mt-0.5 shrink-0", TONES[tone].icon)}>{ICONS[tone]}</span>}
      <div className="min-w-0 flex-1 space-y-2">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  )
}
