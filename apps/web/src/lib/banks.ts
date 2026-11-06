/**
 * Banks an organizer can declare a receiving account at, by the six-digit
 * BIN that NAPAS and VietQR use (source: the VietQR bank list,
 * api.vietqr.io/v2/banks, read 2026-11-01). E-wallets, finance companies and
 * the policy bank are left out: a campaign receives into a bank account.
 */

export interface Bank {
  bin: string
  shortName: string
  name: string
}

export const BANKS: readonly Bank[] = [
  { bin: "970436", shortName: "Vietcombank", name: "Ngân hàng TMCP Ngoại thương Việt Nam" },
  { bin: "970415", shortName: "VietinBank", name: "Ngân hàng TMCP Công thương Việt Nam" },
  { bin: "970418", shortName: "BIDV", name: "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam" },
  { bin: "970405", shortName: "Agribank", name: "Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam" },
  { bin: "970407", shortName: "Techcombank", name: "Ngân hàng TMCP Kỹ thương Việt Nam" },
  { bin: "970422", shortName: "MBBank", name: "Ngân hàng TMCP Quân đội" },
  { bin: "970416", shortName: "ACB", name: "Ngân hàng TMCP Á Châu" },
  { bin: "970432", shortName: "VPBank", name: "Ngân hàng TMCP Việt Nam Thịnh Vượng" },
  { bin: "970423", shortName: "TPBank", name: "Ngân hàng TMCP Tiên Phong" },
  { bin: "970403", shortName: "Sacombank", name: "Ngân hàng TMCP Sài Gòn Thương Tín" },
  { bin: "970437", shortName: "HDBank", name: "Ngân hàng TMCP Phát triển Thành phố Hồ Chí Minh" },
  { bin: "970441", shortName: "VIB", name: "Ngân hàng TMCP Quốc tế Việt Nam" },
  { bin: "970443", shortName: "SHB", name: "Ngân hàng TMCP Sài Gòn – Hà Nội" },
  { bin: "970431", shortName: "Eximbank", name: "Ngân hàng TMCP Xuất Nhập khẩu Việt Nam" },
  { bin: "970426", shortName: "MSB", name: "Ngân hàng TMCP Hàng Hải" },
  { bin: "970448", shortName: "OCB", name: "Ngân hàng TMCP Phương Đông" },
  { bin: "970440", shortName: "SeABank", name: "Ngân hàng TMCP Đông Nam Á" },
  { bin: "970449", shortName: "LPBank", name: "Ngân hàng TMCP Lộc Phát Việt Nam" },
  { bin: "970454", shortName: "BVBank", name: "Ngân hàng TMCP Bản Việt" },
  { bin: "970429", shortName: "SCB", name: "Ngân hàng TMCP Sài Gòn" },
  { bin: "970400", shortName: "Saigonbank", name: "Ngân hàng TMCP Sài Gòn Công Thương" },
  { bin: "970409", shortName: "BacABank", name: "Ngân hàng TMCP Bắc Á" },
  { bin: "970412", shortName: "PVcomBank", name: "Ngân hàng TMCP Đại Chúng Việt Nam" },
  { bin: "970414", shortName: "MBV", name: "Ngân hàng TNHH MTV Việt Nam Hiện Đại" },
  { bin: "970419", shortName: "NCB", name: "Ngân hàng TMCP Quốc Dân" },
  { bin: "970425", shortName: "ABBANK", name: "Ngân hàng TMCP An Bình" },
  { bin: "970427", shortName: "VietABank", name: "Ngân hàng TMCP Việt Á" },
  { bin: "970428", shortName: "NamABank", name: "Ngân hàng TMCP Nam Á" },
  { bin: "970430", shortName: "PGBank", name: "Ngân hàng TMCP Thịnh vượng và Phát triển" },
  { bin: "970433", shortName: "VietBank", name: "Ngân hàng TMCP Việt Nam Thương Tín" },
  { bin: "970438", shortName: "BaoVietBank", name: "Ngân hàng TMCP Bảo Việt" },
  { bin: "970446", shortName: "Co-opBank", name: "Ngân hàng Hợp tác xã Việt Nam" },
  { bin: "970452", shortName: "KienLongBank", name: "Ngân hàng TMCP Kiên Long" },
  { bin: "970444", shortName: "CBBank", name: "Ngân hàng TNHH MTV Ngoại thương Công nghệ số (Vietcombank Neo)" },
  { bin: "970408", shortName: "GPBank", name: "Ngân hàng TNHH MTV Dầu Khí Toàn Cầu" },
  { bin: "970406", shortName: "Vikki", name: "Ngân hàng TNHH MTV số Vikki" },
  { bin: "970421", shortName: "VRB", name: "Ngân hàng Liên doanh Việt – Nga" },
  { bin: "970434", shortName: "IndovinaBank", name: "Ngân hàng TNHH Indovina" },
  { bin: "970424", shortName: "ShinhanBank", name: "Ngân hàng TNHH MTV Shinhan Việt Nam" },
  { bin: "970457", shortName: "Woori", name: "Ngân hàng TNHH MTV Woori Việt Nam" },
  { bin: "970439", shortName: "PublicBank", name: "Ngân hàng TNHH MTV Public Việt Nam" },
  { bin: "970442", shortName: "HongLeong", name: "Ngân hàng TNHH MTV Hong Leong Việt Nam" },
  { bin: "970410", shortName: "StandardChartered", name: "Ngân hàng TNHH MTV Standard Chartered Việt Nam" },
  { bin: "458761", shortName: "HSBC", name: "Ngân hàng TNHH MTV HSBC (Việt Nam)" },
  { bin: "422589", shortName: "CIMB", name: "Ngân hàng TNHH MTV CIMB Việt Nam" },
  { bin: "970458", shortName: "UOB", name: "Ngân hàng United Overseas – Chi nhánh TP. Hồ Chí Minh" },
  { bin: "668888", shortName: "KBank", name: "Ngân hàng Đại chúng TNHH Kasikornbank" },
]

const BY_BIN = new Map(BANKS.map((bank) => [bank.bin, bank]))

export function bankByBin(bin: string | null | undefined): Bank | null {
  return (bin && BY_BIN.get(bin)) || null
}

/** "Vietcombank" for a known BIN, otherwise the BIN itself. */
export function bankLabel(bin: string | null | undefined): string {
  return bankByBin(bin)?.shortName ?? bin ?? "—"
}
