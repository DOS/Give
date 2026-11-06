import { renderSVG } from "uqr"

import { hasValidCrc } from "./crc16"
import { VietQrError } from "./payload"

// Format version 01, static or dynamic, then the NAPAS consumer account template (ID 38).
const VIETQR_HEAD = /^00020101021[12]38\d{2}0010A000000727/

/**
 * The QR image for a VietQR payload as an SVG document. Error correction M
 * and the 4-module quiet zone the QR standard asks for keep it readable by
 * banking apps on screens and printouts.
 */
export function renderVietQrSvg(payload: string): string {
  if (!VIETQR_HEAD.test(payload) || !hasValidCrc(payload)) {
    throw new VietQrError("VIETQR_PAYLOAD_INVALID", "Not a VietQR payload with a valid CRC")
  }
  return renderSVG(payload, { ecc: "M", border: 4 })
}
