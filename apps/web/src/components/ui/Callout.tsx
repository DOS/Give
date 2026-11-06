import clsx from "clsx"
import type { ReactNode, SVGProps } from "react"

export type CalloutTone = "neutral" | "info" | "success" | "warning" | "danger"

/** Soft semantic fills, body text in the text color, the icon in the tone (DESIGN.md 4). */
const TONES: Record<CalloutTone, { box: string; icon: string }> = {
  neutral: { box: "bg-surface", icon: "text-muted" },
  info: { box: "bg-surface", icon: "text-primary" },
  success: { box: "bg-primary-soft", icon: "text-primary" },
  warning: { box: "bg-warning-soft", icon: "text-warning" },
  danger: { box: "bg-danger-soft", icon: "text-danger" },
}

function Glyph({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
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
 * the tone's icon. The text stays in the text color, so it reaches 4.5:1 on every tint. Pass `role`
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
    <div role={role} className={clsx("flex gap-3 rounded-md p-4 text-fg", TONES[tone].box, className)}>
      {icon && <span className={clsx("mt-0.5 shrink-0", TONES[tone].icon)}>{ICONS[tone]}</span>}
      <div className="min-w-0 flex-1 space-y-2">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  )
}
