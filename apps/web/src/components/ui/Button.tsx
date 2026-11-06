import clsx from "clsx"
import Link from "next/link"
import type { ComponentProps, ReactNode } from "react"

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger"
export type ButtonSize = "sm" | "md" | "lg"

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger",
}

/** DESIGN.md 6: sm 36px / 12px / 14px, md 44px / 16px / 16px, lg 52px / 24px / 16px. */
const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-sm",
  md: "",
  lg: "min-h-13 px-6",
}

/** The class list of a button (DESIGN.md 6): one primary per screen region. */
export function buttonClass({
  variant = "primary",
  size = "md",
  full,
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; full?: boolean; className?: string } = {}): string {
  return clsx(VARIANTS[variant], SIZES[size], full && "w-full", className)
}

type Style = Parameters<typeof buttonClass>[0]

export function Button({
  variant,
  size,
  full,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & Style) {
  return <button type={type} className={buttonClass({ variant, size, full, className })} {...props} />
}

/** A link styled as a button, for actions that navigate. */
export function ButtonLink({
  href,
  variant,
  size,
  full,
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Link>, "className"> & Style & { children: ReactNode }) {
  return (
    <Link href={href} className={buttonClass({ variant, size, full, className })} {...props}>
      {children}
    </Link>
  )
}
