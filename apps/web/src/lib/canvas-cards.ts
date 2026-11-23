import {
  displayShortUrl,
  encodeQrMatrix,
  POSTER_DIMENSIONS,
  type CampaignPosterData,
  type PosterFormat,
  type QrMatrix,
  type ThankYouCardModel,
} from "./viral-sharing"

/**
 * Client-side HTML5 Canvas renderers for Give viral-sharing PNGs (DOS/Give#313):
 * - Downloadable QR Poster (Story 9:16 = 1080x1920, Square 1:1 = 1080x1080)
 * - Shareable "Tôi đã chung tay" Thank-You Card (1080x1080)
 *
 * Follows DESIGN.md colors, low corner radii, Be Vietnam Pro typography, and
 * monospace reference codes. Pure client-side; zero external network requests.
 */

const SANS_FONT = '"Be Vietnam Pro", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
const MONO_FONT = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"

/**
 * Resolves the browser's computed body font family at draw time so client PNG
 * exports pick up next/font's self-hosted Be Vietnam Pro family across all
 * browsers, falling back cleanly to `SANS_FONT` in SSR/Node environments.
 */
export function resolveCanvasSansFont(): string {
  if (typeof document !== "undefined" && typeof getComputedStyle === "function" && document.body) {
    try {
      const computed = getComputedStyle(document.body).fontFamily?.trim()
      if (computed) return computed
    } catch {
      // Fall back to SANS_FONT if computed style lookup fails.
    }
  }
  return SANS_FONT
}

const COLORS = {
  bg: "#FFFFFF",
  surface: "#F7F8FA",
  border: "#E6E8EC",
  text: "#111318",
  muted: "#5B6270",
  primary: "#047857",
  primarySoft: "#ECFDF5",
  accent: "#C2410C",
  accentSoft: "#FFF7ED",
} as const

function fillRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
  stroke?: string,
  lineWidth = 2
) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = lineWidth
    ctx.stroke()
  }
}

function truncateSingleLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let chars = Array.from(text)
  while (chars.length > 1 && ctx.measureText(`${chars.join("").trimEnd()}…`).width > maxWidth) {
    chars = chars.slice(0, -1)
  }
  return `${chars.join("").trimEnd()}…`
}

/** Splits text into at most `maxLines` lines that fit within `maxWidth`, adding an ellipsis if truncated. */
export function wrapCanvasLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean)
  if (words.length === 0 || maxLines <= 0) return []

  const lines: string[] = []
  let current = ""

  for (let i = 0; i < words.length; i++) {
    const word = words[i]!
    const candidate = current ? `${current} ${word}` : word
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate
      continue
    }
    if (current) {
      lines.push(truncateSingleLine(ctx, current, maxWidth))
      current = word
    } else {
      lines.push(truncateSingleLine(ctx, word, maxWidth))
      current = ""
    }
    if (lines.length === maxLines) {
      return appendEllipsis(ctx, lines, maxWidth)
    }
  }

  if (current) {
    if (lines.length < maxLines) {
      lines.push(truncateSingleLine(ctx, current, maxWidth))
    } else {
      return appendEllipsis(ctx, lines, maxWidth)
    }
  }

  return lines
}

function appendEllipsis(ctx: CanvasRenderingContext2D, lines: string[], maxWidth: number): string[] {
  const out = [...lines]
  const lastIndex = out.length - 1
  if (lastIndex < 0) return out
  const existing = out[lastIndex]!
  if (existing.endsWith("…") && ctx.measureText(existing).width <= maxWidth) return out
  let chars = Array.from(existing.replace(/…$/, ""))
  while (chars.length > 1 && ctx.measureText(`${chars.join("").trimEnd()}…`).width > maxWidth) {
    chars = chars.slice(0, -1)
  }
  out[lastIndex] = `${chars.join("").trimEnd()}…`
  return out
}

/** Draws a QR matrix sharply on a white background with exact integer pixel alignment. */
export function drawQrMatrix(ctx: CanvasRenderingContext2D, matrix: QrMatrix, x: number, y: number, boxSize: number) {
  ctx.fillStyle = "#FFFFFF"
  ctx.fillRect(x, y, boxSize, boxSize)

  if (matrix.size <= 0 || matrix.bits.length < matrix.size * matrix.size) return
  const cell = Math.floor(boxSize / matrix.size)
  if (cell <= 0) return
  const renderedSize = cell * matrix.size
  const offsetX = Math.floor(x + (boxSize - renderedSize) / 2)
  const offsetY = Math.floor(y + (boxSize - renderedSize) / 2)

  ctx.fillStyle = COLORS.text
  for (let row = 0; row < matrix.size; row++) {
    const rowStart = row * matrix.size
    for (let col = 0; col < matrix.size; col++) {
      if (matrix.bits[rowStart + col] === "1") {
        ctx.fillRect(offsetX + col * cell, offsetY + row * cell, cell, cell)
      }
    }
  }
}

function drawBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: { bg: string; fg: string; fontSize?: number; height?: number; padX?: number; sansFont: string }
): number {
  const fontSize = options.fontSize ?? 24
  const height = options.height ?? 48
  const padX = options.padX ?? 20
  ctx.font = `700 ${fontSize}px ${options.sansFont}`
  const textWidth = ctx.measureText(text).width
  const width = Math.ceil(textWidth + padX * 2)
  fillRoundedRect(ctx, x, y, width, height, 8, options.bg)
  ctx.fillStyle = options.fg
  ctx.textBaseline = "middle"
  ctx.fillText(text, x + padX, y + height / 2 + 1)
  return width
}

function drawGiveBrand(ctx: CanvasRenderingContext2D, rightEdge: number, y: number, sansFont: string) {
  ctx.font = `700 34px ${sansFont}`
  const labelWidth = ctx.measureText("Give").width
  const markSize = 44
  const gap = 12
  const startX = rightEdge - (markSize + gap + labelWidth)

  fillRoundedRect(ctx, startX, y, markSize, markSize, 8, COLORS.primary)
  ctx.fillStyle = "#FFFFFF"
  ctx.font = `700 28px ${sansFont}`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("G", startX + markSize / 2, y + markSize / 2 + 1)

  ctx.textAlign = "left"
  ctx.fillStyle = COLORS.text
  ctx.font = `700 34px ${sansFont}`
  ctx.fillText("Give", startX + markSize + gap, y + markSize / 2 + 1)
}

/**
 * Renders the campaign QR poster onto `canvas` at full export resolution
 * (1080x1920 for Story 9:16, 1080x1080 for Square 1:1).
 */
export function renderPosterCanvas(
  canvas: HTMLCanvasElement,
  data: CampaignPosterData,
  format: PosterFormat,
  campaignUrl: string
) {
  const { width, height } = POSTER_DIMENSIONS[format]
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) return

  const sansFont = resolveCanvasSansFont()
  const isStory = format === "story"
  const isGive = data.type === "give"
  const topBarColor = isGive ? COLORS.primary : COLORS.accent
  const badgeBg = isGive ? COLORS.primarySoft : COLORS.accentSoft
  const badgeFg = isGive ? COLORS.primary : COLORS.accent
  const padX = 72
  const contentW = width - padX * 2
  const shortUrl = (() => {
    try {
      const parsed = new URL(campaignUrl)
      return `${parsed.host}${parsed.pathname}`
    } catch {
      return displayShortUrl(data.origin, data.path)
    }
  })()
  const linkQr = encodeQrMatrix(campaignUrl)

  // Background and top brand rule
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = topBarColor
  ctx.fillRect(0, 0, width, 16)

  // Header row: type badge (+ verified statement badge) and Give brand
  const headerY = isStory ? 84 : 56
  ctx.textAlign = "left"
  const typeW = drawBadge(ctx, data.typeBadge, padX, headerY, { bg: badgeBg, fg: badgeFg, sansFont })
  if (data.verifiedStatementBadge) {
    drawBadge(ctx, data.verifiedStatementBadge, padX + typeW + 14, headerY, {
      bg: COLORS.primarySoft,
      fg: COLORS.primary,
      fontSize: 22,
      sansFont,
    })
  }
  drawGiveBrand(ctx, width - padX, headerY + 2, sansFont)

  // Campaign title
  let cursorY = isStory ? 188 : 140
  const titleFontSize = isStory ? 54 : 42
  const titleLineHeight = isStory ? 70 : 54
  ctx.font = `700 ${titleFontSize}px ${sansFont}`
  ctx.fillStyle = COLORS.text
  ctx.textBaseline = "top"
  const titleLines = wrapCanvasLines(ctx, data.title, contentW, isStory ? 3 : 2)
  for (const line of titleLines) {
    ctx.fillText(line, padX, cursorY)
    cursorY += titleLineHeight
  }

  // Organizer line
  if (data.organizerName) {
    cursorY += isStory ? 16 : 10
    ctx.font = `500 ${isStory ? 28 : 24}px ${sansFont}`
    ctx.fillStyle = COLORS.muted
    const verifiedSuffix = data.organizerVerified ? " · Đã xác minh" : ""
    const orgLine = wrapCanvasLines(ctx, `${data.organizerName}${verifiedSuffix}`, contentW, 1)[0] ?? ""
    ctx.fillText(orgLine, padX, cursorY)
    cursorY += isStory ? 44 : 36
  }

  // Funding progress card
  cursorY += isStory ? 28 : 20
  const fundingH = isStory ? (data.showProgressBar ? 196 : 156) : data.showProgressBar ? 154 : 124
  fillRoundedRect(ctx, padX, cursorY, contentW, fundingH, 12, COLORS.surface, COLORS.border, 2)

  const innerX = padX + 32
  const innerW = contentW - 64
  const figureY = cursorY + (isStory ? 32 : 24)
  ctx.textBaseline = "top"
  ctx.font = `700 ${isStory ? 46 : 38}px ${sansFont}`
  ctx.fillStyle = COLORS.text
  ctx.fillText(data.raisedText, innerX, figureY)

  ctx.textAlign = "right"
  ctx.font = `700 ${isStory ? 38 : 32}px ${sansFont}`
  ctx.fillStyle = COLORS.primary
  ctx.fillText(`${data.percent}%`, innerX + innerW, figureY + 4)

  ctx.textAlign = "left"
  const subY = figureY + (isStory ? 60 : 48)
  ctx.font = `400 ${isStory ? 24 : 21}px ${sansFont}`
  ctx.fillStyle = COLORS.muted
  ctx.fillText(`${data.raisedLabel} · ${data.goalText}`, innerX, subY)

  if (data.showProgressBar) {
    const barY = subY + (isStory ? 46 : 38)
    const barH = 16
    fillRoundedRect(ctx, innerX, barY, innerW, barH, 6, COLORS.border)
    const fillW = Math.round((innerW * Math.max(0, Math.min(100, data.percent))) / 100)
    if (fillW > 0) {
      fillRoundedRect(ctx, innerX, barY, Math.max(12, fillW), barH, 6, COLORS.primary)
    }
  }

  cursorY += fundingH + (isStory ? 48 : 28)

  // QR section
  const footerH = isStory ? 120 : 88
  const qrAreaH = height - footerH - cursorY - (isStory ? 24 : 18)

  if (data.vietQr) {
    // Two QR boxes: VietQR direct transfer + Campaign link
    if (isStory) {
      const gap = 32
      const boxH = Math.floor((qrAreaH - gap) / 2)
      drawHorizontalQrCard(ctx, {
        x: padX,
        y: cursorY,
        width: contentW,
        height: boxH,
        qr: data.vietQr.qr,
        eyebrow: "VIETQR CHUYỂN KHOẢN",
        eyebrowColor: COLORS.primary,
        title: "Quét bằng app ngân hàng",
        detail: `${data.vietQr.bankName} · ${data.vietQr.maskedAccount}`,
        caption: "Chuyển thẳng vào tài khoản nhận đã xác minh của chiến dịch.",
        sansFont,
      })
      drawHorizontalQrCard(ctx, {
        x: padX,
        y: cursorY + boxH + gap,
        width: contentW,
        height: boxH,
        qr: linkQr,
        eyebrow: "TRANG CHIẾN DỊCH",
        eyebrowColor: COLORS.muted,
        title: "Xem sao kê & nhận mã ủng hộ",
        detail: shortUrl,
        caption: "Quét camera để theo dõi sao kê công khai và nhận mã đối chiếu riêng.",
        sansFont,
      })
    } else {
      const gap = 28
      const colW = Math.floor((contentW - gap) / 2)
      drawCompactQrCard(ctx, {
        x: padX,
        y: cursorY,
        width: colW,
        height: qrAreaH,
        qr: data.vietQr.qr,
        title: "VietQR chuyển khoản",
        subtitle: `${data.vietQr.bankName} · ${data.vietQr.maskedAccount}`,
        highlight: true,
        sansFont,
      })
      drawCompactQrCard(ctx, {
        x: padX + colW + gap,
        y: cursorY,
        width: colW,
        height: qrAreaH,
        qr: linkQr,
        title: "Trang chiến dịch & sao kê",
        subtitle: shortUrl,
        highlight: false,
        sansFont,
      })
    }
  } else {
    // Campaign-link QR ONLY (payments_stopped_at set, closed/back campaign, or no usable account)
    fillRoundedRect(ctx, padX, cursorY, contentW, qrAreaH, 12, COLORS.surface, COLORS.border, 2)
    const qrSize = isStory ? Math.min(540, qrAreaH - 220) : Math.min(310, qrAreaH - 130)
    const qrX = Math.floor(padX + (contentW - qrSize) / 2)
    const qrY = Math.floor(cursorY + (isStory ? 64 : 28))
    fillRoundedRect(ctx, qrX - 16, qrY - 16, qrSize + 32, qrSize + 32, 10, "#FFFFFF", COLORS.border, 2)
    drawQrMatrix(ctx, linkQr, qrX, qrY, qrSize)

    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    ctx.font = `700 ${isStory ? 34 : 26}px ${sansFont}`
    ctx.fillStyle = COLORS.text
    ctx.fillText("Quét mã QR để xem chiến dịch", width / 2, qrY + qrSize + (isStory ? 44 : 26))

    ctx.font = `500 ${isStory ? 26 : 21}px ${sansFont}`
    ctx.fillStyle = COLORS.primary
    const urlLine = wrapCanvasLines(ctx, shortUrl, contentW - 80, 1)[0] ?? shortUrl
    ctx.fillText(urlLine, width / 2, qrY + qrSize + (isStory ? 96 : 64))
    ctx.textAlign = "left"
  }

  // Footer transparency rule
  const footerY = height - footerH
  ctx.strokeStyle = COLORS.border
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(padX, footerY)
  ctx.lineTo(width - padX, footerY)
  ctx.stroke()

  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.font = `600 ${isStory ? 24 : 21}px ${sansFont}`
  ctx.fillStyle = COLORS.primary
  const footerCopy = isGive
    ? "give.vn · Sao kê đối chiếu ngân hàng · Give không giữ tiền"
    : "give.vn · Gây quỹ minh bạch · Sao kê công khai"
  ctx.fillText(footerCopy, width / 2, footerY + footerH / 2)
  ctx.textAlign = "left"
}

function drawHorizontalQrCard(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number
    y: number
    width: number
    height: number
    qr: QrMatrix
    eyebrow: string
    eyebrowColor: string
    title: string
    detail: string
    caption: string
    sansFont: string
  }
) {
  fillRoundedRect(ctx, opts.x, opts.y, opts.width, opts.height, 12, COLORS.surface, COLORS.border, 2)
  const pad = 36
  const qrBoxSize = Math.min(opts.height - pad * 2, 340)
  const qrX = opts.x + pad
  const qrY = Math.floor(opts.y + (opts.height - qrBoxSize) / 2)

  fillRoundedRect(ctx, qrX - 10, qrY - 10, qrBoxSize + 20, qrBoxSize + 20, 8, "#FFFFFF", COLORS.border, 2)
  drawQrMatrix(ctx, opts.qr, qrX, qrY, qrBoxSize)

  const textX = qrX + qrBoxSize + 40
  const textW = opts.x + opts.width - pad - textX
  let y = qrY + 12

  ctx.textAlign = "left"
  ctx.textBaseline = "top"
  ctx.font = `700 22px ${opts.sansFont}`
  ctx.fillStyle = opts.eyebrowColor
  ctx.fillText(opts.eyebrow, textX, y)
  y += 40

  ctx.font = `700 32px ${opts.sansFont}`
  ctx.fillStyle = COLORS.text
  const titleLines = wrapCanvasLines(ctx, opts.title, textW, 2)
  for (const line of titleLines) {
    ctx.fillText(line, textX, y)
    y += 42
  }

  y += 10
  ctx.font = `600 26px ${opts.sansFont}`
  ctx.fillStyle = COLORS.primary
  const detailLines = wrapCanvasLines(ctx, opts.detail, textW, 2)
  for (const line of detailLines) {
    ctx.fillText(line, textX, y)
    y += 34
  }

  y += 12
  ctx.font = `400 22px ${opts.sansFont}`
  ctx.fillStyle = COLORS.muted
  const capLines = wrapCanvasLines(ctx, opts.caption, textW, 3)
  for (const line of capLines) {
    ctx.fillText(line, textX, y)
    y += 30
  }
}

function drawCompactQrCard(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number
    y: number
    width: number
    height: number
    qr: QrMatrix
    title: string
    subtitle: string
    highlight: boolean
    sansFont: string
  }
) {
  fillRoundedRect(
    ctx,
    opts.x,
    opts.y,
    opts.width,
    opts.height,
    12,
    opts.highlight ? COLORS.primarySoft : COLORS.surface,
    opts.highlight ? COLORS.primary : COLORS.border,
    2
  )
  const qrSize = Math.min(opts.width - 96, opts.height - 150, 290)
  const qrX = Math.floor(opts.x + (opts.width - qrSize) / 2)
  const qrY = opts.y + 28

  fillRoundedRect(ctx, qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, 8, "#FFFFFF", COLORS.border, 2)
  drawQrMatrix(ctx, opts.qr, qrX, qrY, qrSize)

  ctx.textAlign = "center"
  ctx.textBaseline = "top"
  const centerX = opts.x + opts.width / 2
  ctx.font = `700 24px ${opts.sansFont}`
  ctx.fillStyle = COLORS.text
  ctx.fillText(opts.title, centerX, qrY + qrSize + 24)

  ctx.font = `600 20px ${opts.sansFont}`
  ctx.fillStyle = opts.highlight ? COLORS.primary : COLORS.muted
  const sub = wrapCanvasLines(ctx, opts.subtitle, opts.width - 40, 1)[0] ?? opts.subtitle
  ctx.fillText(sub, centerX, qrY + qrSize + 60)
  ctx.textAlign = "left"
}

/**
 * Renders the 1080x1080 "Tôi đã chung tay" shareable thank-you card onto `canvas`.
 * Strictly omits any VND figure when `model.amountText === null`.
 */
export function renderThankYouCanvas(canvas: HTMLCanvasElement, model: ThankYouCardModel) {
  const size = 1080
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) return

  const sansFont = resolveCanvasSansFont()
  const padX = 80
  const contentW = size - padX * 2

  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = COLORS.primary
  ctx.fillRect(0, 0, size, 18)

  // Top bar: Give wordmark & badge
  const headerY = 64
  ctx.textAlign = "left"
  drawBadge(ctx, model.typeBadge, padX, headerY, {
    bg: model.typeBadge === "Dự án" ? COLORS.accentSoft : COLORS.primarySoft,
    fg: model.typeBadge === "Dự án" ? COLORS.accent : COLORS.primary,
    sansFont,
  })
  drawGiveBrand(ctx, size - padX, headerY + 2, sansFont)

  // Headline banner
  let y = 168
  fillRoundedRect(ctx, padX, y, contentW, 196, 12, COLORS.primarySoft)
  ctx.textAlign = "left"
  ctx.textBaseline = "top"
  ctx.font = `700 58px ${sansFont}`
  ctx.fillStyle = COLORS.primary
  ctx.fillText(model.headline, padX + 40, y + 36)

  ctx.font = `600 32px ${sansFont}`
  ctx.fillStyle = COLORS.text
  const donorLine = wrapCanvasLines(ctx, model.donorName, contentW - 80, 1)[0] ?? model.donorName
  ctx.fillText(donorLine, padX + 40, y + 118)
  y += 236

  // Campaign title block
  ctx.font = `500 24px ${sansFont}`
  ctx.fillStyle = COLORS.muted
  ctx.fillText("Chiến dịch", padX, y)
  y += 38

  ctx.font = `700 40px ${sansFont}`
  ctx.fillStyle = COLORS.text
  const titleLines = wrapCanvasLines(ctx, model.campaignTitle, contentW, 3)
  for (const line of titleLines) {
    ctx.fillText(line, padX, y)
    y += 52
  }

  // Amount & verification card
  y = Math.max(y + 32, 620)
  const cardH = 260
  fillRoundedRect(ctx, padX, y, contentW, cardH, 12, COLORS.surface, COLORS.border, 2)

  const innerX = padX + 40
  const innerW = contentW - 80

  ctx.textAlign = "left"
  ctx.textBaseline = "top"
  ctx.font = `500 24px ${sansFont}`
  ctx.fillStyle = COLORS.muted
  ctx.fillText(model.amountCaption, innerX, y + 32)

  if (model.amountText !== null) {
    ctx.font = `700 52px ${sansFont}`
    ctx.fillStyle = COLORS.primary
    ctx.fillText(model.amountText, innerX, y + 72, innerW)
  } else {
    ctx.font = `600 28px ${sansFont}`
    ctx.fillStyle = COLORS.text
    const hiddenLines = wrapCanvasLines(ctx, "Số tiền được ẩn theo lựa chọn của người ủng hộ", innerW, 2)
    hiddenLines.forEach((line, index) => {
      ctx.fillText(line, innerX, y + 74 + index * 36)
    })
  }

  // Divider inside summary card
  const divY = y + 158
  ctx.strokeStyle = COLORS.border
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(innerX, divY)
  ctx.lineTo(innerX + innerW, divY)
  ctx.stroke()

  // Verification code (monospace per DESIGN.md Reference codes) & date
  ctx.font = `500 22px ${sansFont}`
  ctx.fillStyle = COLORS.muted
  ctx.fillText("Mã đối chiếu sao kê", innerX, divY + 20)

  ctx.font = `700 34px ${MONO_FONT}`
  ctx.fillStyle = COLORS.text
  ctx.fillText(model.referenceCode, innerX, divY + 52)

  if (model.dateText) {
    ctx.textAlign = "right"
    ctx.font = `500 22px ${sansFont}`
    ctx.fillStyle = COLORS.muted
    ctx.fillText("Ngày ghi nhận", innerX + innerW, divY + 20)

    ctx.font = `600 28px ${sansFont}`
    ctx.fillStyle = COLORS.text
    ctx.fillText(model.dateText, innerX + innerW, divY + 54)
    ctx.textAlign = "left"
  }

  // Transparency footer
  const footerTop = 948
  ctx.strokeStyle = COLORS.border
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(padX, footerTop)
  ctx.lineTo(size - padX, footerTop)
  ctx.stroke()

  ctx.textAlign = "center"
  ctx.textBaseline = "top"
  ctx.font = `600 22px ${sansFont}`
  ctx.fillStyle = COLORS.primary
  ctx.fillText(model.footerText, size / 2, footerTop + 26)

  ctx.font = `400 20px ${sansFont}`
  ctx.fillStyle = COLORS.muted
  const urlLine = wrapCanvasLines(ctx, `Sao kê: ${model.statementUrlText}`, contentW, 1)[0] ?? model.statementUrlText
  ctx.fillText(urlLine, size / 2, footerTop + 64)
  ctx.textAlign = "left"
}

/** Waits for web fonts (Be Vietnam Pro) to settle before drawing or exporting canvas text. */
export async function waitForCanvasFonts(): Promise<void> {
  if (typeof document !== "undefined" && "fonts" in document && document.fonts?.ready) {
    try {
      await document.fonts.ready
    } catch {
      // Proceed with fallback system font if FontFaceSet rejects.
    }
  }
}

/** Exports an HTMLCanvasElement as a PNG file download; returns false if the browser cannot encode a blob. */
export async function exportCanvasPng(canvas: HTMLCanvasElement, filename: string): Promise<boolean> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(false)
        return
      }
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = filename
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      resolve(true)
    }, "image/png")
  })
}
