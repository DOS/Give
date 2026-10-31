import { renderSVG } from "uqr"

import { hasValidCrc } from "./crc16"
import { VietQrError } from "./payload"

/**
 * The QR image for a VietQR payload as an SVG document. Error correction M
 * and the 4-module quiet zone the QR standard asks for keep it readable by
 * banking apps on screens and printouts.
 */
export function renderVietQrSvg(payload: string): string {
  if (!payload.startsWith("000201") || !hasValidCrc(payload)) {
    throw new VietQrError("VIETQR_PAYLOAD_INVALID", "Not a VietQR payload with a valid CRC")
  }
  return renderSVG(payload, { ecc: "M", border: 4 })
}
