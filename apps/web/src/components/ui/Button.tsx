import clsx from "clsx"
import Link from "next/link"
import type { ComponentProps, ReactNode } from "react"

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger"

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger",
}

/**
 * The class list of a button (DOS/Give#95): every size keeps the 44px touch
 * target; `lg` is the one primary action of a page.
 */
export function buttonClass({
  variant = "primary",
  size = "md",
  full,
  className,
}: { variant?: ButtonVariant; size?: "md" | "lg"; full?: boolean; className?: string } = {}): string {
  return clsx(VARIANTS[variant], size === "lg" && "min-h-12 px-6 text-lg", full && "w-full", className)
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
