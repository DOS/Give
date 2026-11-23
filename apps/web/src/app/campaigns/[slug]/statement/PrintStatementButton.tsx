"use client"

import { Button } from "@/components/ui/Button"
import { PrinterIcon } from "@/components/ui/icons"

/** Triggers the browser print dialog so visitors can print or save a PDF statement. */
export function PrintStatementButton() {
  return (
    <Button variant="secondary" size="sm" onClick={() => window.print()}>
      <PrinterIcon aria-hidden />
      <span>In / Lưu PDF</span>
    </Button>
  )
}
