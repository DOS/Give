# Research: Vietnamese bank statement formats and transparent charity accounts

> Status: desk research for DOS/Give#10, written 2026-10-31. Input for open
> question **P3** (partner bank and preferred statement format) in
> `docs/Give-Technical-Design.md` section 9, and for the parser task
> DOS/Give#17. P3 stays JOY's decision; section 6 is a recommendation only.

## 1. Scope and method

- Banks: Vietcombank (VCB), VietinBank (VTB), BIDV, Techcombank (TCB), MB,
  ACB, plus every bank found to offer a public "transparent" charity account
  (only MB, through its Thiện Nguyện app; see 4.1).
- Questions per bank: statement export formats; whether each row has a stable
  transaction id and a running balance (the `hasStableRowId` /
  `hasRunningBalance` rule in the design, section 5.2); the transfer-content
  length limit (assumption G3); public statement pages; balance-change API or
  webhook and who can get it; what an individual needs to open a dedicated
  account.
- Sources: public bank pages and user guides, NAPAS/VietQR-related pages,
  official announcements, Vietnamese press, and public pages of payment
  intermediaries. No sign-ups, logins, bank contact, paid services or personal
  data. Every fact links its source; quotes are short and in the original
  language.
- Confidence tags used in the tables:
  - no tag: read on the cited page (official bank page or document unless
    noted);
  - _(press)_ or _(3rd party)_: read on the cited page, but the page is not
    the bank's. Press includes the Vietnam Banks Association news site
    (vnba.org.vn); 3rd party includes government portals and payment
    intermediaries such as payOS, Casso and SePay;
  - _(snippet)_: seen only in a search-result summary; the page itself could
    not be read (several bank sites block automated reading or render with
    JavaScript). Treat as unverified;
  - **unknown**: no public source found.

## 2. Comparison: statement files

| Bank        | Export formats                                                                                                                                                                                                                    | Stable row id                                                                                                                                                                                                                                                                           | Running balance per row                                                                                                                                                                                | Transfer-content limit                                                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Vietcombank | **unknown** for app/web exports. Statement layouts differ between paper and online requests [vcb-1] _(press)_. One VCB-format statement was published as a PDF re-saved through Excel, channel unknown [vcb-2] _(3rd party host)_ | Likely: that file has a "Số tham chiếu" column, e.g. `5078 - 45892`; uniqueness unverified [vcb-2] _(3rd party host)_                                                                                                                                                                   | No in that file: columns are date, reference, debit, credit, description [vcb-2] _(3rd party host)_; VCB said end-of-day balance is shown once per day [vcb-1] _(press)_                               | **unknown**. Descriptions in [vcb-2] have no diacritics and are wrapped by the bank (see 5.2)                                                 |
| VietinBank  | Personal web: PDF or Excel [vtb-1] _(3rd party)_. Organisations: SWIFT MT940/950 [vtb-2] _(press)_                                                                                                                                | **unknown**. The MTTQ file had a serial number, time, description, amount and counterparty name, but no bank id [vtb-4] _(press)_                                                                                                                                                       | **unknown**. The same MTTQ file had no balance column [vtb-4] _(press)_                                                                                                                                | 210 characters in the eFAST (business) transfer file [vtb-5]. Personal and NAPAS: **unknown**                                                 |
| BIDV        | **unknown** format. Personal statements are emailed or shown in app/web, free [bidv-1]. MTTQ published BIDV statements as PDF [bidv-2] _(press)_                                                                                  | **unknown**                                                                                                                                                                                                                                                                             | **unknown**                                                                                                                                                                                            | **unknown**                                                                                                                                   |
| Techcombank | Personal app: PDF or XLS, password-protected file [tcb-1]. Business web: transaction list as CSV or XLSX, monthly statements for up to 36 months [tcb-2]                                                                          | Likely for business: the transaction detail view has "Số tham chiếu" and the list can be searched by "Mã giao dịch"; since 25/10/2025 monthly statements match the core system (T24) and show transaction and value dates. Export columns not documented [tcb-2]. Personal: **unknown** | **unknown**. The business guide has a "Lịch sử số dư" (balance history) view and says "số dư" cannot be used to search the list, which hints at a balance field; export columns not documented [tcb-2] | Business app: 140 characters; NAPAS 24/7 limited to 100 [tcb-3]. Personal: **unknown**                                                        |
| MB          | Personal app: PDF or CSV [mb-1] _(3rd party)_. Business (BIZ MBBank): Excel, or PDF signed by MB; up to 3 months per export, 1 year of history [mb-2] _(press, sponsored)_                                                        | **unknown** for statements. MB's mini-app payment API has a per-transaction `mbReferenceNumber` [mb-3] (an API, not the statement)                                                                                                                                                      | **unknown**. Casso says the official MB API gives no balance after transaction [mb-4] _(3rd party)_                                                                                                    | 210 characters for MB app transfers into an MBS securities account [mb-5] _(MBS, MB's securities subsidiary)_. General and NAPAS: **unknown** |
| ACB         | Personal web (2014 guide): Excel [acb-1]. Business ACB ONE BIZ: view, print, Excel; daily RJE/DOC files and monthly e-statement by email [acb-2]. Store accounts: Excel [acb-3]                                                   | Likely: guides offer "Liệt kê theo số tham chiếu" [acb-1] [acb-2]; a 2019 statement showed a "Số GD" column [acb-4] _(snippet)_                                                                                                                                                         | Likely: the same 2019 statement showed "Số dư" [acb-4] _(snippet)_                                                                                                                                     | **unknown** number. Content must be unaccented [acb-1] [acb-5]; batch upload rejects accents or over-length text [acb-2]                      |

## 3. Comparison: accounts and integrations

| Bank        | Public statement page for charity accounts                                                                                                                                                                          | Balance-change API / webhook, and who can get it                                                                                                                                                                                                                                                                                | Opening a dedicated account as an individual                                                                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vietcombank | None found. In 2025 MTTQ listed separate accounts for disclosed and undisclosed donations, at VCB and other banks [vcb-3] _(press)_                                                                                 | H2H or Open API for businesses, tailored per company [vcb-4] _(press)_. No public portal, nothing for individuals found                                                                                                                                                                                                         | Online in VCB Digibank with chip CCCD or VNeID plus biometrics [vcb-5] _(press)_. Chosen-number account for individuals 18+ holding fewer than 3 VND accounts [vcb-6] _(press)_                                                     |
| VietinBank  | None found. MTTQ's VTB account uses an alias (CT1111) [vtb-6]                                                                                                                                                       | Open API portal openapi.vietinbank.vn; businesses register online, sandbox [vtb-7] _(press)_. Real-time debit/credit push to the customer's endpoint, with an IP allow-list [vtb-3] _(snippet)_. Casso says it is VTB's official webhook partner [vtb-8] _(3rd party)_                                                          | Online through VNeID [vtb-9] _(3rd party)_. Alias for an account in iPay, fee per VTB policy [vtb-10]                                                                                                                               |
| BIDV        | None found                                                                                                                                                                                                          | Open API since 29/11/2023, 15 API products, businesses apply via the portal [bidv-3] _(3rd party)_; includes balance-change tracking for businesses [bidv-4] _(press)_. Individuals: **unknown**                                                                                                                                | eKYC in SmartBanking with chip CCCD; no minimum balance, no management fee; 100 million VND/month cap until upgraded at a branch [bidv-5]. Free alias (nickname, chosen digits) [bidv-6]                                            |
| Techcombank | None found                                                                                                                                                                                                          | H2H over API or SFTP for organisations, by contract; may be disconnected after 3 consecutive months below 500 transactions/month, with 30 days' notice [tcb-4]. Corporate fees: virtual-account collection, H2H setup [tcb-5]. Nothing for individuals found                                                                    | Online with chip CCCD (NFC) or VNeID; no opening fee, no minimum balance; the page cites the general legal minimum age of 15 and is marked expired [tcb-6]. First chosen-number account free, later ones from 1,000,000 VND [tcb-7] |
| MB          | **Yes: Thiện Nguyện app.** Free 4-digit transparent account for individuals and fundraising clubs, all transactions public in real time; public page per campaign with "Xuất sao kê" (see 4.1) [mb-6] [mb-7] [mb-8] | No official MB developer documentation readable. Official MB API reachable through Casso: personal accounts supported; business accounts need a 3-party contract [mb-4] _(3rd party)_. SePay: free MB API [mb-9] _(3rd party)_                                                                                                  | Online in the MB app with eKYC; chosen account number in app [mb-10] _(snippet)_. The Thiện Nguyện account itself is open to individuals [mb-6]                                                                                     |
| ACB         | None found. "Đóng góp xanh" (with Conservation Vietnam) uses a separate account per campaign with periodic statements; public access not stated [acb-6]                                                             | Developer portal developer.acb.com.vn: instant debit/credit notification and daily summary; balance and history queries (2023); statement queries for businesses (2025) [acb-7] [acb-8]. Partner-software product open to individuals and organisations [acb-9]. SePay: official ACB API for individuals [acb-10] _(3rd party)_ | Online in ACB ONE with eKYC: 18+, valid ID or passport; no management fee, no minimum balance [acb-11]. Chosen number from 0 VND [acb-12]                                                                                           |

## 4. Transparent charity accounts

### 4.1 MB Thiện Nguyện

- MB offers fundraising organisations and individuals a free 4-digit
  "transparent" payment account; every transaction is published automatically
  [mb-7] _(press)_. The 2021 launch post says it is for individuals and
  fundraising clubs [mb-6].
- The App Store listing (seller MB Bank) promises public statements and a
  public balance [mb-11].
- Public campaign pages follow `https://thiennguyen.app/donate-target/<id>`
  and show a "Xuất sao kê" (export statement) button, a donor list, a donation
  count and declared spending with or without receipts [mb-8]. The donor list
  loads in the browser, so the fields shown per transaction (sender name,
  balance, id) and the export format are **unknown**.
- The site lists fundraisers as organisations or individuals [mb-12].
- The Vietnam Red Cross uses MB 4-digit accounts by province [mb-13]
  _(press)_.
- Not an escrow: in a 2025 case, MB said an account may be temporarily locked
  on signs of abnormal withdrawals, and the platform is not responsible for
  the truthfulness or legality of campaigns [mb-14] _(press)_. This fits design decision D3 (Give never holds or
  controls money).

### 4.2 Other banks

No other covered bank (or Agribank, TPBank, VPBank) offered a dedicated,
publicly viewable charity account in this search. Public charity statements
in Vietnam are files the account holder publishes:

- The MTTQ (Vietnam Fatherland Front) 2024 Yagi relief statements were
  published as downloadable files (PDF per [bidv-2] _(press)_ and [x-3]
  _(3rd party)_): VCB 12,028 pages for 1–10/9/2024 [x-1] _(press)_ and 11,402
  pages for 15–23/9 [vcb-7] _(press)_; VTB 2,009 pages for 10–12/9 [x-2]
  _(press)_; BIDV 1,152 pages [bidv-2] _(press)_. People searched them by name
  or content [x-3] _(3rd party)_.
- In 2025 MTTQ listed separate accounts for disclosed and undisclosed
  donations, so donors could choose [vcb-3] _(press)_. That supports the design's anonymity warning
  (section 2.4): a bank-side public statement shows the sender.

## 5. Cross-bank findings

### 5.1 Transfer-content length (assumption G3)

- No official NAPAS limit was found. The only bank document with a NAPAS
  figure is Techcombank's: NAPAS 24/7 allows 100 characters [tcb-3]. Other
  figures: VietinBank eFAST allows 210 [vtb-5]; an MBS guide gives 210 for MB
  app transfers into MBS [mb-5].
- VietQR generators: vietqr.io API `addInfo` at most 25 characters, no
  diacritics [x-4] _(3rd party)_; vietqr.io quick link at most 50 [x-5]
  _(3rd party)_; api.vietqr.vn at most 23, no diacritics or special
  characters [x-6] _(3rd party)_.
- **payOS: `description` is limited to 9 characters for bank accounts not
  linked through payOS** [x-7] _(3rd party)_. A 10-character donation code does not fit the
  payOS channel in that case (design section 5.2 lists this limit as "to
  verify").
- SePay matches a 2–5 character case-insensitive prefix plus a digit or
  alphanumeric suffix (default 6–8 characters) by searching the content
  [x-8] _(3rd party)_, and passes the bank's content field through
  unprocessed [x-9] _(3rd party)_.
- Conclusion for G3: a code of at most 10 characters, uppercase letters and
  digits only, fits every documented bank/NAPAS/VietQR limit found, but not
  payOS for non-linked accounts (9). Whether any bank truncates or rewrites
  content on the receiving side is **unknown**; it needs real test transfers
  (see 7).

### 5.2 What a real statement row looks like

The only public statement with readable columns found is a Vietcombank-format
file of the Hai Phong Fatherland Front relief account, hosted on the city
portal [vcb-2] _(3rd party host)_. Its PDF was produced with Excel, so it was
probably re-saved by the account holder and the export channel is unknown:

- Columns: `Ngày giao dịch | Số tham chiếu | Số tiền ghi nợ | Số tiền ghi có |
Mô tả`. Dates have no time of day. No running balance.
- The bank wraps the donor's content: transfers from the VCB app look like
  `MBVCB.<number>.<content>.CT`; interbank transfers start with a long numeric
  prefix and the sender's name before the content. No diacritics.

Consequences for the design:

- The matcher must find the donation code anywhere in the description, and a
  fixed letter prefix on the code keeps it from matching digit runs in the
  bank's own prefixes.
- `booked_at` can be date-only for some banks; the parser must not invent a
  time.
- A VCB format of this shape has a candidate row id but no running balance,
  so it passes the section 5.2 rule on `hasStableRowId` alone, and only if
  "Số tham chiếu" proves unique per row (the values share prefixes such as
  `5078`).

### 5.3 Balance-change webhooks for small receivers

- Bank Open APIs (VTB, BIDV, TCB, Agribank [x-10] _(press)_, VCB) target
  businesses, usually by contract. ACB's portal is the only one found with a
  product open to individuals [acb-9].
- Intermediaries give individuals webhooks through official bank APIs:
  - SePay: official virtual accounts for ACB and MB (incoming); VietinBank
    virtual accounts for businesses only; other banks by internet-banking
    credentials or OAuth depending on the bank [x-11] _(3rd party)_.
  - Casso webhook V2 carries `reference`, `description`, `amount`,
    `runningBalance` and counterparty fields [x-12] _(3rd party)_, although
    for MB it says no balance after transaction is available [mb-4]
    _(3rd party)_.
  - payOS requires the bank account name to match the verified business,
    household-business or individual name [x-13] _(3rd party)_.
- Licences of these intermediaries were not checked (out of scope; see the
  legal research task DOS/Give#11).

## 6. Recommendation for the M1 parsers (JOY decides P3)

1. **MB, first.** It is the only bank found with a ready "transparent"
   charity account (Thiện Nguyện: free, open to individuals, public real-time
   statement), which is what design decision D4 prefers. An official MB API is
   reachable for personal accounts through intermediaries, which gives a path
   to the `bank_api` channel later. Statement export exists for personal (PDF,
   CSV) and business (Excel, signed PDF) users. **Risk:** MB's column layout is
   undocumented, and its site blocks automated reading, so
   `hasStableRowId` / `hasRunningBalance` must be settled from JOY's sample
   files. The export formats and the API path come from non-official sources
   (a third-party blog, sponsored press, and intermediaries' pages), so the
   samples must confirm them too.
2. **Techcombank, second.** It has the best-documented export in official
   guides: personal PDF or XLS, business CSV or XLSX over 36 months,
   transactions carrying "Số tham chiếu", monthly statements that match the
   core system since 25/10/2025, and a documented NAPAS content limit.
   **Risk:** export columns and running balance are not documented; personal
   XLS files are password-protected, so the upload flow (DOS/Give#20) must
   handle or explain that.

Alternative: **Vietcombank**, if JOY expects the first campaigners to bank
there. One public VCB-format statement (export channel unknown) shows a
reference column whose uniqueness is unverified, no running balance and dates
without time, and MTTQ's largest published statements were VCB's; but VCB's
export formats are not documented publicly. ACB is also workable (Excel,
reference filter, balance column in a snippet, an individual API via SePay)
but has no charity account product for individuals.

Parsers should target spreadsheet exports (XLSX/XLS/CSV) first. PDF
statements at MTTQ scale run to thousands of pages and are harder to parse
reliably.

## 7. Sample files needed from JOY for DOS/Give#17

For each bank JOY picks, real exports from an account JOY or a test organizer
controls, anonymized (see the rules below), sent privately to the parser
session, never committed raw:

1. **Spreadsheet export** (XLSX, XLS or CSV, whichever the bank offers) of one
   account for a period of at least 2 weeks with at least 20 rows, including:
   - an incoming transfer from the same bank;
   - an incoming NAPAS interbank transfer from another bank;
   - an incoming VietQR transfer carrying a test code such as `GIVETEST01`;
   - two incoming transfers on the same day with the same amount and the same
     content (to test duplicate groups);
   - one outgoing transfer, and any fee or interest row the bank adds;
   - one transfer with Vietnamese diacritics and one with content longer than
     100 characters (to see stripping and truncation).
2. **The same period as PDF**, to compare columns and decide whether PDF
   import is worth supporting.
3. **An overlapping second export** (for example days 1–15 and days 10–31) of
   the same account, to test re-import and duplicate detection.
4. **Business-channel export** where the campaigner might use it (for example
   Techcombank Business CSV/XLSX, BIZ MBBank Excel).
5. **For MB Thiện Nguyện:** the statement of the 4-digit account from the MB
   app, and the file from the public page's "Xuất sao kê" button.
6. **For Techcombank personal XLS:** the file as downloaded (password
   protected) and a note of how the password is formed, so the upload flow can
   explain it.

Anonymization rules:

- Replace names, account numbers and phone numbers with fake values, the same
  fake value for the same real value across all files.
- Keep everything else unchanged: header block, column order, date and number
  formats, encoding, sheet names, file type. Say which program was used if a
  file had to be re-saved, because re-saving can change formats.
- Keep the bank-added parts of the content (prefixes, suffixes, reference
  numbers); replace only personal parts inside them.

## 8. Gaps

- Native statement columns for VietinBank, BIDV, MB and personal Techcombank
  exports, and whether each row has a running balance: only real files can
  answer this.
- Official NAPAS 24/7 content length and the NAPAS QR field 62.08 maximum.
- Whether banks truncate or rewrite transfer content on the receiving side.
- Export formats of Vietcombank and BIDV apps.
- Fields and export format on Thiện Nguyện public pages, and its opening
  requirements (CCCD, approval, one account per campaign).
- API fees and eligibility at BIDV, VCB and MB (portals not readable without
  JavaScript or login).

## Sources

Read 2026-10-31. Dates are the source's own where shown.

Vietcombank

- [vcb-1] Nhà Đầu Tư, 09/09/2021. "Vietcombank cam kết thông tin chính xác
  trên sao kê tài khoản".
- [vcb-2] Hai Phong city portal, PDF statement of the Fatherland Front relief
  account at Vietcombank, 22/09/2024.
- [vcb-3] Tiền Phong, 03/10/2025. Disclosed and undisclosed MTTQ accounts.
- [vcb-4] Thị trường Tài chính Tiền tệ, 07/06/2024. Vietcombank ERP / H2H
  connections.
- [vcb-5] Thị trường Tài chính Tiền tệ, 23/10/2024. Online account opening
  with biometrics.
- [vcb-6] VNBA, 30/09/2021. Chosen-number account on VCB Digibank.
- [vcb-7] Thị trường Tài chính Tiền tệ, 25/09/2024. MTTQ 11,402-page
  Vietcombank statement.

VietinBank

- [vtb-1] FPT Shop blog (undated). VietinBank online statements.
- [vtb-2] VNBA, 21/07/2021. MT940/950 statement service.
- [vtb-3] VietinBank developer PDF, ERP use case "Notify BĐSD nợ có" v1.0,
  2025 (search snippet only; the link redirects to a JavaScript portal).
- [vtb-4] VOH, 14/09/2024. MTTQ VietinBank statement fields.
- [vtb-5] VietinBank eFAST guide, transfers.
- [vtb-6] VietinBank news, 20/09/2024. Yagi support, MTTQ alias CT1111.
- [vtb-7] Doanh nhân (Báo Pháp luật), 18/06/2026. New Open API portal.
- [vtb-8] Casso docs. Notes on connecting VietinBank.
- [vtb-9] Hà Tĩnh provincial portal, 13/11/2025. Account opening via VNeID.
- [vtb-10] VietinBank. Create an alias for a payment account.

BIDV

- [bidv-1] BIDV blog, 21/12/2023. Account statements.
- [bidv-2] Thị trường Tài chính Tiền tệ, 26/09/2024. MTTQ BIDV statement,
  1,152 pages.
- [bidv-3] FPT IS (undated). BIDV Open API system.
- [bidv-4] Thị trường Tài chính Tiền tệ, 03/05/2024. BIDV InfoPlus
  collection and payout.
- [bidv-5] BIDV FAQ (Hỏi và đáp).
- [bidv-6] BIDV, 22/07/2024. Tài khoản Như ý.

Techcombank

- [tcb-1] Techcombank blog, 12/10/2026. Salary statements (sao kê lương).
- [tcb-2] Techcombank Business web user guide, version 31/10/2025, pp.
  27–31.
- [tcb-3] Techcombank Business mobile user guide, version 05/06/2024.
- [tcb-4] Techcombank terms for direct-connection e-banking (H2H).
- [tcb-5] Techcombank cash-management fee schedule for organisations,
  effective 10/05/2024.
- [tcb-6] Techcombank blog, 27/10/2026. How to open an account.
- [tcb-7] Techcombank blog, 24/09/2026. Account-opening fees.

MB

- [mb-1] Vietbooks blog, updated 05/09/2026. How to get an MB statement.
- [mb-2] VnExpress, 25/10/2021. MB launches electronic statements for
  businesses.
- [mb-3] MB mini-app integration docs. Payment transaction info.
- [mb-4] Casso docs. Connecting an MB account with the official API.
- [mb-5] MBS guide (PDF). Depositing money into a securities account.
- [mb-6] Thiện Nguyện news, 20/11/2021. MB launches Thiện Nguyện accounts.
- [mb-7] Báo Lào Cai, 28/05/2026. Community oversight of charity.
- [mb-8] Thiện Nguyện public campaign page (example).
- [mb-9] SePay. MB bank page.
- [mb-10] MB news. How to open a bank account (snippet only).
- [mb-11] App Store. Thiện Nguyện app.
- [mb-12] Thiện Nguyện home page.
- [mb-13] VNBA, 26/04/2023. MB gives Thiện Nguyện accounts to the Red Cross.
- [mb-14] Người Quan Sát, 03/03/2025. Phạm Thoại charity case.

ACB

- [acb-1] ACB Online personal user guide, updated 06/2014.
- [acb-2] ACB ONE BIZ user guide for businesses.
- [acb-3] ACB store-management solution.
- [acb-4] pdfcoffee.com, 2019 ACB statement (snippet only; page returned an
  error).
- [acb-5] ACB service guide, 11/01/2018.
- [acb-6] ACB, 04/06/2026. "Đóng góp xanh" on ACB ONE.
- [acb-7] ACB developer portal, notices.
- [acb-8] ACB developer portal, product 10492 (transaction notification).
- [acb-9] ACB developer portal, product 8190 (partner-software connection).
- [acb-10] SePay docs. Connecting ACB.
- [acb-11] ACB. How to open a payment account online.
- [acb-12] ACB. Account number on request.

Cross-bank

- [x-1] Tuổi Trẻ, 13/09/2024. MTTQ on publishing statements.
- [x-2] Thị trường Tài chính Tiền tệ, 14/09/2024. MTTQ 2,009-page
  VietinBank statement.
- [x-3] MIA.vn, 24/09/2024. How people searched the MTTQ statements.
- [x-4] VietQR.io. QR generation API.
- [x-5] VietQR.io. Quick link (dynamic QR).
- [x-6] api.vietqr.vn. Generate VietQR code API.
- [x-7] payOS API docs.
- [x-8] SePay developer docs. Payment-code settings.
- [x-9] SePay developer docs. Webhook integration.
- [x-10] Thị trường Tài chính Tiền tệ, 22/09/2025. Agribank Open API.
- [x-11] SePay developer docs. Supported bank accounts.
- [x-12] Casso developer docs. Manual webhook setup.
- [x-13] payOS FAQ.

[vcb-1]: https://nhadautu.vn/vietcombank-cam-ket-thong-tin-chinh-xac-tren-sao-ke-tai-khoan-d57509.html
[vcb-2]: https://cdn.haiphong.gov.vn/gov-hpg/SiteFolders/Root/6464/tintuc/2024/9/22.9-cap-nhan-ds-ung-ho-tai-nh-vietcombank.pdf
[vcb-3]: https://tienphong.vn/ung-ho-dong-bao-bi-thiet-hai-do-bao-so-10-qua-tai-khoan-nha-hao-tam-co-the-chon-sao-ke-hoac-giu-kin-post1783718.html
[vcb-4]: https://thitruongtaichinhtiente.vn/vietcombank-dan-dau-xu-huong-chuyen-doi-so-thong-qua-ket-noi-he-thong-erp-cua-doanh-nghiep-59439.html
[vcb-5]: https://thitruongtaichinhtiente.vn/vietcombank-mo-tai-khoan-truc-tuyen-tich-hop-thong-tin-sinh-trac-hoc-63571.html
[vcb-6]: https://vnba.org.vn/vi/mo-tai-khoan-thanh-toan-so-chon-tren-vcb-digibank-2107.htm
[vcb-7]: https://thitruongtaichinhtiente.vn/mat-tran-to-quoc-cong-bo-11-402-trang-sao-ke-tien-ung-ho-dong-bao-qua-tai-khoan-vietcombank-tu-ngay-15-23-9-62898.html
[vtb-1]: https://fptshop.com.vn/tin-tuc/danh-gia/sao-ke-tai-khoan-vietinbank-online-192442
[vtb-2]: https://vnba.org.vn/vi/vietinbank-cung-cap-dich-vu-sao-ke-tai-khoan-dinh-dang-mt940-950-1032.htm
[vtb-3]: https://developer.vietinbank.vn/vtb/openbanking/system/files/2025-08/VietinBank_ERP_UseCase_Notify%20B%C4%90SD%20n%E1%BB%A3%20c%C3%B3_v1.0.pdf
[vtb-4]: https://voh.com.vn/xa-hoi/mttq-viet-nam-cong-khai-tiep-hon-2000-trang-sao-ke-dong-gop-ho-tro-dong-bao-bi-thiet-hai-bao-lu-551294.html
[vtb-5]: https://www.vietinbank.vn/efast-guide/chuyen-tien.html
[vtb-6]: https://www.vietinbank.vn/tin-tuc/tin-tuc-va-su-kien/vietinbank-giam-lai-suat-ho-tro-khach-hang-thiet-hai-do-bao-yagi-20240920123035-00-html
[vtb-7]: https://doanhnhan.baophapluat.vn/vietinbank-open-api-portal-phien-ban-moi-don-dau-xu-huong-tai-chinh-so-thong-minh.html
[vtb-8]: https://docs.casso.vn/huong-dan/luu-y-khi-ket-noi-vietinbank
[vtb-9]: https://hatinh.gov.vn/vi/bai-viet/vietinbank-trien-khai-mo-tai-khoan-truc-tuyen-qua-ung-dung-vneid
[vtb-10]: https://vietinbank.vn/en/ca-nhan/san-pham-dich-vu/dich-vu-tai-khoan/tao-alias-cho-tai-khoan-thanh-toan-30-html
[bidv-1]: https://bidv.com.vn/bidv/bidv-blog/bao-mat/sao-ke-tai-khoan-ngan-hang
[bidv-2]: https://thitruongtaichinhtiente.vn/mat-tran-to-quoc-cong-bo-sao-ke-tien-ung-ho-dong-bao-gap-bao-lu-tu-ngay-4-22-9-qua-tai-khoan-ngan-hang-bidv-62914.html
[bidv-3]: https://fpt-is.com/en/customers/bidv-open-api-system-developed-by-bidv-in-partnership-with-fpt-is/
[bidv-4]: https://thitruongtaichinhtiente.vn/bidv-uu-dai-khach-hang-su-dung-dich-vu-thu-chi-ho-tren-nen-tang-infoplus-58732.html
[bidv-5]: https://bidv.com.vn/vn/hoi-va-dap
[bidv-6]: https://bidv.com.vn/bidv/ca-nhan/khuyen-mai/ngan-hang-so/tai-khoan-nhu-y-bidv-chon-tai-khoan-voi-kho-so-sieu-dep-tai-khoan-sieu-ngan
[tcb-1]: https://techcombank.com/thong-tin/blog/sao-ke-luong
[tcb-2]: https://techcombank.com/content/dam/techcombank/cdb-app/documents/pre-login/2-1-hdsd-techcombank-business-web-20251031.pdf
[tcb-3]: https://techcombank.com/content/dam/techcombank/public-site/documents/hdsd-techcombank-business-mobile-20240605.pdf
[tcb-4]: https://techcombank.com/content/dam/techcombank/public-site/imported-assets/Dieu_khoan_va_dieu_kien_su_dung_dich_vu_NHDT_thong_qua_ket_noi_truc_tiep_9a4eb23bf8.pdf
[tcb-5]: https://techcombank.com/content/dam/techcombank/public-site/documents/Techcombank-Bieu-phi-quan-ly-tien-te-danh-cho-khach-hang-to-chuc-51a56809b9.pdf
[tcb-6]: https://techcombank.com/thong-tin/blog/cach-mo-tai-khoan
[tcb-7]: https://techcombank.com/thong-tin/blog/mo-tai-khoan-ngan-hang-co-mat-phi-khong
[mb-1]: https://vietbooks.vn/blog/sao-ke-ngan-hang/cach-lay-sao-ke-mb-bank/
[mb-2]: https://vnexpress.net/mb-ra-mat-tinh-nang-so-phu-dien-tu-cho-doanh-nghiep-4376515.html
[mb-3]: https://integration-mini-app.mbbank.com.vn/docs/home/apispec/payment/transaction-info/
[mb-4]: https://docs.casso.vn/huong-dan/ket-noi-tai-khoan-ngan-hang-mb-bank-co-api-chinh-thuc
[mb-5]: https://www.mbs.com.vn/media/1kole1pg/mbs-hd-n%E1%BB%99p-chuy%E1%BB%83n-ti%E1%BB%81n-v%C3%A0o-tkgdck-c%C6%A1-s%E1%BB%9F_web.pdf
[mb-6]: https://thiennguyen.app/news/mb-bat-trend-tu-thien-ra-mat-tai-khoan-thien-nguyen-ai-cung-co-the-kiem-tra-sao-ke-online
[mb-7]: https://baolaocai.vn/khi-moi-dong-gop-deu-de-lai-dau-vet-cong-dong-giam-sat-hoat-dong-nhan-dao-post900520.html
[mb-8]: https://thiennguyen.app/donate-target/1476496130551336960
[mb-9]: https://sepay.vn/mb.html
[mb-10]: https://www.mbbank.com.vn/chi-tiet/tin-mb/cach-mo-tai-khoan-ngan-hang/7220
[mb-11]: https://apps.apple.com/us/app/thi%E1%BB%87n-nguy%E1%BB%87n/id1583539685
[mb-12]: https://thiennguyen.app/
[mb-13]: https://vnba.org.vn/vi/mb-tang-tai-khoan-thien-nguyen-va-dong-hanh-cung-chien-dich--niem-tin-thang-5--tu-moi-trai-tim-chung-ta-10395.htm
[mb-14]: https://nguoiquansat.vn/vu-tu-thien-do-pham-thoai-keu-goi-16-7-ty-bi-rut-chi-con-hon-54-trieu-ma-khong-he-co-thong-bao-mbbank-noi-gi-202388.html
[acb-1]: https://online.acb.com.vn/acbib/trogiup/HDSD_IS_KHCN_7_2014.pdf
[acb-2]: https://online.acb.com.vn/news/images/hdsd%20acbo%20khdn.pdf
[acb-3]: https://acb.com.vn/giai-phap-quan-ly-cua-hang
[acb-4]: https://pdfcoffee.com/acb-20190101-20190301-pdf-free.html
[acb-5]: https://online.acb.com.vn/news/images/huong%20dan%20su%20dung%20dich%20vu%2011012018.pdf
[acb-6]: https://acb.com.vn/ve-chung-toi/acb-trien-khai-sang-kien-dong-gop-xanh-nen-tang-dong-gop-minh-bach-vi-moi-truong-tren-acb-one-20260605
[acb-7]: https://developer.acb.com.vn/acb/open/vi/notification
[acb-8]: https://developer.acb.com.vn/acb/open/vi/product/10492
[acb-9]: https://developer.acb.com.vn/acb/open/vi/product/8190
[acb-10]: https://docs.sepay.vn/ket-noi-acb.html
[acb-11]: https://acb.com.vn/thu-vien/huong-dan-mo-tai-khoan-thanh-toan-online-ngan-hang-acb
[acb-12]: https://acb.com.vn/dich-vu-cap-so-tai-khoan-theo-yeu-cau
[x-1]: https://tuoitre.vn/mat-tran-to-quoc-viet-nam-len-tieng-viec-sao-ke-cong-khai-ung-ho-dong-bao-thiet-hai-do-bao-so-3-20240913201551297.htm
[x-2]: https://thitruongtaichinhtiente.vn/mat-tran-to-quoc-cong-bo-2-009-trang-sao-ke-tien-ung-ho-dong-bao-bi-anh-huong-do-bao-so-3-thong-qua-tai-khoan-vietinbank-62588.html
[x-3]: https://mia.vn/tin-tuc/cach-check-var-tu-ban-sao-ke-cua-mttq-3542
[x-4]: https://vietqr.io/danh-sach-api/link-tao-ma-nhanh/api-tao-ma-qr/
[x-5]: https://www.vietqr.io/qr-dong.md
[x-6]: https://api.vietqr.vn/vi/vietqr-payment-apis/goi-api-generate-vietqr-code
[x-7]: https://payos.vn/docs/api/
[x-8]: https://developer.sepay.vn/vi/sepay-webhooks/cau-hinh-ma-thanh-toan
[x-9]: https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook
[x-10]: https://thitruongtaichinhtiente.vn/agribank-open-api-canh-cua-so-mo-ra-trai-nghiem-ngan-hang-thong-minh-70590.html
[x-11]: https://developer.sepay.vn/vi/sepay-webhooks/tai-khoan-ngan-hang
[x-12]: https://developer.casso.vn/webhook/thiet-lap-webhook-thu-cong
[x-13]: https://payos.vn/docs/cau-hoi-thuong-gap
