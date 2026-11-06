"use client"

import { useEffect, useRef, type ReactNode } from "react"

/** Below the 64px header plus 32px (DESIGN.md 2.2: top offset 96px). */
const TOP = 96
const BOTTOM = 24

/**
 * The detail-page sidebar from 1024px (DESIGN.md 2.2): sticky 96px below the
 * top of the viewport. When it is taller than the viewport it sticks by its
 * bottom edge instead, so every part of it can still be scrolled into view.
 * Without JavaScript it is simply sticky at 96px.
 */
export function StickyAside({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const place = () => {
      const room = window.innerHeight - TOP - BOTTOM
      const height = element.offsetHeight
      element.style.top = `${height > room ? window.innerHeight - height - BOTTOM : TOP}px`
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(element)
    window.addEventListener("resize", place)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", place)
    }
  }, [])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
