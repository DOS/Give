import { crc16 } from "./crc16"

/**
 * VietQR payloads for NAPAS247 transfers, per "Tài liệu quy định định dạng mã
 * VietQR trong dịch vụ chuyển nhanh NAPAS247" v1.0 (NAPAS, 09/2021), which
 * follows the EMVCo merchant-presented QR specification.
 */

export class VietQrError extends Error {
  constructor(
    readonly code:
      | "VIETQR_BANK_BIN_INVALID"
      | "VIETQR_CONSUMER_ID_INVALID"
      | "VIETQR_AMOUNT_INVALID"
      | "VIETQR_TEXT_INVALID"
      | "VIETQR_ADD_INFO_INVALID"
      | "VIETQR_PAYLOAD_INVALID",
    message: string
  ) {
    super(message)
    this.name = "VietQrError"
  }
}

/** NAPAS's AID, the GUID (ID 00) inside the consumer account template (ID 38). */
const NAPAS_AID = "A000000727"

const SERVICE_CODES = {
  account: "QRIBFTTA",
  card: "QRIBFTTC",
} as const

export type VietQrService = keyof typeof SERVICE_CODES

export interface VietQrFields {
  /** Six-digit bank BIN issued by the State Bank of Vietnam, e.g. "970403". */
  bankBin: string
  /** Account number (service "account") or card number (service "card"), at most 19 characters. */
  consumerId: string
  service: VietQrService
  /** Amount in whole VND. With an amount the code is dynamic (ID 01 = "12"), without it static ("11"). */
  amount?: bigint | number
  /** ID 62, sub-ID 01. */
  billNumber?: string
  /** ID 62, sub-ID 08: the transfer content banking apps prefill. */
  purpose?: string
}

const MAX_AMOUNT_DIGITS = 13
// EMV's common character set for ANS fields: printable ASCII, so no diacritics.
const ANS = /^[\x20-\x7e]+$/

/** One ID/length/value data object; lengths count characters and must be 01-99. */
function tlv(id: string, value: string): string {
  if (value.length < 1 || value.length > 99) {
    throw new VietQrError("VIETQR_PAYLOAD_INVALID", `Data object ${id} must hold 1-99 characters`)
  }
  return id + String(value.length).padStart(2, "0") + value
}

function ansField(name: string, value: string, max: number): string {
  if (value.length > max || !ANS.test(value)) {
    throw new VietQrError("VIETQR_TEXT_INVALID", `${name} must be 1-${max} printable ASCII characters`)
  }
  return value
}

/** Whole VND as a string of digits, rejecting zero, negatives, fractions and anything over 13 digits. */
export function formatAmount(amount: bigint | number): string {
  let digits: string | null = null
  if (typeof amount === "bigint" && amount > BigInt(0)) digits = amount.toString()
  if (typeof amount === "number" && Number.isSafeInteger(amount) && amount > 0) digits = String(amount)
  if (digits === null || digits.length > MAX_AMOUNT_DIGITS) {
    throw new VietQrError("VIETQR_AMOUNT_INVALID", "Amount must be a positive whole number of VND, at most 13 digits")
  }
  return digits
}

/** The consumer account information template (ID 38): NAPAS GUID, bank BIN plus account or card, service code. */
export function consumerAccountInformation(bankBin: string, consumerId: string, service: VietQrService): string {
  if (!/^\d{6}$/.test(bankBin)) {
    throw new VietQrError("VIETQR_BANK_BIN_INVALID", "Bank BIN must be 6 digits")
  }
  if (!/^[0-9A-Za-z]{1,19}$/.test(consumerId)) {
    throw new VietQrError("VIETQR_CONSUMER_ID_INVALID", "Account or card number must be 1-19 letters or digits")
  }
  const beneficiary = tlv("00", bankBin) + tlv("01", consumerId)
  return tlv("38", tlv("00", NAPAS_AID) + tlv("01", beneficiary) + tlv("02", SERVICE_CODES[service]))
}

/** Encodes a NAPAS247 VietQR payload, CRC included, in the field order of the NAPAS examples. */
export function encodeVietQr(fields: VietQrFields): string {
  const dynamic = fields.amount !== undefined
  let payload =
    tlv("00", "01") +
    tlv("01", dynamic ? "12" : "11") +
    consumerAccountInformation(fields.bankBin, fields.consumerId, fields.service) +
    tlv("53", "704")
  if (fields.amount !== undefined) payload += tlv("54", formatAmount(fields.amount))
  payload += tlv("58", "VN")

  let additional = ""
  if (fields.billNumber !== undefined) additional += tlv("01", ansField("Bill number", fields.billNumber, 25))
  if (fields.purpose !== undefined) additional += tlv("08", ansField("Purpose", fields.purpose, 25))
  if (additional) payload += tlv("62", additional)

  payload += "6304"
  return payload + crc16(payload)
}

/** Letters every Give donation code starts with, so it cannot match digit runs banks add to the content. */
export const DONATION_CODE_PREFIX = "GV"
/** Uppercase letters and digits without the look-alikes 0, O, 1, I and L. */
export const DONATION_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
/**
 * A donation code (docs/Give-Technical-Design.md, matching rules): "GV", six
 * characters from the alphabet and an optional check character. The fixed
 * length lets the matcher cut the code out of statement text that has lost
 * its separators, and at 8-9 characters it fits G3 (at most 10) and payOS's
 * 9-character description for non-linked accounts.
 */
export const DONATION_CODE = new RegExp(`^${DONATION_CODE_PREFIX}[${DONATION_CODE_ALPHABET}]{6,7}$`)

/** True for a donation reference code Give can put in the transfer content. */
export function isDonationCode(value: unknown): value is string {
  return typeof value === "string" && DONATION_CODE.test(value)
}

export interface DonationQrInput {
  bankBin: string
  accountNumber: string
  amount: bigint | number
  /** The donation reference code, which the matcher looks for in the bank statement. */
  addInfo: string
}

/** The dynamic VietQR payload a donor scans to pay one contribution into the campaign's account. */
export function buildDonationPayload(input: DonationQrInput): string {
  if (!isDonationCode(input.addInfo)) {
    throw new VietQrError(
      "VIETQR_ADD_INFO_INVALID",
      `Reference code must be "${DONATION_CODE_PREFIX}" plus 6 or 7 characters from ${DONATION_CODE_ALPHABET}`
    )
  }
  return encodeVietQr({
    bankBin: input.bankBin,
    consumerId: input.accountNumber,
    service: "account",
    amount: input.amount,
    purpose: input.addInfo,
  })
}
