# Research: Tingee as the M2 payment channel

> Status: desk research written 2026-11-18, after JOY decided on 2026-11-18
> that the M2 automatic channel uses **Tingee** instead of payOS (PO comments
> on DOS/Give#24, #25 and #29). This is input for rewriting those issues. The
> design mapping in section 8 is a proposal. It does not change
> `docs/Give-Technical-Design.md` beyond the note recording the switch (D8).
>
> **Blocker for the Techcombank plan:** Tingee does not send balance-change
> webhooks for Techcombank accounts (section 4). Techcombank Business stays on
> statement import (DOS/Give#231). The Tingee channel works only for
> organizers whose receiving account is at one of the 16 banks Tingee connects
> to.

## 1. Scope and method

- Questions: what Tingee offers; which banks it supports, especially
  Techcombank; sign-up, KYC and fees; the API (authentication, payment or QR
  creation with Give's reference code, transfer-content limits, webhook
  payload, signature and retries, ids and idempotency, reconciliation,
  sandbox); and whether money lands directly in the organizer's own account
  (design decision D3: Give never holds money).
- Sources: Tingee's public developer documentation at developers.tingee.vn
  (API version 1.2.4, changelog up to 10/11/2026) and Tingee's machine-readable
  copies of the same documentation: `llms-full.txt` and the OpenAPI 3 file
  `openapi.json`. Also Tingee's public site tingee.vn, including its terms
  (effective 01/11/2026), FAQ and product pages. No sign-ups, logins, portal
  or UAT access, keys, contact with Tingee, or paid services.
- Tingee is a product of Công ty Cổ phần Công nghệ HENO (HENO) [t-terms].
- Confidence tags:
  - no tag: **confirmed** in Tingee's developer documentation or its terms of
    service;
  - _(Tingee site)_: Tingee's own marketing or FAQ page. It is official, but
    not a technical or contractual commitment;
  - _(3rd party)_: a source that is not Tingee's;
  - _(inferred)_: this document's reading of confirmed facts, to verify in UAT;
  - **unknown**: no public source found.

## 2. Summary

| Question                         | Answer                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Does money pass through Tingee?  | **No.** HENO "không nhận, không giữ và không chuyển tiền thay bạn"; the bank credits the account holder directly [t-terms, art. 5.2]. Tingee only reads balance changes that the partner bank shares with it. Fits D3. Exception: card payments through Tingee's hosted payment gateway, where the money flow is not documented (section 3). Give should not use that product. |
| Techcombank                      | **Not supported** for notifications. Tingee lists Techcombank (BIN 970407) only as a bank whose app a deep link can open, with no webhook support [t-deeplink]. It is absent from every account-linking, VA and QR table [t-notes], and from the 16 banks on the home page [t-home] _(Tingee site)_.                                                                           |
| Banks with webhooks              | 16 banks plus the Bảo Kim wallet: Vietcombank, BIDV, Agribank, VietinBank, MB, OCB, ACB, Sacombank, VPBank, VIB, TPBank, MSB, PGBank, Shinhan, HDBank, Co-opBank. Support differs by bank and account type (section 4).                                                                                                                                                        |
| How an account is connected      | The account holder links their own account through Tingee with a bank OTP or the bank's app. This creates either a virtual account (VA) that donors must pay into, or a link to the real account number at some banks. Platforms can run many organizers under one Master Merchant account (section 6.2).                                                                      |
| Webhook                          | One POST per credited (or, at ACB, debited) transaction: `transactionCode`, `amount`, `content`, `accountNumber`, `vaAccountNumber`, `transactionDate`, `type`. HMAC-SHA512 over `timestamp:body`. Retries on non-200 responses, up to 5 times, on a schedule the documentation states three different ways. No running balance and no counterparty (section 6.4).             |
| Reconciliation                   | `POST /v1/transaction/get-paging`: credits and debits by merchant, VA or time, at most 10 days per request and 200 rows per page. No balances (section 6.6).                                                                                                                                                                                                                   |
| Transfer content and Give's code | Give can keep building its own VietQR. Tingee documents no content length limit of its own, so the bank limits in `bank-statements.md` 5.1 apply. **VietinBank sends no transfer content**, so its webhooks cannot be matched by reference code (section 6.3).                                                                                                                 |
| Outgoing money                   | Debit (money out) notifications exist **only for ACB** [t-create-debit]. At every other bank, disbursements still need statement import, and Give has no parser for those banks yet (section 9).                                                                                                                                                                               |
| Sandbox                          | A public UI sandbox, a UAT API (`uat-open-api.tingee.vn`) with its own portal, plus a Postman collection, an OpenAPI file and backend SDKs [t-config] [t-sandbox].                                                                                                                                                                                                             |
| Fees                             | **Unknown.** Tingee sells prepaid subscription plans priced on the sign-up screen or by quote. No public price list was found [t-terms, art. 4]. If a plan expires, transaction notifications pause [t-terms, art. 4.5].                                                                                                                                                       |

## 3. What Tingee offers

| Product                                                                 | What it does                                                                                                                                                                                   | Relevant to Give                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tài khoản & Định danh (accounts, VA)                                    | Link a bank account and create virtual accounts. Real-time balance-change webhooks. Transaction history for reconciliation [t-banking].                                                        | **Core.** This is the M2 channel.                                                                                                                                                                                                                      |
| Bank Link SDK                                                           | Tingee-hosted UI, as a popup or inline, where the account holder picks a bank and completes the bank's OTP or app step. The result comes back by callback, redirect and webhook [t-bank-link]. | **Recommended** for organizer onboarding: Give never sees the bank OTP.                                                                                                                                                                                |
| QR Code (static VietQR, dynamic QR)                                     | Static: a VietQR for an account or VA, with optional amount and content. Dynamic: one QR per bill with `billId`, an expiry of up to 30 days, and a status query [t-qr] [t-qr-dyn].             | Optional. Give already builds VietQR locally (design 5.2). Dynamic QR works only on some banks and account types (section 6.3).                                                                                                                        |
| Deep Link / Pay by Bank                                                 | Opens a donor's bank app with the transfer pre-filled. 32 banks, Techcombank included [t-deeplink].                                                                                            | Later. It may help donors on mobile, but the final state still comes from the webhook.                                                                                                                                                                 |
| Cổng thanh toán (hosted payment gateway)                                | A checkout link with VietQR, domestic ATM card and Pay by Bank. Links last 5–30 minutes, and the IPN reports `orderId` and `paidAmount` [t-gw].                                                | **Avoid.** For VietQR and Pay by Bank, money goes to the merchant's chosen account, but for ATM cards Tingee says to contact it about the money flow [t-gw-site] _(Tingee site)_. A 30-minute link also does not fit donations that may be paid later. |
| Master Merchant                                                         | A platform account that creates sub-merchants by API (`/v1/merchant/create`) and acts for them with `merchantId`. Not self-service: it has to be set up with Tingee [t-mm].                    | **Likely fit** for Give, with organizers as sub-merchants (section 6.2).                                                                                                                                                                               |
| Direct Debit, Chi hộ (payouts), e-invoices, TingeeBox speaker, POS bill | Recurring debit, payouts (maker/checker), e-invoices, a counter speaker, POS payment.                                                                                                          | **Out of scope.** Payouts conflict with D3 in spirit, the same as payOS's payouts API (design 5.2).                                                                                                                                                    |

## 4. Banks

Tingee's support depends on the bank and on the account type: `personal-account`
(cá nhân), `business-household-account` (hộ kinh doanh, HKD) or
`business-account` (doanh nghiệp, DN). The table combines the "Lưu ý quan
trọng" page [t-notes], the create-VA page [t-create-va], the dynamic-QR page
[t-qr-dyn], the debit page [t-create-debit] and the deep-link bank table
[t-deeplink].

| Bank (BIN)               | Webhook on money in                                 | Donor pays into                                     | Dynamic QR by API        | Notes                                                                                                                    |
| ------------------------ | --------------------------------------------------- | --------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| ACB (970416)             | Yes, all types; **also money out** (`create-debit`) | Real account number, all types, or a VA             | No                       | Separate `register-notify` OTP step. DN and HKD need ACB config and `acbUserId`.                                         |
| TPBank (970423)          | Yes                                                 | Real account number, all types. VA only for DN      | No                       | Link result arrives by `bank-link` webhook, not `confirm-va`.                                                            |
| VPBank (970432)          | Yes                                                 | Real account number for DN only. Otherwise VA       | DN only                  | DN and HKD need config.                                                                                                  |
| OCB (970448)             | Yes                                                 | Real account number for DN and HKD. Otherwise VA    | Personal and DN          | DN config through Tingee.                                                                                                |
| VietinBank (970415)      | Yes, but **without transfer content**               | Real account number for personal and HKD. VA for DN | DN only                  | Reference-code matching impossible (section 6.3).                                                                        |
| PGBank (970430)          | Yes                                                 | Real account number only (no VA)                    | No                       |                                                                                                                          |
| Co-opBank                | Yes                                                 | Real account number only (no VA)                    | No                       | BIN not given by Tingee.                                                                                                 |
| Vietcombank (970436)     | Yes                                                 | VA only                                             | Not for personal         | Personal linking goes through VCB Digibank; the result arrives by webhook. DN and HKD need config.                       |
| BIDV (970418)            | Yes                                                 | VA only                                             | DN only                  | DN needs config. The VA display name must start with the registered company name.                                        |
| MB (970422)              | Yes                                                 | VA only                                             | Yes                      | DN config through Tingee. Whether an MB Thiện Nguyện charity account (bank-statements 4.1) can be linked is **unknown**. |
| Agribank (970405)        | Yes                                                 | VA only                                             | No (not in the API list) | The QR table marks dynamic QR as supported, but the API's bank list does not include Agribank.                           |
| Sacombank (970403)       | Yes                                                 | VA only                                             | No                       | No QR support for DN accounts.                                                                                           |
| VIB (970441)             | Yes                                                 | VA only                                             | No                       | The owner must first register "nhận loa" in VIB iBusiness. DN config through Tingee.                                     |
| MSB (970426)             | Yes                                                 | An existing VA declared at MSB                      | No                       | Config for all types.                                                                                                    |
| HDBank (970437)          | Yes                                                 | VA only                                             | No                       | Tingee QR only for DN (dynamic).                                                                                         |
| Shinhan (970424)         | Yes                                                 | VA only                                             | No                       | Missing from the QR table.                                                                                               |
| **Techcombank (970407)** | **No**                                              | Not supported                                       | No                       | Deep link only [t-deeplink]. Missing from the 16 banks on tingee.vn [t-home] _(Tingee site)_.                            |

"VA only" means a transfer into the organizer's real account number produces
**no webhook**: the donor must pay into the VA [t-notes] [t-pay-cb]. A VA is
an identifier the bank issues on the organizer's account. Money paid to it
lands in that account [t-terms, art. 5.2] [t-va-site] _(Tingee site)_.

Consequences:

- **Techcombank:** JOY's Techcombank Business account (Give's verification
  account, DOS/Give#46) and any organizer banking at Techcombank stay on the
  `statement_import` channel and the `tcb-business` parser (#231). Tingee
  says nothing about Techcombank plans. Asking Tingee is the only way to find
  out.
- **ACB** is the strongest Tingee bank for Give: the donor pays the real
  account number for every account type, and money out is reported too, so
  disbursements show up live (section 9).
- For VA banks, the payment page and VietQR must show the **VA number**, not
  the account number the organizer verified. Whether the donor's bank app
  shows the organizer's name for a VA is **unknown**; verify in UAT.

## 5. Sign-up, KYC and fees

- **Merchant**: self-service sign-up at app.tingee.vn. API credentials are
  then created in the BaaS portal (baas.tingee.vn → API Credentials), with
  per-credential scopes and an optional IP allow-list of up to 20 IPs
  [t-mm] [t-config].
- **Master Merchant**: "không hỗ trợ đăng ký tự động", set up by contacting
  Tingee [t-mm]. `merchant/create` needs only a name and a phone number, and
  reuses an existing Tingee merchant with the same phone number [t-mm-create].
- **Who can be a customer**: the terms define customers as businesses,
  organisations, household businesses and "cá nhân kinh doanh" (individuals
  doing business). The registrant warrants that their information is true
  [t-terms, art. 2–3]. Whether a private individual running a charity
  campaign qualifies, and whether that matters under a Master Merchant, is
  **unknown**.
- **KYC at Tingee**: no Tingee-side identity check is documented
  (**unknown**). Identity is enforced by the **bank** when linking:
  `create-va` takes the account number, the holder's name in upper case
  without diacritics, `identity` (CCCD or tax code) and the phone number
  registered at the bank, and the bank sends an OTP to the holder. Business
  accounts often need a prior bank-side configuration [t-create-va]
  [t-notes]. Some banks attach their own VA terms, for example BIDV's VA
  terms PDF in `get-banks` [t-get-banks].
- **Fees**: **unknown**. Plans are prepaid per cycle, priced on the plan
  screen or by quote, paid by VietQR to HENO, and invoiced. There is no
  automatic charge unless the customer opts into OnePay recurring billing.
  An expired plan pauses features and transaction notifications until it is
  paid [t-terms, art. 4]. Bank-side VA fees are **unknown**. Master Merchant
  pricing would be a quote.

## 6. API

### 6.1 Environments and authentication

- Base URLs: `https://open-api.tingee.vn` (production) and
  `https://uat-open-api.tingee.vn` (UAT). There is a separate UAT portal,
  `uat-baas-portal.tingee.vn` [t-config].
- Every request carries `x-client-id`, `x-request-timestamp` and
  `x-signature`:
  - `x-request-timestamp` is `yyyyMMddHHmmssSSS` in UTC+7;
  - `x-signature = HMAC_SHA512(timestamp + ":" + JSON.stringify(body),
secretToken)` as hex;
  - the body must be sent byte-for-byte as signed (minified JSON);
  - the timestamp must not be in the future or more than 10 minutes old
    [t-config].
- Every API returns HTTP 200. Success is `code: "00"` in the body, except
  `get-banks`, which returns a bare array [t-banking] [t-get-banks].
- Credentials have scopes. Direct debit, payouts and refunds require an IP
  allow-list. Exactly one credential per account carries the "Xác thực
  webhook" (webhook URL verification) permission [t-config].
- Official backend libraries exist for Node.js, Java, .NET, PHP and Python.
  They sign requests and verify webhooks [t-config] [t-sdk-wh].

### 6.2 Linking an organizer's account

Two ways, both confirmed [t-banking] [t-bank-link]:

1. **API**: `POST /v1/create-va` returns a `confirmId`, or completes at once
   for some business accounts. The bank sends an OTP to the holder, and the
   partner calls `POST /v1/confirm-va` with the OTP. ACB also needs
   `register-notify` and `confirm-register-notify`. Vietcombank and TPBank
   finish asynchronously and report through the `bank-link` webhook.
   `isNotifyAccountNumber: true` links the real account number where the
   bank supports it (section 4).
2. **Bank Link SDK**: the backend calls `POST /v1/create-bank-link-session`,
   which can take `allowedBanks`, `bankAccountType`, `redirectUrl`,
   `metadata` of up to 1000 characters, and `merchantId` under a Master
   Merchant. The organizer finishes the linking in Tingee's UI. The backend
   learns the result from the `bank-link` webhook, which returns `metadata`
   [t-bank-link-session] [t-bank-link-wh].

Under a Master Merchant, every call takes `merchantId` [t-mm]. Bank-link
results go to the Master Merchant's endpoint [t-va-status]. Whether **payment**
webhooks of sub-merchants also reach the Master Merchant's endpoint is
**unknown** (section 10).

`delete-va` and `confirm-delete-va` unlink an account. `get-va-paging` lists
linked accounts with status `active`, `inactive` or `lock` [t-banking].

### 6.3 Payment instruction and Give's reference code

- Give keeps building VietQR locally (design 5.2). For VA banks, the QR
  encodes the VA number and the bank BIN. For real-account banks, it encodes
  the organizer's account number. The reference code goes in the transfer
  content (`addInfo`) as it does today.
- Tingee's static VietQR API takes an optional `content` with **no
  documented length limit** [t-qr-static]. The dynamic QR's `purpose` has no
  documented limit either. Its `extraInfo` takes up to 200 characters but is
  not sent to the bank [t-qr-dyn]. The binding limits are the banks' own
  (`bank-statements.md` 5.1). Give's code (`GV` plus 6 characters, design 3)
  fits them. Unlike payOS, Tingee has no 9-character cap: the content is the
  donor's bank transfer content, carried through by the bank.
- **VietinBank** does not pass the transfer content to Tingee, so its
  webhooks have no `content` [t-notes] [t-pay-cb]. A VietinBank account would
  need one dynamic QR per contribution (DN accounts only), matched by
  `billId`. Otherwise every donation lands in `unmatched_in`.
- **Dynamic QR** (`/v1/generate-dynamic-qr`) gives a `billId` per bill,
  one-time or recurring, with an expiry of 1 to 43,200 minutes. Payments
  carry it in the webhook's `additionalData` and in the transaction list. It
  works only for OCB, MB, BIDV, VietinBank, Vietcombank, VPBank and Bảo Kim,
  mostly DN accounts [t-qr-dyn]. Tingee warns that some banks still let the
  donor change the amount of a dynamic QR [t-pay-cb]. That is harmless for
  Give, which records the amount the bank reports.

### 6.4 Webhook

Configured in the portal per endpoint, with these settings [t-config]:

- the event scope (QR or payments, `bank-link`), optionally limited to
  chosen VAs or shops, with a blacklist;
- the retry policy: timeout 5–10 s, 1–5 retries, 2–3600 s apart;
- the authentication type: none, a custom API-key header, or API
  credentials (recommended).

The portal keeps 90 days of delivery logs.

**URL verification**: when an endpoint is created or its URL changes, Tingee
POSTs a challenge with header `webhook-type: url-validation` and body
`{event, plainToken, timestamp, clientId}`. The endpoint must answer within
5 s, with no redirect, `{plainToken, encryptedToken}`, where
`encryptedToken = HMAC_SHA256(plainToken)` keyed with the secret of the
webhook-verification credential. A DNS TXT record on the domain is the
alternative [t-webhook].

**Payment callback** (money in, and money out at ACB) [t-pay-cb]:

- Headers: `x-request-id` (UUID), `x-request-timestamp`, `x-signature`, and
  `x-client-id` when the endpoint uses API-credential authentication
  [t-bank-link-wh].
- Body:

| Field             | Type   | Meaning                                                                                                                                                                |
| ----------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clientId`        | string | The partner's client id                                                                                                                                                |
| `transactionCode` | string | "Mã giao dịch hệ thống". The examples look like bank references (`FT26296081245731`) [t-home] _(Tingee site)_. Whether it equals the list's bank `code` is **unknown** |
| `amount`          | number | Amount actually received, in VND                                                                                                                                       |
| `content`         | string | Transfer content. Absent for VietinBank                                                                                                                                |
| `bank`            | string | Receiving bank **name** (not a BIN)                                                                                                                                    |
| `accountNumber`   | string | Receiving account number                                                                                                                                               |
| `vaAccountNumber` | string | VA, if any                                                                                                                                                             |
| `transactionDate` | string | `yyyyMMddHHmmss`. The time zone is not stated here; the transaction list uses UTC+7                                                                                    |
| `type`            | string | `credit` or `debit`. When absent, the transaction is a credit                                                                                                          |
| `additionalData`  | array  | Extra data, for example `billId` for a dynamic QR                                                                                                                      |

- There is **no running balance** and **no counterparty** name or account.
  The expected reply is HTTP 200 with `{"code":"00","message":"Success"}`.
- **Signature**: `HMAC_SHA512(x-request-timestamp + ":" +
JSON.stringify(body), secretKey)` [t-pay-cb] [t-ipn]. Tingee's own
  examples re-serialise the parsed body, and its Python example uses compact
  separators [t-ipn]. Give should verify against the raw body first and
  compare in constant time. Which secret signs payment webhooks under each
  authentication type is not stated precisely: "Secret Token" of the
  endpoint or of the API credential [t-bank-link-wh]. **To verify in UAT.**
  No timestamp tolerance is documented for webhooks.
- **Retries**: the documentation says it three ways. The IPN page lists 5
  retries at 30 s, 2 min, 10 min, 1 h and 6 h [t-ipn]. The payment-callback
  page says 5 retries 1 minute apart [t-pay-cb]. The portal makes it
  configurable per endpoint [t-config]. Give must stay correct with any of
  them: late (up to hours) and repeated deliveries.
- **Late and duplicate payments**: for static VietQR, Tingee still sends the
  webhook when a transfer arrives after an order expired or was cancelled,
  and also for duplicate transfers [t-gw-site] _(Tingee site)_. This matches
  Give's rule that every bank fact is recorded.

### 6.5 Ids and idempotency

- Tingee tells partners to deduplicate webhooks by `transactionCode`
  [t-pay-cb] [t-ipn]. Retries reuse the payload. Whether they keep
  `x-request-id` is **unknown**, so it is not a dedupe key.
- The transaction list gives two ids: `transactionId` (Tingee's UUID) and
  `code` ("mã giao dịch phía ngân hàng", the bank's reference) [t-tx]. The
  webhook gives only `transactionCode`. _(inferred)_ It is the bank reference,
  the same as the list's `code`. **To verify in UAT**: the reconcile job and
  the webhook must produce the same `provider_tx_id`.
- API requests have no idempotency-key header. `create-va` reports an
  account or VA that already exists (codes 1022 and 1048) or one linked to
  another merchant (1081). TPBank linking needs a unique `requestId`, and
  gateway links need a UUID `requestId` [t-create-va] [t-gw].

### 6.6 Reconciliation

`POST /v1/transaction/get-paging` filters by `merchantId`, `shopIds`,
`vaAccountNumbers`, `bankBin` or `billId`, between `startTime` and `endTime`
(`yyyyMMddHHmmss`, UTC+7), **at most 10 days per request**, with
`maxResultCount` up to 200 per page. Each row has `transactionId`, `code`,
`amount`, `type`, `content`, `currency`, `accountNumber`, `vaAccountNumber`,
`transactionDate`, `billId` and `cashFlowSource` (`bank-transfer` or `card`)
[t-tx]. There is no balance and no per-transaction lookup. The dynamic-QR
status call lists the payments of one `billId` [t-qr-dyn].

### 6.7 Sandbox

- A public sandbox at developers.tingee.vn/sandbox simulates flows in the
  browser: bank linking with mock OTP, the gateway, the speaker and others
  [t-sandbox].
- Real API testing uses the UAT environment and portal, which needs a Tingee
  UAT account [t-config].
- Tingee also publishes a Postman collection with pre-request signing,
  `openapi.json`, `llms.txt` and `llms-full.txt`, and an MCP server
  `@tingee/mcp` [t-config] [t-changelog].

## 7. Does money land in the organizer's own account?

**Yes, for the products Give would use.**

- Tingee's terms: HENO is not a payment intermediary and does not receive,
  hold or transfer money; the bank credits the customer's account directly.
  The customer links an account "đứng tên mình" (in their own name)
  [t-terms, art. 5.1–5.2].
- The site and FAQ say the same, and say Tingee is not an e-wallet [t-home]
  [t-faq] _(Tingee site)_.
- A VA is an alias of the linked account at the bank, and money paid to it
  goes to that account [t-va-site] _(Tingee site)_ [t-banking].

Caveats:

- The hosted gateway's **card** flow is not documented [t-gw-site]
  _(Tingee site)_.
- **Bảo Kim** is an e-wallet in Tingee's bank list, and a wallet holds
  money by nature.
- Give should allow only bank accounts (no `BAOKIM`), no gateway and no
  payouts.

## 8. Design mapping for Give

### 8.1 The channel interface

Tingee fits `PaymentChannel` (design 5.1,
`apps/web/src/server/channels/types.ts`) without changing the interface:

- **`kind`**: a new value `"tingee"` replaces `"payos"`, in `ChannelKind`, in
  `InboundChannel` (`apps/web/src/server/inbound/index.ts`) and in the
  `receiving_accounts.channel` CHECK.
  - payOS was never built (#25 never started).
  - Before dropping `payos` from the CHECK, verify in DOS.Me that no row uses
    it.
  - A Tingee link is a capability of a bank account, not another kind of
    account. Section 8.4 explains why a Tingee account must still accept
    statement imports.
- **`buildInstruction`**: unchanged in shape. It returns the local VietQR
  (`kind: "vietqr"`), with `accountNumber` set to the link's
  `vaAccountNumber` for VA banks and to the real account number otherwise. No
  Tingee call is needed.
- **`parseWebhook`**:
  - verifies the signature first, then the client id;
  - returns `dedupeKey` and one `NormalizedTx`;
  - answers URL-validation challenges separately, without an inbound event.
- **`fetchTransactions(account, since)`**: wraps `transaction/get-paging` for
  the link's VA in windows of at most 10 days, with paging. This serves the
  #29 reconcile job and the confirmation step in 8.3.

The webhook maps to a `NormalizedTx` like this:

| `NormalizedTx`               | From the webhook                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `providerTxId`               | `transactionCode`. For a poll row, `code`. Same value expected (6.5)                    |
| `direction`                  | `type`: `credit` → `in`, `debit` → `out`. A missing `type` means `in`                   |
| `asset`, `amount`            | `"VND"`, `BigInt(amount)`. Refuse a non-integer or non-positive amount as a final error |
| `bookedAt`, `bookedDateOnly` | `transactionDate` read as Asia/Ho_Chi_Minh; `false`                                     |
| `description`                | `content`, or `null` (VietinBank)                                                       |
| counterparty, `balanceAfter` | Not provided                                                                            |
| `raw`                        | The payload without `clientId`                                                          |

### 8.2 Credentials and where they live

**Recommended: Give is one Tingee Master Merchant** and every organizer is a
sub-merchant [t-mm].

- Secrets are then **platform-level**, not per organizer:
  - the API client id and Secret Token, used for request signing and
    probably webhook signatures;
  - the Secret Token of the webhook-verification credential.
- They live in Vercel server environment variables, like Give's other
  server secrets. Supabase Vault is not required. They could go into Vault
  if the PO prefers one store, read through a `service_role`-only
  `SECURITY DEFINER` function as #24 planned.
- Organizers never handle API keys. They link their own bank account through
  the Bank Link SDK, and the bank's OTP goes to them and into Tingee's UI,
  never through Give.

Fallback, if Tingee will not grant a Master Merchant:

- Each organizer opens their own Tingee Merchant, pays Tingee's plan, and
  gives Give a client id and Secret Token. That is #24's original
  per-organizer Vault design, with `receiving_accounts.credential_secret_id`.
- Webhooks then arrive per organizer endpoint, and `x-client-id` selects the
  secret.
- This is worse for onboarding, and organizers handle keys.

Either way, the **channel table** holds identifiers, not secrets. Proposed
`give.tingee_links`, DDL in DOS.Me:

```sql
give.tingee_links (
  id uuid PK,
  receiving_account_id uuid → give.receiving_accounts,
  tingee_merchant_id bigint,             -- sub-merchant (Master Merchant model)
  tingee_shop_id bigint NULL,
  merchant_account_number_id bigint NULL, -- Tingee's id of the linked account
  bank_bin text, account_number text,    -- must equal the receiving account's
  va_account_number text NOT NULL,       -- equals account_number for real-account links
  link_mode text CHECK IN ('real_account','va'),
  notifies_debit bool DEFAULT false,     -- ACB create-debit registered
  status text CHECK IN ('pending','active','unlinked','failed'),
  session_nonce text NULL,               -- sent as Bank Link `metadata`
  linked_at, unlinked_at, created_at, updated_at
)
UNIQUE (bank_bin, va_account_number) WHERE status IN ('pending','active')
UNIQUE (receiving_account_id) WHERE status IN ('pending','active')
```

- Writes go only through `SECURITY DEFINER` functions granted to
  `service_role`. The organizer reads their own row.
- The link's `account_number` and `bank_bin` must equal the verified
  receiving account's. Otherwise the link is refused, so a Tingee link can
  never point Give at an account that is not the organizer's.
- The Bank Link webhook (`type: bank-link`) activates a `pending` row found
  by its `metadata` nonce. It is idempotent on `merchantAccountNumberId`.
- A successful bank-OTP link could also count as account-ownership evidence
  (design 2.2: "Khi có API ngân hàng thì bước này tự động"). That is a later
  product decision; DOS/Give#46 keeps the test transfer.

### 8.3 From webhook to bank transaction

Route `apps/web/src/app/api/webhooks/tingee/route.ts`, following the design 5.1
pipeline:

1. Read the raw body, with a size cap.
2. If `webhook-type: url-validation`, answer the challenge (6.4) and stop.
3. Verify `x-signature` over `x-request-timestamp:rawBody`. If that fails,
   retry over the re-serialised body, as Tingee's own library does. Use a
   constant-time comparison. Check `x-client-id` and `clientId` against
   Give's.
4. Record `give.inbound_events` with `channel = 'tingee'`,
   `signature_valid`, the payload, and
   `dedupe_key = 'pay:' || vaAccountNumber-or-accountNumber || ':' || transactionCode`.
   When `transactionCode` is missing, use the hash of the raw body.
   - An invalid signature is recorded with `signature_valid = false` and
     never processed (design test 12).
   - `UNIQUE (channel, dedupe_key)` makes retries a no-op.
5. Answer 200 `{"code":"00","message":"Success"}` as soon as the event is
   stored, well inside Tingee's 5–10 s timeout. Processing failures never
   reach Tingee; the `reprocess-inbound` cron retries them (design 5.1).
6. The processor (inline, and from the cron):
   - Resolve the link by `vaAccountNumber`, then `accountNumber`. Unknown or
     unlinked → final error `TINGEE_UNKNOWN_ACCOUNT`, kept for staff.
   - **Confirm** the transaction through `fetchTransactions`: the same `code`
     in the link's VA around `transactionDate`. This keeps the payOS design's
     "confirm through the API before recording", so a forged but signed
     webhook (leaked secret) cannot add money.
   - If the API fails or the row is not there yet, the attempt fails and is
     retried.
   - After 10 attempts the event parks for finance staff, per the existing
     rule.
   - Normalize (8.1) → `give.record_bank_transaction` with
     `source = 'webhook'` → `match_transaction` for `in` →
     `ledger 'received'` or `'unmatched_in'`; for `out` → `'disbursed'`.

Double counting between webhook retries, the confirmation poll and the
reconcile job is prevented by the existing
`UNIQUE (receiving_account_id, provider_tx_id)`, as long as `transactionCode`
equals `code` (6.5). This must be proven in UAT before #25 is accepted.

### 8.4 Statement import on the same account (DOS/Give#57 cross-channel item)

Why a Tingee account still needs statement import:

- Tingee reports **money in only**, except at ACB.
- It gives **no balances**.
- Disbursement transparency needs every outflow, and balance checks need a
  statement.

So a Tingee account must accept statement uploads too. Today
`stage_statement_import` refuses accounts outside `statement_import` (#57),
which must change for `tingee` accounts once this rule exists:

- **Same id**: a parser whose rows carry the bank reference that Tingee
  reports writes it as `providerTxId`. The database unique key then dedupes,
  and nothing new is needed. This must be shown per bank with a real webhook
  and statement row of the same transfer. The `tcb-business` parser has
  `providerTxId: null`, but Techcombank is not a Tingee bank.
- **No common id**, so statement rows stage without one:
  - An `in` row of a Tingee-linked account that matches **exactly one**
    not-yet-paired Tingee transaction (same account, amount and direction;
    booking day within ±1 day; the statement description contains the
    Tingee `content`, or both contain the same Give reference code) becomes
    `duplicate` of that transaction.
  - Pairing is one-to-one and occurrence-aware, like the `group_key` rule in
    design 5.2.
  - More than one candidate, or a partial match → `ambiguous`, for staff.
  - Never silently dropped.
- **Reverse order** (statement first, webhook later; retries can arrive
  hours late): before recording, the Tingee processor looks for exactly one
  unpaired statement-imported transaction with the same keys and attaches
  to it instead of creating a new one. Ambiguous → final error, for staff.
- **Storage**: both sightings must point at one `bank_transactions` row, for
  example `give.bank_transaction_sources (bank_transaction_id, source,
provider_tx_id, inbound_event_id)`, unique per account, source and id.
  The second sighting is then recorded without a second transaction or
  ledger post.
- **Tests** (DOS.Me pgTAP and Vitest):
  - webhook then statement, and statement then webhook → one transaction,
    one ledger post (design test 2);
  - two equal donations on one day → paired one-to-one or sent to staff,
    never merged.

Until this lands, the safe rollout is to link only accounts whose outflows
are covered: **ACB**, with debit notifications. Or accept that a Tingee
account's outflows wait for a parser of its bank.

### 8.5 What replaces #24's payOS order mapping

**Nothing per contribution.**

- payOS needed an integer `orderCode` because its payment link identified the
  order. Tingee identifies the **account**: the link or VA. The contribution
  is still found by Give's reference code in the transfer content, with the
  existing matcher (design 3). That rule is unchanged.
- #24's "PayOS order mapping" becomes the **account link mapping**
  (`give.tingee_links`, 8.2): `(bank_bin, va_account_number)` →
  `receiving_account_id`, plus the `tingee` channel value and the
  event-source table of 8.4.
- A per-contribution `billId` (dynamic QR) is optional and later. It is only
  useful for VietinBank DN accounts, which send no content, and only where
  dynamic QR exists.

### 8.6 Reconcile and realtime (#29)

- `reconcile-accounts` (daily) calls `fetchTransactions` for every active
  link:
  - from the last successful run minus a 2-day overlap;
  - in windows of at most 10 days, 200 rows per page;
  - recording through the same pipeline with `source = 'api_poll'`, the same
    `provider_tx_id`, so nothing is counted twice.
- It also lists links that are not `active` in `get-va-paging`, and API
  errors per merchant.
- Tingee gives no balances, so "báo lệch khi số dư không khớp" (design 5.3)
  has to come from statement imports. For Tingee, the job reports
  transactions Tingee lists that Give lacks, and the reverse, per day.
- A lapsed Tingee plan pauses notifications (section 5). The reconcile job
  and the per-merchant error report are how Give notices.
- Realtime "Đã nhận" is unchanged: Supabase Realtime on the donor's own
  contribution, and the guest status token (design 4.1).

## 9. Risks and blockers

1. **Techcombank is not supported** (section 4). Give's chosen bank
   (verification account #46, first parser #231) gets no live channel from
   Tingee. Organizers at Techcombank stay on statement import.
2. **Outflows at non-ACB banks**:
   - Tingee does not report them.
   - Give has a statement parser only for Techcombank, which Tingee does not
     support.
   - So no bank today has both a Tingee webhook and a way to record
     outflows, **except ACB through Tingee's debit notifications**.
   - Disbursement transparency (design 4.1 step 10) needs either ACB first,
     or a parser for each Tingee bank Give accepts.
3. **VA-only banks** (VCB, BIDV, MB, Agribank, Sacombank, VIB, MSB, HDBank,
   Shinhan): donors must pay the VA, not the account number they see on the
   organizer's bank card or charity page. A transfer to the real number is
   real money in the organizer's account but produces no webhook. It is only
   recorded later, by statement import.
4. **VietinBank** sends no transfer content, so no automatic matching.
5. **Master Merchant** needs a contract with Tingee. Several facts are
   unconfirmed until then: payment-webhook routing for sub-merchants,
   pricing, and eligibility of private individuals.
6. **Webhook details unconfirmed**:
   - whether `transactionCode` equals the list's `code`;
   - which secret signs payment webhooks;
   - the time zone of `transactionDate`;
   - the actual retry schedule.
7. **Plan lapse** stops notifications. Give's reconcile job and statement
   imports remain the safety net.

## 10. To verify in UAT, or ask Tingee

- Techcombank: any plan for notification support.
- Master Merchant:
  - availability and price for a charity platform;
  - whether sub-merchants' payment webhooks reach the master endpoint, and
    signed with which secret;
  - whether individuals who are not doing business can be sub-merchants.
- `transactionCode` (webhook) versus `code` and `transactionId` (list) for
  the same transfer.
- `transactionDate` time zone; retry timing and whether a retry keeps
  `x-request-timestamp` and `x-request-id`.
- What name the donor's bank app shows for a VA at VCB, BIDV and MB.
- Whether an MB Thiện Nguyện account can be linked.
- Whether the bank truncates Give's reference code on any Tingee bank.
- Fees: plan price per merchant or per linked account, and bank-side VA fees.

## Sources

Read 2026-11-18. The developer documentation was version 1.2.4. Every `t-`
page is Tingee's (HENO's) own.

- [t-docs] Tingee Open API documentation, home.
- [t-config] Bắt đầu ngay: credentials, request signature, webhook
  configuration.
- [t-notes] Lưu ý quan trọng: QR support per bank, business configuration,
  real-account linking.
- [t-banking] Tài khoản & Định danh: overview and flow.
- [t-get-banks] Lấy danh sách ngân hàng hỗ trợ.
- [t-create-va] Tạo tài khoản ảo (VA).
- [t-create-debit] Đăng ký biến động ghi nợ (ACB).
- [t-tx] Lịch sử giao dịch (`transaction/get-paging`).
- [t-bank-link] Bank Link SDK. [t-bank-link-session] Tạo phiên liên kết.
- [t-qr] QR Code overview. [t-qr-static] VietQR tĩnh. [t-qr-dyn] Tạo QR
  động.
- [t-deeplink] Pay by Bank / Deep Link, with the bank and webhook table.
- [t-gw] Tạo link thanh toán (payment gateway).
- [t-mm] Merchant & Master Merchant. [t-mm-create] Tạo tài khoản Merchant.
- [t-webhook] Webhook Notifications, including URL verification.
- [t-pay-cb] Webhook thông báo kết quả thanh toán.
- [t-va-status] Webhook trạng thái liên kết tài khoản.
- [t-bank-link-wh] Webhook kết quả liên kết ngân hàng, including
  authentication types.
- [t-ipn] Webhook (IPN): signature and retry policy.
- [t-sdk-wh] Thư viện Backend: xác thực Webhook.
- [t-sandbox] Sandbox. [t-changelog] Changelog.
- [t-llms] Full documentation as Markdown (`llms-full.txt`) and OpenAPI file.
- [t-home] tingee.vn home page. [t-va-site] Tài khoản định danh page.
  [t-gw-site] Cổng thanh toán page, with FAQ. [t-faq] FAQ.
- [t-terms] Điều kiện và điều khoản sử dụng dịch vụ, effective 01/11/2026.

[t-docs]: https://developers.tingee.vn/docs/
[t-config]: https://developers.tingee.vn/docs/config-info
[t-notes]: https://developers.tingee.vn/docs/luu-y-quan-trong
[t-banking]: https://developers.tingee.vn/docs/banking/
[t-get-banks]: https://developers.tingee.vn/docs/banking/get-banks
[t-create-va]: https://developers.tingee.vn/docs/banking/create-va
[t-create-debit]: https://developers.tingee.vn/docs/banking/create-debit
[t-tx]: https://developers.tingee.vn/docs/banking/get-paging-transaction
[t-bank-link]: https://developers.tingee.vn/docs/bank-link/
[t-bank-link-session]: https://developers.tingee.vn/docs/bank-link/create-session
[t-qr]: https://developers.tingee.vn/docs/qr/
[t-qr-static]: https://developers.tingee.vn/docs/qr/static/generate-viet-qr
[t-qr-dyn]: https://developers.tingee.vn/docs/qr/dynamic/generate-dynamic-qr
[t-deeplink]: https://developers.tingee.vn/docs/deeplink/
[t-gw]: https://developers.tingee.vn/docs/payment-gateway/create-payment-link
[t-mm]: https://developers.tingee.vn/docs/master-merchant/
[t-mm-create]: https://developers.tingee.vn/docs/master-merchant/merchant/create
[t-webhook]: https://developers.tingee.vn/docs/webhook/
[t-pay-cb]: https://developers.tingee.vn/docs/webhook/webhook-payment-callback
[t-va-status]: https://developers.tingee.vn/docs/webhook/webhook-va-status
[t-bank-link-wh]: https://developers.tingee.vn/docs/webhook/webhook-bank-link
[t-ipn]: https://developers.tingee.vn/docs/webhook-ipn
[t-sdk-wh]: https://developers.tingee.vn/docs/sdk/webhook
[t-sandbox]: https://developers.tingee.vn/sandbox
[t-changelog]: https://developers.tingee.vn/changelog
[t-llms]: https://developers.tingee.vn/llms-full.txt
[t-home]: https://tingee.vn/
[t-va-site]: https://tingee.vn/tai-khoan-dinh-danh/
[t-gw-site]: https://tingee.vn/cong-thanh-toan/
[t-faq]: https://tingee.vn/faq/
[t-terms]: https://tingee.vn/dieu-kien-va-dieu-khoan-dich-vu/
