/**
 * CRC-16/CCITT-FALSE (polynomial 0x1021, initial value 0xFFFF), the checksum
 * EMVCo merchant-presented QR codes and VietQR put in ID "63". It runs over
 * the UTF-8 bytes of the payload up to and including "6304", and is written
 * as four uppercase hex digits.
 */
export function crc16(text: string): string {
  let crc = 0xffff
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << 8
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0")
}

/** True when the payload ends in "6304" plus the CRC of everything before it. */
export function hasValidCrc(payload: string): boolean {
  const match = /^([\s\S]*6304)([0-9A-F]{4})$/.exec(payload)
  return match !== null && crc16(match[1]) === match[2]
}
