"use client"

import { useState } from "react"

/**
 * Saves the QR code as a PNG, which a phone can keep in its photo gallery
 * and a banking app can import (an SVG cannot).
 */
export function SaveQrButton({ svg, filename }: { svg: string; filename: string }) {
  const [failed, setFailed] = useState(false)

  return (
    <button
      type="button"
      className="mt-2 text-xs font-medium text-brand-600"
      onClick={() => {
        const image = new Image()
        image.onload = () => {
          const size = 720
          const canvas = document.createElement("canvas")
          canvas.width = size
          canvas.height = size
          const context = canvas.getContext("2d")
          if (!context) return setFailed(true)
          context.fillStyle = "#ffffff"
          context.fillRect(0, 0, size, size)
          context.imageSmoothingEnabled = false
          context.drawImage(image, 0, 0, size, size)
          canvas.toBlob((blob) => {
            if (!blob) return setFailed(true)
            const url = URL.createObjectURL(blob)
            const link = document.createElement("a")
            link.href = url
            link.download = filename
            link.click()
            setTimeout(() => URL.revokeObjectURL(url), 10_000)
          }, "image/png")
        }
        image.onerror = () => setFailed(true)
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
      }}
    >
      {failed ? "Không lưu được ảnh. Hãy chụp màn hình mã QR." : "Lưu ảnh QR"}
    </button>
  )
}
