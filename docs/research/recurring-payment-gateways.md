# Research: recurring charges through licensed payment gateways (option C)

> Status: desk research written 2026-11-19 for DOS/Give#255, after JOY asked
> whether Give can offer card or wallet plans like other platforms. It is the
> source for `docs/Give-Technical-Design.md` section 4.3.6 (option C). Nothing
> here is a decision. Web research only: no gateway was contacted.
>
> Tags: **[read]** the page was read; **[search]** only a search-result
> snippet was read; **[inference]** our reasoning. "Not found" means we
> looked and found nothing, not that it does not exist.

## 1. Question

Option C: the donor stores a card or links a wallet once with a licensed
payment gateway. Each month Give sends a charge request. The gateway settles
the money **directly into the campaign's own bank account**, never through
Give (D3). Three things must hold:

1. Give can charge without the donor present (merchant-initiated).
2. Settlement goes straight to each organizer's own bank account.
3. An individual organizer (not a company) can be the merchant or sub-merchant.

## 2. Vietnamese gateways and wallets

Pages that would not load: developers.momo.vn (HTTP 403), the VNPAY sandbox
docs index (403), paypal.com/vn merchant fees (403). Every MoMo and PayPal fee
claim is therefore [search].

| Provider             | Recurring / token                                                                                                                                                                                                                                                          | Sub-merchant, direct settlement to organizer                                                                                                                                                                                  | Individual as merchant, KYC                                                                                                                                 | Fees, settlement, chargeback, charity MCC                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| MoMo                 | `requestType=subscription` with `subscriptionInfo`; charges at fixed intervals "without any specific payment action from the consumer" [search, S1]. Wallet linking returns a recurring token [search, S3]. A Tokenization Evaluation Form is required first [search, S2]. | `subPartnerCode` applies "to Master Merchant and 3PSP groups only" [search, S5]. Where money settles: not found.                                                                                                              | From 2026-03-19, household-business accounts need a business licence and a bank account in the household's name [search, S6]. Plain individuals: not found. | Not found. MoMo runs its own vetted charity programmes [search, S7]; a charity MCC for third parties: not found.           |
| ZaloPay              | AgreementPay: merchant calls CreateBinding, user confirms in the app, merchant receives `pay_token`, then PayByToken; user can unbind in the app [read, S8]. "Subscription" is a reminder service only [read, S9].                                                         | `sub_app_id` is "only applicable to special partners" [search, S10]. Where money settles: not found.                                                                                                                          | A secondary source says individuals and household businesses can register with ID card and bank account [search, S11].                                      | Not found.                                                                                                                 |
| Bảo Kim              | "Auto Debit": register with amount 0, then charge with a stored token; international cards support "CIT + MIT (UCOF)" [read, S24, S25].                                                                                                                                    | Master/Sub Merchant model (`master_merchant_code`, `sub_merchant_code`) [read, S24]. The webhook's `amount` is the "amount changing sub merchant balance" [read, S26]: money likely sits in a balance at Bảo Kim [inference]. | Not found.                                                                                                                                                  | Fee fields exist, rates not found. Refund API exists [search].                                                             |
| VNPAY                | `token_create` / `token_pay` / `token_remove`; `token_pay` is a browser redirect with the customer's IP and a return URL. No recurring mode documented [read, S12]. So the customer appears to be present for each charge [inference].                                     | Not found.                                                                                                                                                                                                                    | Not found.                                                                                                                                                  | A bank fee schedule shows 0.5% to 0.7% for some categories [search, S13].                                                  |
| OnePay (VN)          | No token or recurring documentation found for OnePay Vietnam; its domestic-card guide covers redirect, IPN and QueryDR only [search, S15]. Token pages found belong to other companies named OnePay.                                                                       | Not found.                                                                                                                                                                                                                    | Not found.                                                                                                                                                  | Licence 06/GP-NHNN covers payment gateway, collection support and e-wallet [read, S14].                                    |
| Alepay / Ngân Lượng  | Card token stored by the merchant for later charges [search, S27]. No schedule.                                                                                                                                                                                            | Not found.                                                                                                                                                                                                                    | Not found.                                                                                                                                                  | Not found.                                                                                                                 |
| 2C2P (VN, via M-Pay) | Generic docs: tokenization, token payments (CVV still entered), RPP recurring plans [read, S16]. Whether these work in Vietnam: not found [read, S18].                                                                                                                     | Payment-token request takes a sub-merchant list [search, S17]. Where money settles: not found.                                                                                                                                | Not found.                                                                                                                                                  | Instalments: the bank carries the risk [read, S18].                                                                        |
| ShopeePay (VN)       | Linking and subscription APIs found only for Indonesia [search, S28]. The only VN document found covers QR [search, S29].                                                                                                                                                  | Not found.                                                                                                                                                                                                                    | Not found.                                                                                                                                                  | Not found.                                                                                                                 |
| Stripe               | Full support, but Vietnam is not a supported account country [read, S19].                                                                                                                                                                                                  | Connect cross-border payouts only between US, UK, EEA, Canada and Switzerland [read, S21]. Vietnam is a Global Payouts recipient (2026) [read, S20]; both flows pass money through the platform [inference].                  | No.                                                                                                                                                         | n/a                                                                                                                        |
| PayPal (VN)          | Not found for VN accounts.                                                                                                                                                                                                                                                 | Not found.                                                                                                                                                                                                                    | Not found.                                                                                                                                                  | Receiving from abroad 4.40% + fixed fee; donations count as commercial [search, S22]. Withdrawal 60,000 VND [search, S23]. |

Payoo, MegaPay, VNPT EPAY and Napas: no public evidence of recurring or token
support [search].

**Result.** No provider publicly documents all three conditions in section 1.
The closest are MoMo, ZaloPay and Bảo Kim. Fees, settlement time,
chargeback terms and whether a donation or charity category (MCC 8398) is
accepted are not published by any of them.

## 3. How other platforms do it

| Platform                     | Mechanism                                                                                                              | Processor and who holds funds                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Fees                                                                                                   | Failure or stop rules                                                                                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GoFundMe monthly             | Donor authorises "GoFundMe or its vendors" to charge the payment method each month (ToS 6.2(b)) [read, P1].            | Adyen, Stripe, PayPal, PayPal Giving Fund (ToS 5). ToS 3.2: GoFundMe does not "receive, hold, process… or exercise custody" over funds; the organizer gives bank details to the processors [read, P1]. But the processors hold the funds until the beneficiary transfers them out ("Transfers", ToS 2.24 [read, P1]); funds not transferred within 120 days may be refunded or escheated (ToS 7.1(b), 7.1(c)) [read via a tool summary of P1, section 7 wording not seen verbatim]. | 2.9% + USD 0.30 per donation in the US [read, P2]; ToS 2.17 allows a "recurring fixed fee" [read, P1]. | Stops when the fundraiser is no longer "valid, active", or when the donor cancels (6.2(b)) [read, P1].                                                                              |
| Kickstarter Pledge Over Time | Three equal charges: at successful end, then monthly. Creator opts in. Minimum USD 125 / EUR 125 / GBP 100 [read, P3]. | Stripe Connect "to route funds to creators" [read, P4]; that Pledge Over Time also runs on Stripe Connect is [inference]. Payouts are not immediate: the first about 14 days after the campaign ends, the second and third about 8 and 12 weeks after it ends [read, P3].                                                                                                                                                                                                           | No extra fee for backers [read, P3]; creator fees not verified (page 403).                             | 7 or 14 days to fix a failed charge, then the pledge is dropped; amounts collected "may be considered bonus support" [read, P3], so the creator gets less than pledged [inference]. |
| Patreon                      | Monthly, per-creation or annual billing [read, P5].                                                                    | "Patreon is the billing entity", handles chargebacks, and holds creator balances before payout [read, P5; search, P6].                                                                                                                                                                                                                                                                                                                                                              | Platform fee as a percentage [read, P5].                                                               | No refunds as policy [read, P5].                                                                                                                                                    |

**Stripe Connect charge types** [read, P7]: with **direct charges** the charge
sits in the connected account's balance, refunds and chargebacks reduce that
account, and funds settle in the connected account's country. With
destination charges and "separate charges and transfers", the payment appears
in the platform's balance, and disputes debit the platform even with
`on_behalf_of`. Only direct charges keep money out of the platform.

**The common market model is a processor-held balance, not direct
settlement.** GoFundMe and Kickstarter both leave funds in a balance at the
processor before paying the organizer (above). Whether such a balance, held
for the organizer and not controlled by Give, is acceptable under D3 and
Decree 93 Art. 17.2 is a question for counsel (design P4(j)) [inference].

## 4. Vietnamese law

- **Decree 52/2024/ND-CP** [read, L1]: a payment gateway "provides technical
  infrastructure to connect, transmit and process electronic data" between
  customers, merchants and banks (Art. 3.18); collection and payment support
  includes paying the parties (Art. 3.17). Both are intermediary payment
  services (Art. 22.1) that a non-bank provides only with an SBV licence
  (Art. 22.2); providing them without a licence is prohibited (Art. 8.7).
  Licensed providers check and supervise their merchants (Art. 29.2). The
  decree says nothing about platforms or marketplaces. A draft amendment was
  released on 2026-07-27 [read, L2]; adoption not confirmed.
- **Circular 40/2024/TT-NHNN** [read, L3]: contracts with partner banks cover
  choosing and supervising merchants (Art. 8.4(a)); a provider that contracts
  merchants directly has a payment provider's duties to them (Art. 9.6); a
  provider working with a partner that offers goods or services needs a
  contract on identity, split of responsibility and risk, contact point and
  disclosure (Art. 9.7), the closest hook for a Give–gateway contract
  [inference]; collection support pays merchants "đầy đủ và đúng hạn"
  (Art. 36.2(b)); personal wallets of individuals acting as merchants are
  recognised (Art. 26.2(a)). Amended by Circulars 41/2025 and 22/2026
  [search, L4], not reviewed.
- **Circular 15/2024, consolidated 26/VBHN-NHNN** [read, L5]: a merchant is a
  "tổ chức, cá nhân cung cấp hàng hóa, dịch vụ" accepting cashless payment
  under a contract (Art. 3.8). Onboarding needs a written contract, checks and
  a payment account to receive funds (Art. 20.3; article number not
  re-verified).
- **Circular 18/2024 on bank cards** [read, L6], amended by Circular
  45/2025 and consolidated as 30/VBHN-NHNN of 2025-12-19 [search, L12, L14; the
  consolidated text was not read]: acquirers require proof of lawful
  business (Art. 17.3(b)) and must refuse a "giao dịch thanh toán khống",
  a payment with no real sale of goods or services (Art. 3.9, 25.1(a)).
  These article numbers come from the original text and are **not verified**
  against the consolidated text. A
  donation is not a sale, so whether an individual charity organizer can be a
  card or wallet merchant is doubtful [inference]. No guidance on donations
  as merchant transactions was found. Card use for e-transactions needs a
  one-time biometric check of the cardholder, with exemptions (Art. 16.6,
  not verified) [search, L7].
- **Circular 50/2024**, amended by Circular 77/2025 [search, L13]: sets
  authentication thresholds for online banking transactions [search, L8].
  The exact thresholds and which customers they apply to were not read, so
  they are not relied on here. Whether registered recurring debits are
  exempt: not found. No article requiring a per-charge
  authorisation for wallet auto-debit was found; the binding or first payment
  is the donor's authorisation [inference].
- **Decree 93/2021 Art. 17.2** [read, L9]: an individual campaigner receives
  money into a separate account at a commercial bank for each campaign and
  stops receiving after the committed period. Gateway settlement must
  therefore land in that account, and charges must stop at the campaign's end
  [inference]. A MoMo `subscription` has an expiry date
  (`subscriptionInfo.expiryDate`; charges are refused from that date)
  [search, S1]; set it
  no later than the campaign's `ends_at` as a second stop [inference].
- **E-commerce:** Law 122/2025/QH15, in force 2026-07-01 [read, L10].
  Decree 248/2026/ND-CP [read, L11]: disclose payment and refund methods
  (Art. 10); electronic identity checks of sellers from 2027-01-01
  (Art. 18.1(a), 52–53); large platforms disclose payment partners
  (Art. 18.3(d)). Whether a donation platform is an e-commerce platform under
  this law: not found.

## 5. Assessment

1. C does not breach D3 if the gateway settles directly into each campaign's
   own account, fees are deducted by the gateway or billed separately, and
   refunds and chargebacks hit the organizer's side, never a Give balance. If the gateway runs the schedule (MoMo `subscription`), stopping on time needs a confirmed cancel call before the next charge. This mirrors Stripe direct charges [inference]. It is not how GoFundMe or
   Kickstarter work: both use a processor-held balance (section 3), whose
   fit with D3 and Decree 93 Art. 17.2 is design P4(j).
2. C breaches D3 if money passes through a Give balance, or through a balance
   at the gateway whose payout Give controls. Bảo Kim's webhook shows a sub-merchant balance exists [read]; who controls payouts from it is unknown [inference].
3. The biggest risk is legal, not technical: merchants are defined as sellers
   of goods or services, and card rules ban acquiring without a real sale.
4. Questions for counsel: can individual campaigners be card or wallet
   merchants for donations; does Give need its own intermediary licence when
   it only initiates charges; is Give an e-commerce platform under Law
   122/2025 and Decree 248/2026; can gateway fees be deducted from Decree 93
   receipts; must settlement land in the Decree 93 campaign account, or is a
   gateway-held balance for the organizer acceptable.
5. Questions for MoMo, ZaloPay and Bảo Kim, in writing: (1) settlement
   straight to each sub-merchant's own bank account; (2) individual
   sub-merchants without business registration, and KYC; (3) merchant-initiated
   charges without the donor present; (4) donation or charity accepted as a
   category (MCC 8398), for individual and organisation organizers; (5) who
   bears chargebacks, fees and T+n; (6) does money settle to the
   sub-merchant's own bank account or to a balance held at the gateway, and on
   what schedule; (7) per-charge and settlement data, and a per-schedule end
   date; (8) contract structure: who is the đơn vị chấp nhận thanh toán,
   whether DOS signs for, guarantees or carries chargebacks of sub-merchants,
   and whether DOS needs its own licence; (9) per-charge and per-day limits,
   and the authentication needed for merchant-initiated charges. The
   ready-to-send letter is
   `docs/research/recurring-step2-outreach.md` part A.

## Sources

Gateways and wallets:

- S1 https://developers.momo.vn/v3/docs/payment/api/wallet/subscription/
- S2 https://developers.momo.vn/v3/docs/payment/guides/aio-tokenization-payment/
- S3 https://developers.momo.vn/v3/docs/payment/api/wallet/pay-with-token/
- S5 https://developers.momo.vn/v3/docs/payment/api/payment-aio-device/
- S6 https://www.momo.vn/tin-tuc/khuyen-mai/loa-bao-momo-nhan-tien-dung-chuan-tai-khoan-ho-8565
- S7 https://www.momo.vn/hoi-dap/dich-vu-cong-dong-ctgr137/trai-tim-momo
- S8 http://docs.zalopay.vn/docs/guides/payment-acceptance/tokenization/wallet-token/
- S9 http://docs.zalopay.vn/docs/guides/payment-acceptance/tokenization/subscription/
- S10 https://developers.zalopay.vn/downloads/api/ZaloPay-APIs-Integration-Document.pdf
- S11 https://fptshop.com.vn/tin-tuc/danh-gia/zalopay-merchant-200893
- S12 https://sandbox.vnpayment.vn/apis/docs/thanh-toan-token/token.html
- S13 https://www.namabank.com.vn/Data/Sites/1/media/bieu-phi/doanh-nghiep/2026/ (fee schedule PDF, 2026-06-15)
- S14 http://www.onepay.vn/en/for-service-support/transaction-dispute/
- S15 https://mtf.onepay.vn/developer/resource/documents/docx/quy_trinh_tich_hop-noidia.pdf
- S16 https://developer.2c2p.com/docs/sdk-payment-features
- S17 https://developer.2c2p.com/v4.3.0/docs/api-payment-token-request-parameter
- S18 https://2c2p.com/countries/vietnam/
- S19 https://stripe.com/global
- S20 https://docs.stripe.com/changelog/clover/2026-01-28/cross-border-payouts-new-countries
- S21 https://docs.stripe.com/connect/cross-border-payouts
- S22 https://www.paypal.com/vn/webapps/mpp/merchant-fees
- S23 https://www.paypal.com/vn/webapps/mpp/paypal-fees
- S24 https://developers.baokim.vn/en/docs/B2B/overview
- S25 https://developers.baokim.vn/en/docs/B2B/api-reference/master-merchant/basic-pro/create-order
- S26 https://developers.baokim.vn/en/docs/B2B/api-reference/master-merchant/basic-pro/webhook-payment
- S27 https://cdn.jsdelivr.net/npm/wservice-api@1.1.5/alepay/Alepay_Tokenization_API_v1.2_VI.pdf
- S28 https://product.shopeepay.co.id/integration/api/account-linking/go/
- S29 https://wiki.monkeyenglish.net/assets/uploads/files/1662359292751-shopeepay_merchant_integration_pgw_4_52_vietnamese_docx_2_1.pdf

Platforms:

- P1 https://www.gofundme.com/en-ca/c/terms
- P2 https://www.gofundme.com/pricing
- P3 https://help.kickstarter.com/hc/en-us/articles/33915468199835-Pledge-Over-Time-FAQ
- P4 https://stripe.com/customers/kickstarter
- P5 https://www.patreon.com/policy/legal
- P6 https://support.patreon.com/hc/articles/28801582599181
- P7 https://docs.stripe.com/connect/charges

Law:

- L1 https://vanban.vcci.com.vn/nghi-dinh-522024nd-cp-quy-dinh-ve-thanh-toan-khong-dung-tien-mat
- L2 https://www.tilleke.com/insights/vietnams-draft-decree-on-non-cash-payments-would-relax-requirements-for-ips-providers/
- L3 https://luatvietnam.vn/tai-chinh/thong-tu-40-2024-tt-nhnn-2024-hoat-dong-cung-ung-dich-vu-trung-gian-thanh-toan-360680-d1.html
- L4 https://english.luatvietnam.vn/circular-no-22-2026-tt-nhnn-dated-may-19-2026-of-the-state-bank-of-vietnam-amending-and-supplementing-a-number-of-articles-of-circular-no-40-2024-t-435184-doc1.html
- L5 https://luatvietnam.vn/tai-chinh/van-ban-hop-nhat-26-vbhn-nhnn-2025-hop-nhat-thong-tu-quy-dinh-ve-cung-ung-dich-vu-thanh-toan-khong-dung-tien-mat-419248-d5.html
- L6 https://luatvietnam.vn/tai-chinh/thong-tu-18-2024-tt-nhnn-cua-ngan-hang-nha-nuoc-viet-nam-quy-dinh-ve-hoat-dong-the-ngan-hang-358546-d1.html
- L7 https://lsvn.vn/nhung-truong-hop-duoc-mien-doi-chieu-sinh-trac-hoc-khi-giao-dich-dien-tu-the-ngan-hang-a166739.html
- L8 https://www.sbv.gov.vn/documents/20117/4269594/thong_cao_bao_chi_tt_50_v1_b6e0_0501.signed-1.pdf.pdf/05f4b2d5-310b-3594-e034-d9627a093cef
- L9 Decree 93/2021 text, read on caselaw.vn (document 408210); the sources in `docs/research/legal-charity-campaigns.md` section 2 cover the same text
- L10 https://luatvietnam.vn/tin-van-ban-moi/da-co-luat-thuong-mai-dien-tu-2025-so-122-2025-qh15-186-106402-article.html
- L11 https://hethongphapluat.com/nghi-dinh-248-2026-nd-cp-huong-dan-luat-thuong-mai-dien-tu.html
- L12 https://luatvietnam.vn/tai-chinh/van-ban-hop-nhat-30-vbhn-nhnn-2025-quy-dinh-hoat-dong-the-ngan-hang-422842-d5.html
- L14 https://vbpl.moj.gov.vn/TW/Lists/vbpq/Attachments/186079/30.2025.VBHN.NHNN.docx (official file of 30/VBHN-NHNN)
- L13 https://luatvietnam.vn/linh-vuc-khac/diem-moi-thong-tu-77-2025-tt-nhnn-ve-bao-mat-online-banking-883-106480-article.html
