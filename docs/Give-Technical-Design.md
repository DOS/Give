# Give – Thiết kế kỹ thuật v0.1

> Trạng thái: **bản nháp để review**, viết ngày 27/10/2026.
> Thay thế hướng kỹ thuật trong `Platform-Architecture.md`, `Platform-Roadmap.md` và `Giveth-Ref/*`. Các tài liệu đó (Strapi, blockchain/Giveth, kế hoạch 8 tuần) đã lỗi thời.
> **Lưu ý:** code mới nhất của bản cũ nằm trên nhánh `origin/dev` (27/10/2025), không phải `main` (23/06/2025). Mục 0.1 ghi lại những gì kế thừa từ nhánh đó.

## 0.1 Kế thừa từ thiết kế cũ (nhánh `dev`)

Thiết kế cũ đã tách 2 loại campaign, và bản này giữ nguyên tên gọi đó:

| Thiết kế cũ (`dev`)                                                                                                                                                                                                                                                                                                   | Bản này                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Project.Type`: `give` (từ thiện) và `back` (dự án sáng tạo, có reward). Badge "❤️ Give" / "🚀 Back".                                                                                                                                                                                                                 | Giữ nguyên: `campaigns.type IN ('give','back')`. `give` = GoFundMe, `back` = Kickstarter.                                                                                        |
| `Category.Type`: `Give` / `Back` / `Both`. Bộ danh mục riêng: 8 cho Give (Disaster Relief, Poverty Alleviation, Healthcare, Education, Environment, Animal Welfare, Community Development, Humanitarian Aid) và 8 cho Back (Technology, Arts, Film & Video, Games, Music, Publishing, Food & Craft, Design & Fashion) | Giữ nguyên: `categories.applies_to IN ('give','back','both')`; seed lại 16 danh mục này (dịch tiếng Việt). Form tạo campaign lọc danh mục theo loại, như `CreateProjectForm` cũ. |
| Lời kêu gọi khác nhau: "Support"/donation cho Give, "Back this project"/backing cho Back                                                                                                                                                                                                                              | Giữ. Copy UI tách theo `type`.                                                                                                                                                   |
| `GoalMilestones` (mốc trong mục tiêu), `EnableStretchGoals` + `StretchGoal`                                                                                                                                                                                                                                           | Giữ: bảng `give.campaign_milestones` (dùng cho cả hai loại). Stretch goal chỉ áp dụng cho `back`.                                                                                |
| `MinimumDonation`, `ShowProgressBar`, `ShowBackersCount`, `ShowTimeRemaining`                                                                                                                                                                                                                                         | Giữ: `min_contribution` và `display_options jsonb`.                                                                                                                              |
| Comment có thread, cập nhật dự án, hồ sơ người dùng, analytics cho chủ campaign                                                                                                                                                                                                                                       | Giữ ở mức nghiệp vụ. Port UI từ `apps/web` của `dev`.                                                                                                                            |
| **Thanh toán:** Stripe thu ngay cho cả hai loại. Webhook cộng dồn `CurrentFunding` bằng cách đọc rồi ghi lại, và cả `checkout.session.completed` lẫn `payment_intent.succeeded` đều cộng tiền.                                                                                                                        | **Không giữ.** Cách này có thể đếm một khoản hai lần và dính race condition. Không có all-or-nothing. Không dùng Stripe ở VN. Thay bằng mục 3–5.                                 |

## 0. Quyết định đã chốt và giả định

| #   | Nội dung                                                                                                                                                                                                                                                                                                         | Nguồn                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| D1  | Sản phẩm = GoFundMe (từ thiện, flexible) + Kickstarter (reward, all-or-nothing). Equity, cho vay, chia lợi nhuận nằm ngoài phạm vi.                                                                                                                                                                              | Handoff                  |
| D2  | Thị trường đầu tiên là Việt Nam, đơn vị tiền VND.                                                                                                                                                                                                                                                                | JOY                      |
| D3  | **Nền tảng không giữ tiền.** Tiền đi thẳng vào tài khoản nhận của từng campaign. Give chỉ ghi nhận, đối soát và công khai.                                                                                                                                                                                       | JOY                      |
| D4  | Mỗi campaign từ thiện có một tài khoản nhận riêng. Ưu tiên tài khoản minh bạch của ngân hàng đối tác. Nếu ngân hàng không cấp API thì dùng tài khoản thường kèm import sao kê, hoặc ví crypto. JOY tự xử lý phần pháp lý.                                                                                        | JOY                      |
| D5  | Dùng chung Supabase của DOS, schema riêng `give`. Mọi DDL là migration idempotent trong `DOS.Me/supabase/migrations/`, đi qua CI preview → beta → prod.                                                                                                                                                          | JOY + `DOS.Me/AGENTS.md` |
| D6  | Stack: Next.js 16 (App Router) + `@supabase/supabase-js` + đăng nhập first-party của DOS.Me, triển khai trên Vercel. **Bỏ Strapi.** Từ repo cũ chỉ port UI (ProjectCard, bộ lọc, layout trang chi tiết).                                                                                                         | Đề xuất, chưa phản đối   |
| D7  | All-or-nothing ở VN dùng **phương án A: cam kết trước, đạt mục tiêu mới thanh toán**. Lý do: thanh toán QR không lưu được phương thức thanh toán, và theo D3 nền tảng không giữ tiền.                                                                                                                            | Đề xuất                  |
| D8  | Kênh tự động của M2 là **Tingee**, thay cho payOS: chỉ nhận biến động số dư, tiền vẫn vào thẳng tài khoản người tổ chức. Chưa hỗ trợ Techcombank. Xem `docs/research/tingee.md`.                                                                                                                                 | JOY, 2026-11-18          |
| D9  | Ủng hộ hằng tháng. Bước 1: nhắc góp hằng tháng (A), làm ngay. Bước 2: kiểm tra cổng của A+ (lệnh chuyển định kỳ do người góp tự đặt với mã cố định) và của C (thu định kỳ qua cổng thanh toán) **song song**; phương án nào qua hết cổng của nó trước thì làm trước (JOY: "Cả hai, hỏi song song"). Xem mục 4.3. | JOY, 2026-11-19          |

Giả định cần xác minh:

- **G1.** Nghị định 93/2021 yêu cầu cá nhân vận động mở tài khoản riêng cho từng cuộc vận động, và không nhận thêm tiền sau khi hết hạn. Nguồn mới chỉ là báo chí, chưa đọc văn bản gốc.
- **G2.** Gửi tiền crypto làm phương tiện thanh toán ở VN có rủi ro pháp lý. Kênh crypto chỉ bật sau khi JOY chốt pháp lý.
- **G3.** Giới hạn độ dài nội dung chuyển khoản, nên mã ủng hộ phải ngắn: tối đa 10 ký tự, chỉ chữ in hoa và số.

## 1. Kiến trúc tổng thể

```
Người dùng ──► Give web (Next 16, Vercel)
                 │  route handlers / server actions (service role)
                 │  /api/webhooks/{channel}      ◄── ngân hàng, PayOS, chain indexer
                 │  /api/cron/*  (Vercel Cron)   ──► các job idempotent
                 ▼
          Supabase dùng chung (schema give)
                 - RLS: client chỉ ĐỌC qua view công khai và dữ liệu của chính mình
                 - Logic tiền nằm trong hàm Postgres (SECURITY DEFINER, chỉ service_role gọi được)
                 - auth.users từ DOS.Me
```

Nguyên tắc:

1. **Mọi thao tác thay đổi tiền hay trạng thái tiền đều là một hàm Postgres chạy trong một transaction.** Code Next chỉ gọi RPC. Nhờ vậy tính nguyên tử, khóa dòng và tính idempotent được bảo đảm ở một chỗ, và test được bằng pgTAP.
2. **Sổ cái chỉ ghi thêm** (`give.ledger_entries`), có trigger chặn UPDATE và DELETE. Mọi số tổng hiển thị đều tính ra từ sổ cái, không lưu counter sửa tay.
3. **Dữ liệu ngân hàng là nguồn sự thật.** `give.bank_transactions` là bản sao sao kê của tài khoản nhận. Give không bao giờ coi một khoản là "đã nhận" chỉ vì người dùng bấm "tôi đã chuyển".
4. **Mọi đầu vào từ bên ngoài đều qua bước khử trùng lặp.** Webhook, import sao kê và polling cùng dẫn tới một khóa duy nhất cho mỗi giao dịch.

## 2. Schema `give`

Quy ước:

- Tiền là `bigint`, đơn vị nhỏ nhất của tài sản: đồng với VND, đơn vị cơ sở của token với crypto. Kèm cột `asset` (mặc định `'VND'`).
- Trạng thái dùng `text` + `CHECK`, không dùng kiểu ENUM, để migration sau dễ thêm giá trị.
- Bảng nào cũng có `created_at` và `updated_at`. Khóa chính là `uuid`, sinh bằng `gen_random_uuid()`.
- Migration theo mẫu `create_nhan_schema_foundation.sql`: `CREATE ... IF NOT EXISTS` và `DROP POLICY IF EXISTS` trước khi tạo lại.
- Thêm `give` vào `[api] schemas` trong `DOS.Me/supabase/config.toml`, và vào cấu hình exposed schemas của các môi trường.

### 2.1 Người tổ chức và nội dung

```sql
give.organizers (
  user_id            uuid PK → auth.users,
  kind               text CHECK (kind IN ('individual','organization')),
  organization_id    text NULL → public.organizations,   -- quỹ/CLB, dùng sau
  legal_name         text NOT NULL,                       -- phải khớp tên chủ tài khoản nhận
  phone              text,
  verification_status text CHECK IN ('unverified','pending','verified','rejected') DEFAULT 'unverified',
  verified_at, verified_by uuid
)
-- Không lưu ảnh CCCD trong Give. Việc định danh dựa vào ngân hàng (eKYC) hoặc admin xác nhận thủ công.

give.categories (id, slug UNIQUE, name, description, icon, color, sort_order, is_active,
  applies_to text CHECK IN ('give','back','both'))       -- kế thừa Category.Type của bản cũ

give.campaigns (
  id uuid PK, slug text UNIQUE,
  type            text CHECK IN ('give','back'),          -- give = từ thiện, back = dự án có reward
  funding_model   text CHECK IN ('flexible','all_or_nothing'),
  CHECK ((type='give' AND funding_model='flexible') OR (type='back' AND funding_model='all_or_nothing')),  -- MVP
  organizer_id    uuid → give.organizers,
  beneficiary_name text, beneficiary_relation text, beneficiary_user_id uuid NULL,   -- give
  min_contribution bigint DEFAULT 10000,
  stretch_goal_amount bigint NULL,         -- chỉ cho back
  display_options jsonb DEFAULT '{"progress_bar":true,"backers_count":true,"time_remaining":true}',
  title, summary (≤200), story (markdown), cover_media_id, category_id,
  asset           text DEFAULT 'VND',
  goal_amount     bigint CHECK (goal_amount > 0),
  starts_at, ends_at timestamptz,          -- back: bắt buộc ends_at, thời lượng ≤ 60 ngày
  payment_window_days int DEFAULT 7,       -- back: số ngày để trả tiền sau khi đạt mục tiêu
  receiving_account_id uuid → give.receiving_accounts,   -- gắn qua give.account_bindings (mục 2.2)
  status text CHECK IN ('draft','in_review','changes_requested','approved','live',
                        'settling','succeeded','failed','closed','suspended','cancelled'),
  outcome_at timestamptz
)
-- Trigger: category.applies_to phải là 'both' hoặc bằng campaign.type
give.campaign_milestones (id, campaign_id, title, description, target_amount bigint, unlock_note, sort_order)
  -- "đã đạt" tính từ sổ cái (received với give, pledged với back), không lưu cờ IsReached
give.campaign_status_events (id, campaign_id, from_status, to_status, actor_id, reason, at)  -- chỉ ghi thêm
give.campaign_media (id, campaign_id, kind ('image','youtube'), storage_path|url, sort_order)
give.campaign_updates (id, campaign_id, author_id, title, body, visibility ('public','backers'), published_at)
```

Máy trạng thái của campaign (chỉ hàm `give.transition_campaign()` được đổi trạng thái):

```
draft → in_review → approved → live → (give) closed
            ↓  ↑                    → (back)  settling → succeeded | failed
     changes_requested
live/approved → suspended (admin) → live | cancelled
draft/in_review/approved → cancelled (người tổ chức)
```

Với chiến dịch `give`, mọi bước chuyển sang `in_review`, `approved` hoặc `live` (gồm cả cron mở chiến dịch và mở lại sau tạm dừng) cần một tài khoản nhận dùng được: đang gắn với chiến dịch, đã xác minh, thuộc người tổ chức đã xác minh và đứng tên pháp lý của người đó. Thiếu thì hàm báo `GIVE_CAMPAIGN_NO_RECEIVING_ACCOUNT`; cron bỏ qua chiến dịch đó và để nó ở `approved` (DOS/Give#38). Nếu tài khoản hỏng sau khi gửi duyệt, kiểm duyệt viên trả chiến dịch về `changes_requested`; khi đó người tổ chức nhả được tài khoản chưa nhận giao dịch nào, gắn tài khoản khác rồi gửi duyệt lại. Chiến dịch `back` chỉ cần tài khoản khi thanh toán (M3).

### 2.2 Tài khoản nhận

```sql
give.receiving_accounts (
  id uuid PK,
  owner_user_id uuid → auth.users,
  channel   text CHECK IN ('bank_api','payos','statement_import','crypto'),
  -- ngân hàng
  bank_bin  text,  account_number text,  account_name text,
  account_kind text CHECK IN ('transparent_charity','standard'),
  public_statement_url text,               -- ví dụ trang sao kê công khai của ngân hàng
  -- crypto
  chain text, address text,
  -- thông tin bí mật của kênh (API key PayOS…) lưu ở Supabase Vault; ở đây chỉ giữ id
  credential_secret_id uuid NULL,
  verification_status text CHECK IN ('pending','verified','rejected','disabled'),
  verified_by, verified_at,
  UNIQUE (bank_bin, account_number), UNIQUE (chain, address)
)

-- Một tài khoản nhận thuộc về đúng một campaign cho tới khi được nhả RÕ RÀNG,
-- không tự nhả khi campaign đổi trạng thái.
give.account_bindings (
  id uuid PK,
  receiving_account_id uuid, campaign_id uuid,
  bound_at timestamptz, released_at timestamptz NULL, released_by uuid NULL
)
CREATE UNIQUE INDEX ... ON give.account_bindings(receiving_account_id) WHERE released_at IS NULL;
```

Chỉ hàm `give.release_account_binding()` được nhả binding, và chỉ khi campaign đã xong hẳn phần tiền, trừ khi binding chưa nhận giao dịch nào:

- `draft`, và với `give` cả `changes_requested` (DOS/Give#38) hay `cancelled`: nhả ngay nếu tài khoản chưa nhận giao dịch nào trong binding đó.
- `give`: đã `closed` (hoặc `cancelled`) ít nhất 30 ngày, và mọi giao dịch của tài khoản trong thời gian binding đã được khớp hoặc giải trình.
- `back`: `failed` hoặc `cancelled`, hoặc `succeeded` và không còn contribution nào ở `payment_due`, `partially_paid` hay `refund_due`.

Mỗi giao dịch được gắn `campaign_id` theo binding đang hiệu lực tại lúc ghi nhận, và không bao giờ đổi sau đó (mục 2.4). Nhờ vậy, khi tài khoản được dùng lại cho campaign sau, sao kê, tiền chưa khớp và báo cáo chi của campaign cũ vẫn tách bạch.

**Đổi tài khoản khi chiến dịch có thể đã có tiền (DOS/Give#55).** Chiến dịch `give` đang `live` hoặc `suspended`, hoặc `changes_requested` mà tài khoản đã nhận giao dịch, không nhả được tài khoản. Khi tài khoản đó không dùng được nữa, người tổ chức gửi yêu cầu đổi sang một tài khoản khác đã xác minh, đứng tên mình (`give.request_account_swap`); nhân viên tài chính hoặc quản trị viên duyệt hay từ chối (`give.decide_account_swap`, không duyệt chiến dịch của chính mình). Khi duyệt, trong một transaction: binding cũ kết thúc (`released_at`) và binding mới bắt đầu ở cùng một thời điểm, tài khoản cũ bị khóa nếu còn `verified`, và `audit_log` ghi lại. Giao dịch gắn theo thời điểm ngân hàng hạch toán: giao dịch của tài khoản cũ hạch toán trước lúc đổi, dù được ghi nhận sau (sao kê nhập muộn), vẫn thuộc chiến dịch qua binding đã kết thúc; tiền vào tài khoản cũ hạch toán từ lúc đổi trở đi thì không. Tiền ra khỏi tài khoản cũ sau lúc đổi (ngân hàng trả số dư, hoặc người tổ chức chuyển sang tài khoản mới) vẫn là khoản chi của chiến dịch, cần giải trình, cho tới khi tài khoản được gắn lại. Chỉ binding kết thúc do đổi tài khoản mới được tra theo cách này; binding nhả theo cách thường không đổi. Lịch sử tiền không bao giờ được nhả: tài khoản cũ chỉ gắn được cho chiến dịch khác khi chiến dịch cũ đã đủ điều kiện nhả như trên (`GIVE_ACCOUNT_HISTORY_OPEN`). View `give.public_account_changes` công khai ngày đổi, ngân hàng và số tài khoản đã che của hai tài khoản.

Cách xác minh quyền sở hữu tài khoản trong MVP:

1. Tên chủ tài khoản phải khớp `organizers.legal_name`.
2. Người tổ chức chuyển một khoản thử từ chính tài khoản đó, với mã xác minh do Give sinh ra.
3. Admin duyệt.

Khi có API ngân hàng thì bước này tự động.

### 2.3 Đóng góp (donation và pledge)

```sql
give.contributions (
  id uuid PK,
  campaign_id uuid,
  kind text CHECK IN ('donation','pledge'),
  contributor_user_id uuid NULL,          -- khách vãng lai chỉ được donate cho give
  guest_name text, guest_email text,      -- riêng tư, không bao giờ lộ ra view công khai
  is_anonymous bool DEFAULT false,
  public_name text,                       -- tên muốn hiển thị
  message text (≤500),
  asset text DEFAULT 'VND',
  intended_amount bigint CHECK (> 0),
  received_amount bigint DEFAULT 0,       -- do hàm đối soát cập nhật, KHÔNG sửa tay
  reward_tier_id uuid NULL,
  shipping_address jsonb NULL,
  reference_code text UNIQUE NOT NULL,    -- mã ủng hộ, ví dụ "GV7K2M9Q"
  status_token_hash bytea NULL,           -- sha256 của token xem trạng thái cho khách vãng lai (mục 4.1)
  status_token_expires_at timestamptz NULL,
  status text CHECK IN (
    -- donation
    'awaiting_transfer','received','expired',
    -- pledge
    'pledged','cancelled','payment_due','partially_paid','paid','lapsed',
    'refund_due','refunded'),
  payment_due_at timestamptz NULL,
  refund_due_at timestamptz NULL,
  fulfillment_status text NULL CHECK IN ('pending','in_progress','delivered','issue'),
  CHECK (kind='donation' OR contributor_user_id IS NOT NULL),  -- pledge bắt buộc đăng nhập
  CHECK (reward_tier_id IS NULL OR kind='pledge')
)
-- Trigger BEFORE INSERT/UPDATE give.contributions_enforce_type, bổ sung cho các kiểm tra trong RPC:
--   kind='donation' ⇒ campaign.type='give';  kind='pledge' ⇒ campaign.type='back'
--   reward_tier_id NOT NULL ⇒ tier.campaign_id = contributions.campaign_id
--   campaign_id, kind, reward_tier_id không được đổi sau khi tạo

give.reward_tiers (
  id, campaign_id, title, description,
  min_amount bigint CHECK (> 0),
  quantity_limit int NULL,
  quantity_claimed int DEFAULT 0,
  CHECK (quantity_limit IS NULL OR quantity_claimed <= quantity_limit),
  estimated_delivery date,
  requires_shipping bool DEFAULT false,
  status text CHECK IN ('active','hidden'), sort_order
)
-- quantity_claimed chỉ được đổi bên trong create_pledge, cancel_pledge và lapse_overdue_pledges,
-- theo thứ tự khóa cố định: dòng campaign trước, rồi dòng tier (SELECT ... FOR UPDATE).
```

`expired` của donation chỉ có nghĩa là mã QR hết hạn hiển thị (24 giờ). Nếu tiền vẫn về sau đó, hàm đối soát vẫn khớp và chuyển sang `received`.

### 2.4 Giao dịch, đối soát và sổ cái

```sql
give.inbound_events (                    -- toàn bộ webhook và lô import nhận được
  id, channel, dedupe_key text, received_at, signature_valid bool,
  payload jsonb, processed_at, error text,
  attempts int, last_attempt_at, parked_at, -- tối đa 10 lần thử, rồi "đỗ" chờ tài chính/admin xử lý lại
  UNIQUE (channel, dedupe_key)
)

give.bank_transactions (                 -- bản sao sao kê, cho cả crypto (direction = in/out)
  id uuid PK,
  receiving_account_id uuid,
  campaign_id uuid NULL,                 -- theo account_bindings tại lúc ghi nhận; trigger cấm đổi.
                                         -- NULL = tài khoản không có binding hiệu lực, hoặc chủ tài khoản
                                         -- không phải người tổ chức của chiến dịch được gắn → hàng chờ admin
  provider_tx_id text NOT NULL,          -- id do ngân hàng/kênh cấp (số bút toán, FT, tx hash); xem mục 5.2
  direction text CHECK IN ('in','out'),
  asset text, amount bigint CHECK (> 0),
  vnd_equivalent bigint NULL,            -- crypto: quy đổi theo tỷ giá lúc ghi nhận
  fx_rate_snapshot jsonb NULL,
  booked_at timestamptz,
  description text,                      -- nội dung chuyển khoản
  counterparty_name text, counterparty_account_masked text,
  balance_after bigint NULL,
  source text CHECK IN ('webhook','api_poll','statement_import','chain_indexer','manual'),
  inbound_event_id uuid NULL,
  raw jsonb,
  UNIQUE (receiving_account_id, provider_tx_id)
)

give.transaction_matches (
  bank_transaction_id uuid PK,           -- mỗi giao dịch khớp tối đa 1 contribution
  contribution_id uuid,
  matched_by text CHECK IN ('auto_reference','manual'),
  matched_actor uuid NULL, matched_at
)

give.disbursements (                     -- giải trình cho các khoản CHI (direction='out')
  bank_transaction_id uuid PK,
  purpose text, category text, recipient text,
  is_refund bool DEFAULT false, refund_contribution_id uuid NULL,
  explained_by uuid, explained_at
)
give.disbursement_evidence (id, bank_transaction_id, storage_path, kind ('invoice','receipt','photo'))

give.ledger_entries (                    -- chỉ ghi thêm; trigger chặn UPDATE/DELETE
  id bigserial PK,
  campaign_id uuid,
  bucket text CHECK IN ('pledged','received','disbursed','refunded','unmatched_in','other_in'),
  entry_kind text CHECK IN ('post','reversal'),
  amount bigint,                          -- có dấu: bỏ cam kết thì ghi số âm vào 'pledged'
  reverses_entry_id bigint NULL UNIQUE,   -- reversal trỏ tới đúng 1 dòng post; mỗi dòng chỉ bị đảo 1 lần
  CHECK ((entry_kind='reversal') = (reverses_entry_id IS NOT NULL)),
  asset text, vnd_equivalent bigint,
  contribution_id uuid NULL, bank_transaction_id uuid NULL,
  reason text, actor_id uuid NULL, created_at
)
-- Một giao dịch chỉ được "post" một lần vào mỗi bucket:
CREATE UNIQUE INDEX ... ON give.ledger_entries(bank_transaction_id, bucket)
  WHERE entry_kind='post' AND bank_transaction_id IS NOT NULL;
```

**Phân loại lại (reclassification)** không bao giờ sửa dòng cũ. Nó ghi một cặp dòng trong cùng transaction: một `reversal` đảo dòng `post` cũ (số tiền ngược dấu, trỏ `reverses_entry_id`), và một `post` vào bucket mới. Có bốn trường hợp:

| Từ             | Sang                             | Khi nào                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unmatched_in` | `received`                       | Người tổ chức hoặc admin khớp tay một giao dịch không có mã với một contribution                                                                                                                                                                                                                                                                                                              |
| `disbursed`    | `refunded`                       | Khoản chi được giải trình là hoàn tiền cho một contribution (`record_disbursement(is_refund)`)                                                                                                                                                                                                                                                                                                |
| `unmatched_in` | `other_in`                       | Nhân viên tài chính hoặc quản trị viên giải trình một khoản vào không phải tiền ủng hộ (người tổ chức nạp thêm, ngân hàng hoàn phí hoặc điều chỉnh, lãi), kèm lý do và bằng chứng, ghi `audit_log` (`give.explain_inbound_transaction`, DOS/Give#49)                                                                                                                                          |
| `unmatched_in` | `disbursed` hoặc `refunded` (âm) | Nhân viên tài chính hoặc quản trị viên ghi nhận một khoản vào là tiền của khoản chi hoặc khoản hoàn tiền bị ngân hàng trả lại: đảo dòng `unmatched_in` và ghi một `post` âm vào bucket của khoản ra gốc, trên giao dịch vào (`give.link_returned_transfer`, DOS/Give#72): bằng số tiền về cho khoản chi; bằng cả khoản gốc cho khoản hoàn tiền, kèm `post` phí vào `disbursed` (DOS/Give#195) |

Vì index unique chỉ áp lên dòng `post`, và `reverses_entry_id` là UNIQUE, mỗi giao dịch đổi bucket được đúng một lần. Nếu admin cần sửa một lần khớp sai, việc đó đi qua hàm riêng `give.admin_correct_match()`, có lý do bắt buộc và ghi `audit_log`; hàm này nằm ngoài MVP. Sửa một lần giải trình nhầm cũng vậy (DOS/Give#71). Tiền chuyển đi bị ngân hàng trả lại (khoản chi hoặc hoàn tiền không thành công) không được giải trình thành `other_in`, vì khoản ra vẫn đang được tính là đã chi hoặc đã hoàn. Nhân viên tài chính hoặc quản trị viên ghi nhận nó ở `/admin/unmatched` bằng `give.link_returned_transfer` (DOS/Give#72, DOS/DOS.Me#1680): khoản vào được liên kết với khoản ra gốc đã giải trình (cùng chiến dịch, tài khoản nhận và loại tiền, số tiền không lớn hơn khoản gốc, không trước ngày của khoản gốc), kèm lý do và bằng chứng, ghi `give.returned_transfers` và `audit_log`. Khoản vào không còn chặn việc nhả tài khoản; sao kê công khai hiện hai dòng là một khoản chuyển bị trả lại (`return_of`, `returned_by`, `returned_at` của `give.public_statement`), không kèm lý do, bằng chứng hay dữ liệu cá nhân. Khoản hoàn tiền bị trả lại đưa cam kết đã `refunded` về `refund_due`, báo người ủng hộ và người tạo dự án (`reason: refund_returned`). Với khoản hoàn tiền (DOS/Give#195, DOS/DOS.Me#1683), `post` âm bằng cả khoản hoàn gốc vào `refunded`, và phí ngân hàng giữ (gốc trừ tiền về) ghi một `post` dương vào `disbursed` trên giao dịch vào: người tạo dự án chịu phí và phải hoàn lại đủ; thông báo kèm `bank_fee`, và `give.public_statement` có `return_bank_fee` trên cả hai dòng của cặp (chỉ tính một lần mỗi cặp).

**Chủ tài khoản phải là người tổ chức (DOS/Give#119, DOS/DOS.Me#1662).** `give.record_bank_transaction` chỉ gắn giao dịch (vào hay ra) vào chiến dịch của binding khi `receiving_accounts.owner_user_id` là `campaigns.organizer_id` của chiến dịch đó, giống quy tắc của `campaign_has_usable_account`, `create_donation` và `payment_account`. Nếu khác, giao dịch được ghi không thuộc chiến dịch nào (`campaign_id` và `binding_id` NULL, không ghi sổ cái, không khớp) và `audit_log` ghi `bank_transaction.account_owner_mismatch` kèm chiến dịch và binding bị từ chối. `give.match_transaction` từ chối khớp mới khi chủ tài khoản không phải người tổ chức của chiến dịch của giao dịch, báo `GIVE_ACCOUNT_OWNER_MISMATCH`; trường hợp này chỉ xảy ra với giao dịch đã gắn vào chiến dịch trước khi hai bên khác nhau, sau một lần sửa dữ liệu trực tiếp (binding chèn tay, hoặc chiến dịch chuyển sang người tổ chức khác). Giao dịch đó vẫn ở `unmatched_in`, vẫn tính vào tổng chưa khớp và vẫn chặn việc nhả tài khoản. `explain_inbound_transaction` và `record_disbursement` chưa kiểm tra quy tắc này (DOS/Give#137); nhân viên tài chính chưa đọc được lý do trong `audit_log`, vốn chỉ quản trị viên đọc được (DOS/Give#138). Ứng dụng báo lỗi này bằng lời cho người tổ chức và cho nhân viên (DOS/Give#136); ở hàng chờ khớp, giao dịch như vậy hiện thông báo đó thay cho form khớp, và trang `/admin/unmatched` liệt kê (chỉ để xem) tiền vào không thuộc chiến dịch nào, chưa kèm lý do (DOS/Give#148).

Bốn con số mà handoff yêu cầu, áp dụng cho mô hình không giữ tiền:

| Con số              | Tính từ                                                                                 | Ghi chú                                                                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cam kết             | `SUM(pledged)`                                                                          | Chỉ có ở back                                                                                                                                                           |
| Đã thanh toán       | `SUM(received)` + `SUM(unmatched_in)` + `SUM(other_in)` (đã tính cả các dòng reversal)  | Tiền đã vào tài khoản nhận. Khớp tay hay giải trình sau này chỉ chuyển tiền giữa các bucket, tổng không đổi. Số "đã gây quỹ" của chiến dịch give không tính `other_in`. |
| Được phép giải ngân | give: bằng "đã thanh toán". back: bằng "đã thanh toán", vì chỉ thu sau khi đạt mục tiêu | Tiền đã nằm trong tài khoản của người tổ chức, Give không chặn được. Con số này để công khai, không phải để kiểm soát.                                                  |
| Đã chi / đã hoàn    | `SUM(disbursed)`, `SUM(refunded)`                                                       | Kèm phần chưa giải trình: các khoản chi chưa có dòng trong `disbursements`                                                                                              |

View công khai (client chỉ được đọc các view này):

- `give.public_campaigns`: campaign ở trạng thái `live` trở về sau, kèm các tổng ở trên.
- `give.public_contributions`: tên đã che theo `is_anonymous`, không có email.
- `give.public_statement`: giao dịch vào và ra. Tiền vào khớp với một contribution hiện tên hiển thị người góp đã chọn (`donor_name`) hoặc "Ẩn danh" (`donor_anonymous`), không bao giờ hiện tên chủ tài khoản ngân hàng hay số tài khoản của người góp; tiền vào chưa khớp không có tên. Tiền ra đã giải trình (không phải hoàn tiền) hiện số tài khoản người nhận đã che (DOS/Give#58).
- `give.public_disbursement_evidence`: ảnh chứng từ khoản chi của campaign công khai, trừ ảnh nhân viên đã ẩn. Người tổ chức che thông tin cá nhân của người nhận trước khi tải lên; người dùng đã đăng nhập báo cáo được ảnh lộ thông tin (`give.report_evidence`), kiểm duyệt viên/quản trị viên ẩn hoặc hiện lại ảnh (`give.moderate_evidence`, ghi `audit_log`) (DOS/Give#58).

> ⚠️ **Lưu ý UX khi ẩn danh:** nếu tài khoản nhận là tài khoản minh bạch của ngân hàng, trang sao kê của **ngân hàng** vẫn hiện tên người chuyển. Give chỉ ẩn được trên Give. Phải báo rõ điều này cho người góp ngay tại bước chọn ẩn danh.

### 2.5 Kiểm duyệt và vận hành

```sql
give.reports (id, campaign_id, reporter_id NULL, reason, details, status ('open','reviewing','actioned','dismissed'), handled_by)
give.audit_log (id, actor_id, action, entity, entity_id, before jsonb, after jsonb, at)   -- chỉ ghi thêm
give.outbox (id, kind, payload, status, attempts, next_attempt_at)   -- email/thông báo, job gửi lại khi lỗi
give.admins (user_id PK, role ('moderator','finance','admin'))       -- hoặc dùng role chung của DOS nếu đã có
```

### 2.6 RLS

- **Bật RLS trên mọi bảng.** Role `anon` và `authenticated` mặc định không có quyền gì.
- **Quyền đọc:**
  - Ai cũng đọc được các view công khai.
  - Người tổ chức đọc được campaign, contribution (kể cả email để giao quà), giao dịch và giải trình của **campaign mình**.
  - Người góp đọc được contribution của chính mình.
- **Quyền ghi:**
  - Client chỉ được ghi nội dung của mình khi campaign còn `draft` hoặc `changes_requested`. Đó là các bảng `campaigns`, `campaign_media`, `campaign_updates` và `reward_tiers` (khi chưa có pledge).
  - Mọi bảng tiền và trạng thái chỉ được ghi qua hàm `SECURITY DEFINER`. Hàm cấp `EXECUTE` cho `service_role`, không cấp cho `authenticated`.
- **Kiểm thử:** pgTAP trong `DOS.Me/supabase/tests/database/give_*.test.sql`, theo mẫu `channel_identity_*.test.sql`.

## 3. Hàm Postgres cho nghiệp vụ tiền

| Hàm                                                            | Việc chính                                                                                                                                                                                                                                                                                                              | Chống lỗi                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `give.transition_campaign(campaign, to, actor, reason)`        | Đổi trạng thái theo bảng chuyển hợp lệ, ghi `campaign_status_events` và `audit_log`                                                                                                                                                                                                                                     | `FOR NO KEY UPDATE` dòng campaign; chuyển không hợp lệ thì `RAISE`                                                                                                                                                                                                   |
| `give.create_donation(campaign, amount, contributor/guest, …)` | Tạo contribution `awaiting_transfer`, sinh `reference_code`; với khách vãng lai sinh thêm token xem trạng thái và trả về đúng một lần                                                                                                                                                                                   | Campaign phải `type='give'` và `live`; sinh lại mã nếu trùng; giới hạn tần suất mỗi 10 phút (khách theo HMAC địa chỉ IP: 20/chiến dịch, 40/tất cả, thêm 400/tất cả cho mỗi mạng IPv6 /48; đã đăng nhập theo tài khoản: 30 và 100), quá thì `GIVE_RATE_LIMITED` (#47) |
| `give.create_pledge(campaign, tier, amount, user, address)`    | Khóa campaign rồi khóa tier, kiểm tra còn suất, tăng `quantity_claimed`, ghi ledger `pledged +amount`                                                                                                                                                                                                                   | `FOR UPDATE` campaign **rồi** tier; kiểm tra lại dưới khóa: `type='back'`, `status='live'`, `now() < ends_at`, tier thuộc đúng campaign, `amount ≥ min_amount`                                                                                                       |
| `give.cancel_pledge(contribution, user)`                       | Hoàn suất, ghi ledger `pledged −amount`                                                                                                                                                                                                                                                                                 | `FOR UPDATE` campaign rồi tier; kiểm tra lại dưới khóa `status='live'` **và** `now() < ends_at`. Nếu cron chưa kịp finalize thì vẫn từ chối sau `ends_at`.                                                                                                           |
| `give.record_bank_transaction(normalized_tx)`                  | Upsert `bank_transactions` (gắn `campaign_id` theo binding, chỉ khi chủ tài khoản là người tổ chức của chiến dịch; nếu không thì để NULL và ghi `audit_log` `bank_transaction.account_owner_mismatch`, mục 2.4), rồi rẽ nhánh theo chiều: `in` → `match_transaction`; `out` → ledger `disbursed` (post), chờ giải trình | `ON CONFLICT (receiving_account_id, provider_tx_id) DO NOTHING`; gọi lại nhiều lần vẫn an toàn                                                                                                                                                                       |
| `give.match_transaction(tx, contribution?, actor?)`            | Chỉ cho giao dịch `in`. Tìm mã ủng hộ trong `description`, kiểm tra mã thuộc **đúng `campaign_id` của giao dịch**, ghi `transaction_matches` và ledger `received`, cập nhật `received_amount` và `status`. Khớp tay một giao dịch đang `unmatched_in` thì ghi cặp reversal + post (mục 2.4).                            | `RAISE` nếu `direction='out'`; `UNIQUE (bank_transaction_id)`; không có mã thì ghi `unmatched_in`; chủ tài khoản không phải người tổ chức của chiến dịch thì `GIVE_ACCOUNT_OWNER_MISMATCH` (DOS/Give#119)                                                            |
| `give.finalize_campaign(campaign)`                             | back: tổng `pledged` ≥ mục tiêu thì `succeeded` và mọi pledge sang `payment_due`, có `payment_due_at`. Ngược lại thì `failed`, pledge sang `cancelled` và hoàn suất. give: `closed`.                                                                                                                                    | `FOR UPDATE` campaign (cùng khóa với các hàm pledge); chỉ chạy khi `now() ≥ ends_at` và đang `live`/`settling`; gọi lần hai không làm gì                                                                                                                             |
| `give.lapse_overdue_pledges()`                                 | Pledge quá hạn: chưa trả đồng nào → `lapsed`; đã trả một phần → `refund_due` (người tạo phải hoàn lại `received_amount` trong 14 ngày). Cả hai đều nhả suất và ghi ledger `pledged −(intended_amount)`.                                                                                                                 | Khóa campaign rồi tier theo lô                                                                                                                                                                                                                                       |
| `give.record_disbursement(tx, purpose, …)`                     | Giải trình một khoản chi. Nếu là hoàn tiền cho một contribution: ghi reversal `disbursed` + post `refunded`, và khi tổng hoàn ≥ `received_amount` thì contribution `refund_due` → `refunded`                                                                                                                            | Chỉ người tổ chức của campaign, hoặc finance; chỉ cho giao dịch `out` cùng `campaign_id`                                                                                                                                                                             |

Quy tắc khớp mã ủng hộ:

- **Chuẩn hóa nội dung chuyển khoản:** bỏ dấu, viết in hoa, bỏ ký tự không phải chữ hoặc số. Mã có dạng `GV` + 6 ký tự base32 không gây nhầm lẫn (bỏ `0`, `O`, `1`, `I`, `L`). Có thể thêm một ký tự kiểm tra.
- **Tiền về khác số dự định:**
  - Thiếu: donation vẫn là `received` (người góp được quyền góp ít hơn); pledge sang `partially_paid`.
  - Thừa: ghi nhận toàn bộ. Phần thừa của pledge do người tổ chức tự hoàn, rồi ghi lại qua `record_disbursement(is_refund)`.
- **Tiền về khi campaign đã `closed`:** vẫn ghi nhận vì là sự thật của sao kê, gắn cờ `after_close`, và báo người tổ chức cùng admin. Liên quan G1: theo Nghị định 93, sau khi hết hạn thì không được nhận thêm.

## 4. Luồng tiền

### 4.1 Give – từ thiện (flexible)

```
Người tổ chức                     Give                               Ngân hàng / kênh
1. Định danh (organizers)  ─►  verification_status
2. Mở tài khoản minh bạch  ───────────────────────────────────────►  (tại ngân hàng)
3. Khai báo tài khoản nhận ─►  receiving_accounts (pending)
   Chuyển khoản xác minh   ───────────────────────────────────────►  tiền vào kèm mã xác minh
                               admin/tự động → verified
4. Tạo nháp → gửi duyệt    ─►  transition: draft → in_review → approved → live (theo starts_at)
Người góp (không cần đăng nhập)
5. Nhập số tiền, tên/ẩn danh ─► create_donation → mã GVxxxxxx
6. Nhận VietQR (BIN, STK, số tiền, nội dung = mã) + nút mở app ngân hàng
7. Chuyển khoản             ───────────────────────────────────────►  tài khoản campaign
8.                              ◄── webhook / poll / import sao kê / indexer
                               record_bank_transaction → match → ledger 'received'
9. Trang chờ hiện "Đã nhận" khi contribution chuyển sang received:
   - Đã đăng nhập: Supabase Realtime trên contribution của mình (RLS cho phép).
   - Khách vãng lai: create_donation trả về token ngẫu nhiên 32 byte (DB chỉ giữ sha256,
     hết hạn sau 7 ngày). Trang gọi GET /api/contributions/status với token đó mỗi 5 giây,
     tối đa 30 phút. Route chạy phía server, chỉ trả status và received_amount.
     Không mở RLS cho anon.
10. Người tổ chức chi tiền   ───────────────────────────────────────►  giao dịch 'out'
                               ledger 'disbursed' → yêu cầu giải trình trong 7 ngày
                               (công khai số "chưa giải trình")
11. ends_at                 ─► finalize_campaign → closed; tiền về sau đó bị gắn cờ
12. Báo cáo tổng kết (cập nhật cuối + sao kê)
```

### 4.2 Back – dự án có reward (all-or-nothing, phương án A)

```
1. Người tạo đã định danh, tạo campaign với tier, mục tiêu, ends_at (≤ 60 ngày), tài khoản nhận → duyệt → live
2. Người ủng hộ (bắt buộc đăng nhập) chọn tier, có thể ủng hộ không lấy quà
   → create_pledge (giữ suất) → status 'pledged'. Chưa có đồng nào được chuyển.
   Được đổi hoặc hủy cho tới ends_at.
3. ends_at → cron gọi finalize_campaign
   a. Tổng cam kết ≥ mục tiêu → 'succeeded'; pledge → 'payment_due', hạn = ends_at + payment_window_days
      → gửi email kèm VietQR hoặc link PayOS tới TÀI KHOẢN CỦA NGƯỜI TẠO, nội dung = mã ủng hộ
   b. Không đạt → 'failed'; pledge → 'cancelled'; báo tin. Không có tiền nào phải hoàn.
4. Tiền về → record_bank_transaction → match → 'paid' (hoặc 'partially_paid')
5. Nhắc thanh toán vào ngày 1, 3 và 6; quá hạn → lapse_overdue_pledges, nhả suất:
   - chưa trả gì → 'lapsed'
   - đã trả một phần → 'refund_due': người tạo phải hoàn received_amount trong 14 ngày.
     Trang campaign công khai số "hoàn tiền còn nợ" cho tới khi hoàn xong ('refunded').
     Người ủng hộ không mất tiền mà không có quà.
6. Công khai song song: "Cam kết X / Đã thanh toán Y / Mục tiêu Z"
7. Giao quà: người tạo cập nhật fulfillment_status; người ủng hộ thấy trong "Ủng hộ của tôi"
8. Hoàn tiền (khi người tạo không thực hiện được): người tạo tự chuyển trả →
   giao dịch 'out' → record_disbursement(is_refund, contribution) → ledger 'refunded'
```

Chính sách còn mở (P1): nếu sau hạn thanh toán, số **đã thanh toán** thấp hơn mục tiêu thì sao? Mặc định đề xuất: người tạo vẫn phải thực hiện dự án với số đã nhận, và điều này được ghi rõ trong điều khoản khi tạo campaign. Phương án khác: cho người tạo chọn hủy trong vòng 7 ngày và tự hoàn hết.

### 4.3 Ủng hộ hằng tháng (DOS/Give#255)

> Trạng thái: **JOY đã chọn mô hình** (2026-11-19, D9): làm phương án A trước. Bước 2 là A+ (mục 4.3.5) hoặc C (mục 4.3.6): JOY chọn kiểm tra cổng của cả hai **song song**, phương án nào qua hết cổng của nó trước thì làm trước (mục 4.3.3). Chỉ áp dụng cho chiến dịch `give`. Mục này chưa sửa mục 2–3. Khi làm, các phần sau sẽ đổi: thêm bảng `give.donation_plans` (và `give.plan_stop_tokens`); thêm cột cho `give.contributions` (mục 2.3) và `give.campaigns` (mục 2.1); với donation của kế hoạch, thay quy tắc `expired` 24 giờ bằng cách tính lúc hiển thị xem QR có hiện hay không (mục 2.3); mở rộng trigger `contributions_enforce_type` và `give.transition_campaign`, và với A+ thì cả `give.match_transaction` (kể cả khớp tay), `give.record_bank_transaction` và `give.explain_inbound_transaction` (mục 2.4, 3), cột `bank_transactions.misdirected_plan_id` và `misdirected_notified_at`, giá trị `disbursements.purpose = 'misdirected_return'`, hai hàm mới `give.link_misdirected_return` và `give.override_standing_order_hold`, một view cho người tổ chức, một dòng mới trong bảng phân loại lại và cách hiện trên `public_statement` (mục 2.4), và `give.release_account_binding`, `give.request_account_swap`, `give.decide_account_swap` (mục 2.2); thêm job vào mục 5.3 và test vào mục 8.

**Bối cảnh.** GoFundMe cho người góp chọn "monthly" lúc thanh toán (tính năng bật sẵn cho chiến dịch, người tổ chức tắt được), tự trừ tiền mỗi tháng, gửi biên nhận mỗi lần, cho hủy bất cứ lúc nào, và tự hủy khi chiến dịch đóng ([GoFundMe Help: recurring monthly donations][gfm-recurring]; _đọc qua kết quả tìm kiếm, trang trả lỗi 403 cho công cụ đọc_). Give không làm được y như vậy: không có kênh thẻ, không giữ tiền (D3), và tiền đi thẳng vào tài khoản của người tổ chức qua VietQR. Câu hỏi là có cách nào để "góp mỗi tháng" mà vẫn giữ D3.

#### 4.3.1 Các phương án

| #   | Phương án                                                                                                                                                                                                                                                          | Tiền có đi qua bên thứ ba?                                                                                             | Give dừng được khi chiến dịch đóng?                                                                                | Hợp với sổ cái, import sao kê, Tingee                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | **Cam kết hằng tháng có nhắc.** Người góp đăng ký số tiền mỗi tháng. Mỗi tháng Give tạo một donation mới, có mã ủng hộ và VietQR riêng, rồi nhắc người góp. Người góp tự bấm chuyển. Tháng nào không chuyển thì thôi, không có gì bị trừ tự động và không có "nợ". | Không                                                                                                                  | Phần lớn: ngừng tạo donation, ngừng nhắc, ẩn QR. Không chặn được giao dịch cũ hay mẫu chuyển tiền người góp đã lưu | Hợp hoàn toàn: mỗi tháng là một `contributions` bình thường, khớp theo mã như mục 3. Không đổi pipeline (mục 5.1), parser sao kê hay kênh Tingee.                                                                                                                         |
| A+  | **A, thêm mã cố định cho lệnh chuyển tiền định kỳ của chính người góp.** Người góp tự đặt lệnh "chuyển tiền định kỳ" trong app ngân hàng của mình, với một mã kế hoạch cố định thay cho mã từng tháng.                                                             | Không                                                                                                                  | **Không**: lệnh nằm ở ngân hàng của người góp, chỉ người góp hủy được                                              | Cần thêm luật khớp (mã kế hoạch → donation của kỳ, mục 4.3.5). Tiền tiếp tục về sau khi chiến dịch đóng, thành `after_close`, hoặc `unmatched_in` nếu tài khoản đã đổi hay đã gắn cho chiến dịch khác. Chưa xác minh ngân hàng nào giữ nội dung tùy ý trong lệnh định kỳ. |
| B1  | **Trích nợ tự động qua Tingee (Direct Debit).** Người góp liên kết tài khoản một lần; mỗi tháng Give gọi API trích nợ.                                                                                                                                             | Có thể có: cổng trích nợ là của OnePay, và merchant được cấu hình là Give (_suy luận_, tài liệu không nói tiền về đâu) | Có                                                                                                                 | Không hợp: tài liệu không cho thấy tiền vào thẳng tài khoản của người tổ chức, nên không có biến động số dư hay dòng sao kê chắc chắn để khớp (_suy luận_).                                                                                                               |
| B2  | **Ủy nhiệm thu / trích nợ do ngân hàng của người tổ chức thực hiện.**                                                                                                                                                                                              | Không, nhưng cần thỏa thuận giữa người góp và người tổ chức, cộng ủy quyền của người góp tại ngân hàng của chính họ    | Có, qua ngân hàng                                                                                                  | Về kỹ thuật thì hợp (tiền vào tài khoản nhận như một giao dịch thường), nhưng không tìm thấy kênh nào cho bên thứ ba như Give khởi tạo.                                                                                                                                   |
| C   | **Thu định kỳ qua cổng thanh toán được cấp phép** (thẻ hoặc ví). Người góp lưu thẻ hoặc liên kết ví một lần; mỗi tháng Give gửi lệnh thu qua cổng; cổng chuyển tiền thẳng vào tài khoản của người tổ chức (mục 4.3.6).                                             | Có: cổng có giấy phép trung gian thanh toán, nhưng không giữ hộ Give nếu quyết toán thẳng cho người tổ chức            | Có: Give không gửi lệnh thu nữa                                                                                    | Cần kênh mới (`gateway`), khớp theo mã giao dịch của cổng, sổ cái thêm phí, hoàn tiền, chargeback. Chưa cổng nào công bố quyết toán thẳng cho từng người tổ chức là cá nhân.                                                                                              |

**Kết quả tra cứu về (b) trích nợ tự động và lệnh định kỳ** (tra cứu trên web ngày 2026-11-19; các trang Tingee Direct Debit được đọc trực tiếp, các nguồn khác ghi rõ mức độ đã đọc):

- **Tingee Direct Debit** có thật, nhưng không hợp với Give. Đối tác gọi `POST /v1/direct-debit/payment-bill` cho từng lần trích (tài liệu không mô tả lịch chạy phía Tingee); `partnerCode` duy nhất được liệt kê là `one-pay`, tức cổng trích nợ của OnePay; hạn mức 2.000.000 đ mỗi hóa đơn và 5.000.000 đ mỗi ngày; merchant phải được Tingee cấu hình Direct Debit ([Tingee: Trích nợ tự động][tg-dd], [payment-bill][tg-dd-bill], [webhook][tg-dd-wh]). Quyền Direct Debit của credential bắt buộc whitelist IP (`docs/research/tingee.md` mục 6.1). Không endpoint nào nhận `merchantId`, nên _có vẻ_ Master Merchant không trích thay cho từng người tổ chức được (_suy luận_ từ việc thiếu tham số). Tài liệu không nói tiền trích được chuyển vào tài khoản nào, và không nói lần trích có sinh biến động số dư trên tài khoản nhận hay không (_không có trong tài liệu_). Nghiên cứu Tingee trước đó đã để Direct Debit ngoài phạm vi (`docs/research/tingee.md` mục 3).
- **NAPAS:** không tìm thấy dịch vụ trích nợ định kỳ tài khoản cho bên thứ ba. Các dịch vụ công khai là chuyển mạch, VietQR, cổng thanh toán thẻ nội địa và Tap and Pay ([NAPAS: Payment Gateway][napas-pg]). Đây là _không tìm thấy_, không phải _không tồn tại_.
- **Ủy nhiệm thu** theo Thông tư 15/2024/TT-NHNN: ngân hàng trích tiền từ tài khoản bên trả tiền theo đề nghị của bên thụ hưởng. Cần hai thứ: văn bản thỏa thuận giữa bên trả tiền và bên thụ hưởng, **và** việc bên trả tiền đăng ký, ủy quyền cho chính ngân hàng của mình trích tài khoản (Art. 3 và 9) ([LuatVietnam: ủy nhiệm thu theo TT 15/2024][lvn-unt], [Thư viện pháp luật: TT 15/2024, bản tiếng Anh][tvpl-tt15]; _đọc qua bài phân tích và bản dịch, chưa đọc văn bản hợp nhất_). Bên thụ hưởng ở đây là người tổ chức (thường là cá nhân), không phải Give. Mỗi người góp phải ký thỏa thuận với từng người tổ chức và tự ủy quyền tại ngân hàng của mình, và không tìm thấy ngân hàng nào mở API cho nền tảng thứ ba khởi tạo. Không khả thi cho Give.
- **Lệnh chuyển tiền định kỳ do người góp tự đặt:** Vietcombank đã bổ sung chuyển tiền định kỳ ra ngoài Vietcombank trên VCB Digibank ([VNBA: VCB Digibank cập nhật tính năng][vnba-vcb]; _đọc qua kết quả tìm kiếm_). Tần suất, nội dung chuyển khoản do người dùng nhập và cách hủy lệnh (hủy trước 7:30 sáng ngày chạy) chỉ có trong một hướng dẫn của Finhay ([Finhay: hướng dẫn chuyển tiền định kỳ VCB][finhay-vcb]; _chỉ đọc qua kết quả tìm kiếm, trang trả lỗi 503; chưa xác minh_). Lần tìm thêm ngày 2026-11-19 cho Techcombank, MB, BIDV, VietinBank và ACB không ra trang hướng dẫn chính thức nào nói lệnh định kỳ giữ nguyên nội dung người góp nhập ở mọi lần chạy (_không tìm thấy_). Đây là điều A+ cần, và là cổng (a) ở mục 4.3.5.
- **Ví điện tử** (MoMo "Liên kết thanh toán") cho nhà cung cấp trừ tiền ví sau một lần liên kết ([MoMo: Dịch vụ liên kết][momo-link]), nhưng nếu tiền vào ví hay số dư của merchant rồi mới chi ra thì là qua trung gian (_suy luận_): trái D3. Trường hợp cổng hay ví quyết toán thẳng vào tài khoản của người tổ chức được xét riêng ở phương án C (mục 4.3.6).

Kết luận cho (b): **không tìm thấy đường trích nợ tự động nào mà tiền đi thẳng vào tài khoản của người tổ chức và Give khởi tạo được.** Các đường "tự trừ" tìm được đều hoặc đi qua một trung gian (B1, ví khi tiền vào số dư của merchant), hoặc cần thỏa thuận và ủy quyền ngân hàng giữa từng người góp và từng người tổ chức (B2). Thu qua cổng thanh toán mà cổng quyết toán thẳng cho người tổ chức là phương án C (mục 4.3.6): chưa cổng nào công bố làm được điều đó cho cá nhân.

#### 4.3.2 Pháp lý

Đọc lại theo `docs/research/legal-charity-campaigns.md` (văn bản gốc Nghị định 93/2021, ký hiệu "D93"). Nhóm chiến dịch dùng dưới đây theo đề xuất 1 ở mục 9 của tài liệu đó: thiên tai, dịch bệnh, sự cố (`d93_disaster`), hỗ trợ bệnh nhân bệnh hiểm nghèo (`d93_patient`), và mục đích khác (`other_charity`). Cột `legal_basis` này chưa có trong thiết kế.

| Quy định                                                                                                                                                                                                                                                                                 | Ảnh hưởng tới ủng hộ hằng tháng                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D93 Art. 4.3: vận động là tự nguyện, không được đặt mức tối thiểu để bắt buộc đóng góp (mọi nhóm thuộc D93)                                                                                                                                                                              | Cam kết hằng tháng phải là **ý định**, không phải nghĩa vụ: hủy được bất cứ lúc nào, tháng bỏ lỡ không thành nợ, không có chữ "quá hạn" hay "còn nợ" (khác với pledge của `back`). Phương án A và A+ đáp ứng. C đáp ứng nếu người góp hủy được ngay trên Give và gỡ liên kết ví hay thẻ trong app của cổng. Với B2, khó bảo đảm người góp hủy được bất cứ lúc nào ngay trên Give. Kế hoạch chỉ kiểm tra một mức sàn kỹ thuật cố định của nền tảng (đề xuất 11 của tài liệu nghiên cứu), không phải `campaigns.min_contribution` mà người tổ chức tự đặt được; Art. 4.3 có cấm mức tối thiểu do nền tảng đặt hay không là câu hỏi 7 cho luật sư. |
| D93 Art. 17.2, 9.7: không nhận thêm sau thời hạn nhận đã cam kết, và báo ngân hàng ngừng nhận (chỉ `d93_disaster`; với `d93_patient` Nghị định không có quy định này, mục 1 và 5 của tài liệu nghiên cứu)                                                                                | Với `d93_disaster`, kế hoạch phải kết thúc khi chiến dịch thôi nhận, và không được nhắc hay hiện QR sau `ends_at`. Phương án A làm được với mã và lời nhắc của Give, nhưng không chặn được người góp tự chuyển lại bằng giao dịch cũ hay mẫu đã lưu. Phương án A+ **không** làm được: lệnh định kỳ vẫn chạy ở ngân hàng của người góp, tiền về sau hạn thành `after_close` (mục 3), đúng điều Nghị định cấm. Vì vậy A+ tắt cho nhóm này, trừ khi luật sư trả lời "có" cho P4(c) (mục 4.3.5).                                                                                                                                                    |
| D93 Art. 8.2: thời hạn nhận tối đa 90 ngày cho tổ chức vận động thiên tai, dịch bệnh, sự cố, "trừ trường hợp thực hiện theo cam kết với người đóng góp". Ghi chú (4) của mẫu thông báo cũng ghi 90 ngày nhưng không có ngoại lệ; có ràng buộc cá nhân hay không là câu hỏi 4 cho luật sư | Với `d93_disaster`, nếu giới hạn 90 ngày áp dụng, một kế hoạch hằng tháng có tối đa 5 kỳ theo tháng (thường 4; 5 khi 90 ngày chạm 5 tháng dương lịch, ví dụ 31/1 đến 1/5). `d93_patient` không có giới hạn này. Ủng hộ hằng tháng có ích nhất cho `other_charity` (giáo dục, môi trường, động vật…), nhóm có thể thuộc TT41 (câu hỏi 1 cho luật sư). Kế hoạch hằng tháng có phải là "cam kết với người đóng góp" để kéo dài thời hạn hay không: **câu hỏi cho luật sư** (P4), Give không dựa vào cách hiểu đó.                                                                                                                                  |
| D93 Art. 17.2, 9.7: tài khoản riêng **cho từng cuộc vận động** (`d93_disaster`); TT41 Art. 10.4.a: cá nhân dùng **một tài khoản riêng** cho mục đích từ thiện, không nói từng cuộc                                                                                                       | Kế hoạch gắn với **một** chiến dịch. Không bao giờ tự chuyển sang chiến dịch sau của cùng người tổ chức, kể cả khi họ dùng lại tài khoản (mục 2.2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D93 Art. 14.2, 14.4, 19.3: công khai tổng nhận, tổng chi, người nhận                                                                                                                                                                                                                     | Không đổi: mỗi tháng là một donation thường, được tính và công khai như mọi khoản khác. Số tiền **đã đăng ký** hằng tháng không phải tiền đã nhận, nên không cộng vào "đã gây quỹ".                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Thông tư 15/2024 (ủy nhiệm thu)                                                                                                                                                                                                                                                          | Liên quan tới B2 (ủy nhiệm thu) và C (đơn vị chấp nhận thanh toán, Art. 3.8 và 20.3, mục 4.3.6). Phương án A và A+ là chuyển khoản do người góp tự lệnh, không cần gì thêm.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

**Phạm vi của A.** Kế hoạch hằng tháng chỉ được bật cho chiến dịch có `ends_at` (kiểm tra trong `set_campaign_monthly` và `create_donation_plan`, mục 4.3.4). Với điều kiện đó, A dừng tạo mã, dừng nhắc và ẩn QR theo trạng thái và `ends_at` của chiến dịch, giống nhau cho cả ba nhóm, nên A **không cần** `legal_basis` để Give khỏi tự tạo ra khoản nhận sau hạn. A **không** bảo đảm được không có tiền về sau hạn: người góp vẫn có thể chuyển lại bằng giao dịch cũ hay mẫu đã lưu trong app ngân hàng, như với donation một lần hiện nay. Tiền đó thành `after_close` (mục 3), và thông báo kết thúc kế hoạch nhắc người góp xóa mẫu đã lưu (mục 4.3.4). A+ thì khác hẳn: tiền về sau hạn là điều chắc chắn xảy ra nếu người góp không tự hủy lệnh, nên A+ cần `legal_basis` và hai cổng ở mục 4.3.5.

**Với người tổ chức:** phương án A không thêm nghĩa vụ nào. Mỗi tháng là một khoản chuyển khoản vào đúng tài khoản của chiến dịch, sổ sách theo TT41 và báo cáo theo D93 giữ nguyên. Tính năng **mặc định tắt** (`allow_monthly DEFAULT false`, khác GoFundMe bật sẵn): người tổ chức tự bật cho chiến dịch của mình, vì nó làm tăng số khoản nhỏ cần đối chiếu. Với A+, người tổ chức còn phải xử lý tiền `after_close` từ lệnh định kỳ chưa bị hủy, theo câu trả lời của luật sư (P4).

**Với Give:** phương án A không làm Give chạm vào tiền, nên vị trí "không giữ tiền, không phải trung gian thanh toán" (D3) không đổi. Khác biệt duy nhất là Give **liên lạc định kỳ** với người góp: cần sự đồng ý rõ ràng lúc đăng ký và một liên kết dừng ở mọi lời nhắc, theo Luật Bảo vệ dữ liệu cá nhân (số 91/2025/QH15, hiệu lực từ 2026-01-01 theo hiểu biết hiện có; _chưa đọc văn bản gốc, xác nhận khi làm issue app_). B1 có thể biến Give thành merchant nhận tiền qua trung gian: trái D3 và cần xem lại pháp lý trung gian thanh toán, nên bị loại.

#### 4.3.3 Quyết định và thứ tự làm

**JOY (2026-11-19) chọn A, rồi A+** ("cách 2: nhắc góp hằng tháng (A) cộng lệnh chuyển định kỳ do người góp tự đặt với mã cố định (A+)"). Loại B1 và B2. Người góp phải đăng nhập để đăng ký kế hoạch. Sau khi JOY hỏi thêm, phương án C (mục 4.3.6) được nghiên cứu. Cùng ngày, sau khi xem C, JOY chọn "Cả hai, hỏi song song": **bước 2 thành kiểm tra cổng của A+ và C song song**.

1. **Bước 1: phương án A** (mục 4.3.4). Một issue DB (DOS.Me) và một issue app. Giao diện nói đúng là "nhắc góp hằng tháng", không phải "tự trừ tiền hằng tháng" như GoFundMe.
2. **Bước 2: kiểm tra cổng của A+ và C song song.** Trong lúc làm A, chạy cùng lúc:
   - Cổng của A+ (mục 4.3.5): (a) xác minh ngân hàng bằng phép thử trong `docs/research/recurring-step2-outreach.md` phần B; (b) luật sư trả lời P4 (a)–(e), gồm cả (c').
   - Cổng của C (mục 4.3.6): gửi MoMo, ZaloPay và Bảo Kim thư hỏi trong `docs/research/recurring-step2-outreach.md` phần A, và luật sư trả lời P4 (f)–(j).
   - Phương án nào qua hết cổng của nó trước thì được thiết kế chi tiết và làm trước, thành issue riêng sau A. Phương án kia vẫn tiếp tục kiểm tra; làm cả hai hay dừng phương án thứ hai là quyết định riêng của JOY khi đó. Nếu không phương án nào qua, A vẫn chạy một mình. Câu hỏi cho luật sư của hai phương án gửi trong cùng một lần (P4).

Lý do giữ thứ tự này: A là cách duy nhất vừa giữ D3, vừa dừng phần Give kiểm soát đúng lúc chiến dịch thôi nhận (D93 Art. 17.2 với `d93_disaster`), vừa không đổi sổ cái, pipeline nhận giao dịch, parser sao kê hay kênh Tingee. A+ tiện hơn cho người góp nhưng phụ thuộc vào ngân hàng của người góp và vào câu trả lời của luật sư. C tự động thật nhưng phụ thuộc vào câu trả lời của các cổng và của luật sư, và là phần làm lớn hơn A+ nhiều.

#### 4.3.4 Thiết kế phương án A

Để tách issue, chưa phải DDL:

```sql
give.donation_plans (                      -- "kế hoạch ủng hộ hằng tháng"
  id uuid PK,
  campaign_id uuid,                        -- trigger: campaign.type='give'; không đổi sau khi tạo
  contributor_user_id uuid NULL,           -- bắt buộc đăng nhập khi tạo; NULL chỉ sau khi tài khoản bị xóa
                                           -- FK ON DELETE RESTRICT: xóa tài khoản phải đi qua hook end_plans_for_deleted_user
  amount bigint CHECK (> 0),               -- số tiền dự định mỗi tháng; ≥ mức sàn kỹ thuật của nền tảng
  day_of_month int CHECK (BETWEEN 1 AND 28),
  is_anonymous bool, public_name text, message text,   -- mặc định cho mọi donation sinh ra
  reminder_consent_at timestamptz NOT NULL,
  status text CHECK IN ('active','ended'),
  ended_reason text NULL CHECK IN ('donor_cancelled','campaign_closed','campaign_cancelled',
                                   'organizer_disabled','donor_deleted'),
  CHECK ((status='ended') = (ended_reason IS NOT NULL)),
  CHECK (contributor_user_id IS NOT NULL OR status = 'ended'),
  next_period date NOT NULL,               -- ngày 1 của tháng kế tiếp cần tạo donation (giờ VN); đặt khi tạo
  ended_notice_at timestamptz NULL,        -- đã báo người góp việc kết thúc (một lần)
  created_at, updated_at, ended_at
)
CREATE UNIQUE INDEX ... ON give.donation_plans(campaign_id, contributor_user_id) WHERE status='active';

give.plan_stop_tokens (                    -- liên kết "dừng" trong lời nhắc, không cần đăng nhập
  token_hash bytea PK,                     -- sha256 của token; token ký HMAC bằng secret của server
  plan_id uuid, created_at, expires_at,    -- hết hạn sau 60 ngày
  used_at timestamptz NULL                 -- dùng một lần
)

-- give.contributions thêm:
--   plan_id uuid NULL → give.donation_plans, plan_period date NULL
--   UNIQUE (plan_id, plan_period)          -- mỗi kế hoạch tối đa 1 donation mỗi tháng
--   CHECK ((plan_id IS NULL) = (plan_period IS NULL)); CHECK (plan_id IS NULL OR kind='donation')
--   followup_sent_at timestamptz NULL       -- lời nhắc thứ hai (chỉ tài khoản Tingee đủ điều kiện)
-- Trigger contributions_enforce_type mở rộng: plan.campaign_id = campaign_id; plan.contributor_user_id
--   = contributor_user_id (trừ khi plan.contributor_user_id IS NULL, tức người góp đã xóa tài khoản); plan_id và plan_period không đổi sau khi tạo.
-- give.campaigns thêm: allow_monthly bool DEFAULT false   -- người tổ chức bật
--   CHECK (NOT allow_monthly OR ends_at IS NOT NULL)
```

**Kỳ và ngày tạo.** Mọi ngày tháng của kế hoạch (`next_period`, `plan_period`, "hôm nay") tính theo giờ `Asia/Ho_Chi_Minh`. Một kỳ là một tháng dương lịch; `plan_period` là ngày 1 của tháng đó. Ngày tạo donation của kỳ hiện tại là **ngày 1 của tháng hiện tại + `day_of_month − 1`**. Cron chọn kế hoạch có `next_period ≤` tháng hiện tại và hôm nay ≥ ngày tạo của tháng hiện tại, rồi tạo donation cho **tháng hiện tại**. `next_period` cũ hơn tháng hiện tại (cron ngừng, chiến dịch tạm dừng) thì nhảy thẳng tới tháng hiện tại, không tạo bù kỳ nào. Sau khi tạo, `next_period` là ngày 1 của tháng sau. `create_donation_plan` tạo donation của kỳ hiện tại ngay lúc đăng ký và đặt `next_period` là ngày 1 của tháng sau, nên kỳ thứ hai được tạo vào ngày người góp chọn ở tháng sau.

**Thứ tự khóa.** Mọi hàm đổi kế hoạch khóa dòng chiến dịch trước, rồi mới tới dòng kế hoạch, đúng thứ tự "chiến dịch trước" của mục 2.3 và 3:

- `transition_campaign` và `set_campaign_monthly` khóa chiến dịch `FOR NO KEY UPDATE` (như mục 3), rồi các kế hoạch `active` của nó `FOR UPDATE`.
- `create_donation_plan`, `update_donation_plan`, `cancel_donation_plan`, `cancel_donation_plan_by_token` (và nhánh mã kế hoạch của `match_transaction` ở A+) khóa chiến dịch `FOR SHARE`, rồi kế hoạch `FOR UPDATE`. `FOR SHARE` xung đột với `FOR NO KEY UPDATE`, nên các hàm này không chạy xen vào lúc chiến dịch đổi trạng thái, nhưng chạy song song được với nhau.
- Cron `issue-plan-donations` và job `plan-notices` (thông báo kết thúc, lời nhắc thứ hai) xử lý **một kế hoạch mỗi transaction**: chiến dịch `FOR SHARE`, rồi kế hoạch `FOR UPDATE SKIP LOCKED` (kế hoạch đang bị khóa thì để lần chạy sau).
- `end_plans_for_deleted_user` khóa các chiến dịch liên quan `FOR SHARE` theo thứ tự `campaign_id`, rồi các kế hoạch `FOR UPDATE`.

| Hàm (chỉ `service_role`)                                    | Việc chính                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `give.set_campaign_monthly(campaign, enabled, actor)`       | Người tổ chức (hoặc quản trị viên) bật hoặc tắt `allow_monthly`, kể cả khi chiến dịch đang `live` (client không ghi thẳng được `campaigns` lúc này, mục 2.6). Bật chỉ khi `ends_at IS NOT NULL`. Ghi `audit_log`. Tắt thì kết thúc mọi kế hoạch `active` với lý do `organizer_disabled`; donation đang chờ của kỳ hiện tại giữ nguyên. Mọi đường sửa chiến dịch bỏ `ends_at` bị từ chối khi `allow_monthly` đang bật (cũng có CHECK ở bảng).                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `give.create_donation_plan(campaign, user, amount, day, …)` | Kiểm tra dưới khóa: `type='give'`, `live`, `allow_monthly`, `ends_at IS NOT NULL` và `now() < ends_at`, `amount ≥` mức sàn kỹ thuật của nền tảng (không dùng `campaigns.min_contribution`), người góp chưa có kế hoạch `active` ở chiến dịch này. Tạo kế hoạch với `next_period` là tháng sau, và tạo luôn donation của kỳ hiện tại, **trừ khi** người góp đã có một donation của kế hoạch khác cho kỳ này ở cùng chiến dịch (hủy rồi đăng ký lại trong tháng không sinh donation thứ hai). Tính vào giới hạn tần suất của `create_donation`.                                                                                                                                                                                                                                                                                                                                |
| `give.update_donation_plan(plan, user, amount?, day?)`      | Kiểm tra lại dưới khóa: kế hoạch `active` và thuộc người góp, chiến dịch `live`, `allow_monthly`, `now() < ends_at`, `amount ≥` mức sàn kỹ thuật. Đổi số tiền hoặc ngày; áp dụng từ kỳ sau. Donation đã tạo không đổi.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `give.cancel_donation_plan(plan, user)`                     | Người góp hủy trên `/me/contributions`: `ended`, lý do `donor_cancelled`. Donation `awaiting_transfer` của kỳ hiện tại giữ nguyên (tiền về vẫn khớp), chỉ dừng tạo kỳ sau.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `give.cancel_donation_plan_by_token(token_hash)`            | Liên kết "dừng nhắc" trong lời nhắc, không cần đăng nhập: kiểm tra chữ ký HMAC ở route, rồi trong hàm kiểm tra token chưa dùng, chưa hết hạn, kế hoạch còn `active`; hủy như trên (`donor_cancelled`) và đặt `used_at`. Dùng lại token, hay token của kế hoạch đã kết thúc, chỉ hiện "kế hoạch đã dừng", không làm gì thêm. Mở liên kết (GET) chỉ hiện trang xác nhận có một nút, vì trình quét liên kết trong email có thể tự mở link; chỉ POST mới hủy. Khi email của DOS/Give#254 có, email nhắc mang `List-Unsubscribe` và `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058) trỏ vào cùng token.                                                                                                                                                                                                                                                            |
| `give.issue_plan_donations()`                               | Cron, mỗi kế hoạch một transaction, khóa như trên. Xét cả kế hoạch tới ngày tạo lẫn mọi kế hoạch `active` của chiến dịch đã quá `ends_at`. Kiểm tra lại dưới khóa, **theo thứ tự này**: `status='active'`; nếu `now() ≥ ends_at` (dù chiến dịch đang `live`, `suspended` hay `finalize_campaign` chưa chạy) thì kết thúc kế hoạch với lý do `campaign_closed`, cho cả hai chế độ A và A+; nếu chiến dịch không `live` (ví dụ `suspended`) thì bỏ qua, không tạo, không nhắc; kế hoạch A+ (`standing_order`) không bao giờ được tạo donation ở đây. Còn lại thì tạo donation cho **kỳ hiện tại** (`ON CONFLICT (plan_id, plan_period) DO NOTHING`), rồi đặt `next_period` sang tháng sau. Lời nhắc chỉ được ghi khi lệnh insert thực sự trả về một dòng (`RETURNING`), nên chạy lại không nhắc lần hai. Donation của cron **không** tính vào giới hạn tần suất của người góp. |
| `give.transition_campaign` (mở rộng)                        | Khi chiến dịch sang `closed` hoặc `cancelled`: kết thúc mọi kế hoạch `active` của nó trong cùng transaction, lý do `campaign_closed` hoặc `campaign_cancelled`. Khi `suspended`: cron không tạo và không nhắc cho tới khi `live` lại, nhưng vẫn kết thúc kế hoạch khi quá `ends_at`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `give.end_plans_for_deleted_user(user)`                     | Hook xóa tài khoản của DOS.Me gọi trước khi xóa, cho **mọi** kế hoạch của người đó, kể cả kế hoạch đã kết thúc từ trước: kế hoạch `active` → `ended`, `donor_deleted`; với mọi kế hoạch, đặt `contributor_user_id` NULL, xóa `public_name` và `message`, đặt `is_anonymous = true`, và đặt `ended_notice_at = now()` nếu còn NULL (không còn ai để báo); xóa mọi `plan_stop_tokens` của các kế hoạch đó. FK `ON DELETE RESTRICT` làm việc xóa tài khoản thất bại nếu hook bị bỏ qua. Donation đã tạo, kể cả donation `awaiting_transfer` của kỳ hiện tại, theo quy tắc xóa tài khoản chung cho `contributions`, quy tắc mà thiết kế chưa có (issue DB xác nhận với DOS.Me).                                                                                                                                                                                                  |

Hai lý do `campaign_closed` và `campaign_cancelled` khác nhau ở lời báo cho người góp: `campaign_closed` là chiến dịch thôi nhận vì đã tới `ends_at` (dù đã sang `closed` hay chưa), `campaign_cancelled` là chiến dịch bị hủy.

Các điểm khớp với phần đã có:

- **Sổ cái (mục 2.4):** không có bucket mới. Donation của kế hoạch đi qua `match_transaction` như mọi donation và ghi `received`. Số đăng ký hằng tháng **không** ghi sổ cái (khác `pledged` của `back`), vì nó không phải cam kết ràng buộc. Trang chiến dịch chỉ hiện "N người ủng hộ hằng tháng".
- **Mã và QR (mục 3, G3):** mỗi tháng một `reference_code` mới cùng định dạng `GV…`, nên luật khớp, kiểm tra mã thuộc đúng chiến dịch và test 3 ở mục 8 giữ nguyên. QR luôn dựng từ tài khoản đang gắn với chiến dịch lúc hiển thị, nên đổi tài khoản (DOS/Give#55) tự áp dụng cho các kỳ sau.
- **QR hiện hay không (thay quy tắc `expired` 24 giờ, mục 2.3):** với donation của kế hoạch, QR được **tính lúc hiển thị**, không lưu: hiện khi chiến dịch đang `live`, `now()` còn trong kỳ (trước hết tháng của `plan_period`), và `now() < ends_at`. Chiến dịch tạm dừng rồi mở lại trong cùng tháng thì QR hiện lại. Donation vẫn `awaiting_transfer` suốt kỳ; sau khi hết kỳ, cron đặt `expired` (chỉ để lọc danh sách). Tiền về muộn vẫn khớp như hiện nay. Tháng không trả không đổi trạng thái gì khác và không bị công khai.
- **Chuyển lại mã cũ và mẫu đã lưu.** App ngân hàng cho "chuyển lại" hoặc lưu mẫu giao dịch, nên người góp có thể gửi lại mã của tháng trước. Khi đó tiền khớp vào donation của tháng trước (đã `received`): `received_amount` tăng (quy tắc "thừa: ghi nhận toàn bộ", mục 3), tổng "đã gây quỹ" vẫn đúng, nhưng donation của tháng này vẫn `awaiting_transfer` và vẫn được nhắc. Lời nhắc và trang `/me/contributions` phải ghi rõ "mỗi tháng một mã mới, đừng dùng lại mã cũ". Give không chặn được những lần chuyển này, kể cả sau khi chiến dịch đóng: tiền đó thành `after_close` như mọi khoản khác (mục 3). Khi đổi tài khoản (DOS/Give#55), báo mọi người góp có kế hoạch `active`, vì mẫu đã lưu vẫn trỏ tài khoản cũ, và tiền vào tài khoản cũ sau lúc đổi không còn thuộc chiến dịch (mục 2.2).
- **Thông báo kết thúc kế hoạch, cho mọi đường kết thúc.** Mọi hàm kết thúc kế hoạch chỉ đặt `status`, `ended_reason`, `ended_at` và để `ended_notice_at` NULL. Job `plan-notices` quét kế hoạch `ended` có `ended_notice_at IS NULL`, mỗi kế hoạch một transaction (`FOR UPDATE SKIP LOCKED`), ghi thông báo và đặt `ended_notice_at` trong cùng transaction, nên mỗi kế hoạch được báo đúng một lần dù kết thúc vì người góp hủy, vì `transition_campaign`, vì `set_campaign_monthly` hay vì cron. Nội dung: kế hoạch cho chiến dịch nào đã dừng, vì sao; Give sẽ không tạo mã hay nhắc nữa; **nếu bạn đã lưu mẫu chuyển tiền tới tài khoản [ngân hàng, số tài khoản che bớt], hãy xóa mẫu đó**, vì tiền chuyển sau khi chiến dịch đóng vẫn vào tài khoản của người tổ chức. Với kế hoạch A+, thông báo thêm phần hủy lệnh định kỳ (mục 4.3.5).
- **Import sao kê (mục 5.2):** Give chỉ biết tiền đã về sau khi người tổ chức nhập sao kê, có thể trễ nhiều ngày. Vì vậy với tài khoản chỉ dùng `statement_import`, Give chỉ nhắc **một lần** mỗi tháng, kèm câu "nếu bạn đã chuyển thì bỏ qua". Không có lời nhắc thứ hai, để không làm phiền người đã trả.
- **Tingee (D8, mục 5.2):** với tài khoản có Tingee, job `plan-notices` có thể nhắc thêm một lần sau 5 ngày nếu donation của tháng vẫn `awaiting_transfer`. Job khóa chiến dịch `FOR SHARE` rồi kế hoạch `FOR UPDATE`, kiểm tra lại dưới khóa: kế hoạch `active`, chiến dịch `live`, `now() < ends_at`, và `now()` còn trong kỳ của donation (donation tạo ngày 28 không được nhắc lần hai sang tháng sau). Rồi đánh dấu idempotent: `UPDATE give.contributions SET followup_sent_at = now() WHERE id = … AND followup_sent_at IS NULL AND status = 'awaiting_transfer' RETURNING id`, và chỉ ghi lời nhắc khi có dòng trả về. Lời nhắc thứ hai vẫn có câu "nếu bạn đã chuyển thì bỏ qua", vì webhook có thể trễ hoặc lỗi. **Không** nhắc lần hai với tài khoản VietinBank (Tingee không gửi nội dung chuyển khoản, nên donation vẫn rơi vào `unmatched_in`, `docs/research/tingee.md` mục 6.3) và với tài khoản chỉ nối qua VA (Vietcombank, BIDV, MB, Agribank, Sacombank…, `docs/research/tingee.md` mục 4): tiền chuyển vào số tài khoản thật từ một mẫu cũ không qua Tingee, nên Give không chắc người góp chưa trả.
- **Ẩn danh.** Donation sinh ra theo `is_anonymous` và `public_name` của kế hoạch. ⚠️ Như lưu ý ở mục 2.4: nếu tài khoản nhận là tài khoản minh bạch, trang sao kê của **ngân hàng** vẫn hiện tên người chuyển, với kế hoạch hằng tháng là **mỗi tháng một lần**. Bước đăng ký phải nói rõ điều này khi người góp chọn ẩn danh.
- **Kênh nhắc và phụ thuộc:** trong app ngay, qua thông báo của Give (`give.notices`, trang `/me/notices`) và trang `/me/contributions` hiện QR của tháng; email khi `give.outbox` và job `send-outbox` (M4) có, cùng email của DOS/Give#254. Hai job mới sẽ được thêm vào mục 5.3 khi làm: `issue-plan-donations` (mỗi giờ: tạo donation của kỳ, đặt `expired` cho donation đã hết kỳ) và `plan-notices` (mỗi 10 phút: thông báo kết thúc, lời nhắc thứ hai của Tingee).

Test bắt buộc thêm cho mục 8 khi làm:

- (a) `issue_plan_donations` gọi hai lần hoặc song song → một donation và một lời nhắc mỗi kế hoạch mỗi tháng.
- (b) Chiến dịch `closed` chạy song song với cron → kế hoạch `ended`, không có donation mới sau đó, kể cả khi cron chạy trễ.
- (c) Hủy kế hoạch song song với cron → không tạo kỳ sau; donation đang chờ vẫn khớp được khi tiền về.
- (d) Tổng "đã gây quỹ" không đổi khi tạo hay hủy kế hoạch.
- (e) Không tạo donation và không hiện QR sau `ends_at` hoặc khi chiến dịch rời `live`, kể cả khi `finalize_campaign` chưa chạy và kỳ chưa hết.
- (f) RLS và hiển thị: người góp chỉ đọc kế hoạch của mình; người tổ chức chỉ thấy số lượng và tên hiển thị, không thấy email; kế hoạch `is_anonymous` hiện "Ẩn danh" ở mọi donation sinh ra và trong danh sách người ủng hộ hằng tháng.
- (g) Chiến dịch tạm dừng hai tháng rồi mở lại → chỉ tạo donation của kỳ hiện tại; `next_period` cũ nhảy tới tháng hiện tại.
- (h) Hủy rồi đăng ký lại trong cùng tháng → không có donation thứ hai cho tháng đó.
- (i) Chiến dịch tạm dừng rồi mở lại trong cùng tháng → QR của donation tháng đó hiện lại; tạm dừng qua hết tháng → donation `expired`, không có QR.
- (j) Kết thúc kế hoạch bằng mỗi đường (người góp hủy, hủy bằng token, `transition_campaign` sang `closed` và `cancelled`, `set_campaign_monthly` tắt, cron thấy quá `ends_at`) → đúng một thông báo kết thúc, kể cả khi `plan-notices` chạy hai lần hoặc song song; `donor_deleted` → không có thông báo.
- (k) Bật `allow_monthly` hoặc tạo kế hoạch khi `ends_at IS NULL` → bị từ chối; bỏ `ends_at` khi `allow_monthly` đang bật → bị từ chối.
- (l) Token dừng: đúng token → kế hoạch `donor_cancelled`; dùng lần hai, token hết hạn, token giả → không đổi gì; GET không hủy.
- (m) `update_donation_plan` với kế hoạch đã `ended`, chiến dịch không `live`, sau `ends_at` hoặc `amount` dưới mức sàn kỹ thuật → bị từ chối; `campaigns.min_contribution` cao hơn mức sàn không chặn kế hoạch.
- (n) Lời nhắc thứ hai của Tingee chạy hai lần → một lời nhắc; không có lời nhắc thứ hai cho tài khoản VietinBank, tài khoản chỉ có VA hay tài khoản chỉ dùng import sao kê; không có lời nhắc thứ hai khi kế hoạch đã hủy, chiến dịch đã đóng hay tạm dừng, sau `ends_at`, hay khi kỳ của donation đã hết.

#### 4.3.5 Phương án A+: lệnh chuyển định kỳ với mã cố định

A+ là phần mở rộng của A: một kế hoạch có thể ở chế độ "lệnh định kỳ". Người góp tự đặt lệnh chuyển tiền định kỳ trong app ngân hàng của mình, với một **mã kế hoạch cố định** trong nội dung chuyển khoản. Give không tạo mã hay QR theo tháng và không nhắc trả tiền cho kế hoạch đó; donation của mỗi tháng được tạo khi tiền về.

**Hai cổng trước khi phát hành.** A+ chỉ được bật khi qua cả hai:

- **(a) Ngân hàng.** Xác minh ở ít nhất một ngân hàng lớn (Vietcombank, Techcombank, MB, BIDV, VietinBank, ACB) rằng lệnh chuyển tiền định kỳ **hằng tháng, liên ngân hàng** (tới tài khoản ở ngân hàng khác) cho người dùng nhập nội dung tùy ý, và **giữ nguyên nội dung đó ở mọi lần chạy**. Cách xác minh: một người có tài khoản ở ngân hàng đó đặt lệnh định kỳ nhỏ tới một tài khoản thử với nội dung dạng mã kế hoạch, rồi kiểm tra sao kê bên nhận ở ít nhất hai lần chạy; ghi lại các bước tạo và hủy lệnh trong app (các bước chi tiết ở `docs/research/recurring-step2-outreach.md` phần B). Đến 2026-11-19 chưa ngân hàng nào được xác minh (mục 4.3.1). Nếu không ngân hàng nào đạt, mã cố định không tới được Give, A+ không khớp được tiền và **để đó**. Chỉ những ngân hàng đã xác minh mới có hướng dẫn đặt và hủy lệnh trong app.
- **(b) Luật sư** trả lời các câu hỏi về ủng hộ hằng tháng ở P4 (mục 9), gồm cách xử lý tiền từ lệnh định kỳ về sau hạn. Riêng với chiến dịch thuộc phạm vi D93 về thiên tai, dịch bệnh, sự cố (tức các chiến dịch mang `legal_basis = d93_disaster`): A+ **tắt, trừ khi luật sư trả lời "có" cho P4(c)**. Câu trả lời cho các câu khác của P4 không mở A+ cho nhóm này; bật cho nhóm này là một thay đổi thiết kế riêng, có review. Vì vậy A+ cần cột `legal_basis` (đề xuất 1 của tài liệu nghiên cứu) có trước; khi chưa có cột đó, A+ tắt với mọi chiến dịch. A+ cũng chỉ được bật khi chiến dịch có `ends_at` (như A).

**Mã kế hoạch.** `GM` + 6 ký tự cùng bảng chữ của mã `GV` (chữ số và chữ in hoa, bỏ `0`, `O`, `1`, `I`, `L`: 31 ký tự) + một ký tự kiểm tra **bắt buộc**; đúng 9 ký tự, trong giới hạn 10 ký tự của G3. Bộ khớp chỉ nhận mã có ký tự kiểm tra đúng. Vì nội dung chuyển khoản được bỏ dấu cách khi chuẩn hóa, chuỗi như "DUONG MANH HUNG" có thể chứa `GM` theo sau là chữ cái; ký tự kiểm tra loại phần lớn các trường hợp đó, và mã còn phải tồn tại trong `donation_plans`. Tiền tố khác `GV` nên hai loại mã không trùng nhau. Mã sinh khi tạo kế hoạch A+, `UNIQUE`, không bao giờ dùng lại, kể cả sau khi kế hoạch kết thúc, để tiền về muộn vẫn tìm được đúng kế hoạch.

```sql
-- give.donation_plans thêm:
--   mode text CHECK IN ('reminder','standing_order') DEFAULT 'reminder'   -- không đổi sau khi tạo
--   plan_code text UNIQUE NULL                -- 'GM' + 6 ký tự + 1 ký tự kiểm tra (bắt buộc)
--   standing_order_bank text NULL             -- BIN ngân hàng của người góp, để trỏ đúng hướng dẫn hủy lệnh
--   still_running_notice_period date NULL     -- tháng gần nhất đã báo "lệnh vẫn chạy" (tối đa một lần mỗi tháng)
--   standing_order_cancelled_at timestamptz NULL  -- người góp tự xác nhận đã hủy lệnh trong app ngân hàng
--   standing_order_moved_at timestamptz NULL  -- người góp tự xác nhận đã sửa lệnh sang tài khoản mới;
--                                             -- đặt lại NULL mỗi lần chiến dịch đổi tài khoản
--   suspended_notice_at timestamptz NULL      -- đã báo "chiến dịch tạm dừng" cho lần tạm dừng hiện tại
--   CHECK ((mode='standing_order') = (plan_code IS NOT NULL))
-- Migration của A+ bỏ NOT NULL của day_of_month và next_period, rồi thêm
--   CHECK (mode='standing_order' OR (day_of_month IS NOT NULL AND next_period IS NOT NULL))
--   CHECK (mode='reminder' OR (day_of_month IS NULL AND next_period IS NULL))
-- Kế hoạch 'standing_order': issue_plan_donations không tạo donation, không nhắc; không có QR theo tháng;
--   update_donation_plan chỉ đổi amount (số tiền dự định, dùng cho donation sinh ra), không có ngày.

-- give.bank_transactions thêm:
--   misdirected_plan_id uuid NULL → give.donation_plans  -- khoản vào mang mã GM của một kế hoạch
--                                                        -- mà không thuộc chiến dịch của kế hoạch đó
--   misdirected_notified_at timestamptz NULL            -- job plan-notices đã xử lý thông báo cho khoản này
-- give.account_bindings thêm:
--   standing_order_hold_overridden_by uuid NULL, standing_order_hold_overridden_at timestamptz NULL,
--   standing_order_hold_override_reason text NULL
```

`create_donation_plan` tạo kế hoạch A+ với cùng các kiểm tra như A (trừ `day`), cộng: `allow_monthly`, `legal_basis` đã có và khác `d93_disaster` (cổng (b)), ngân hàng người góp chọn nằm trong danh sách đã xác minh ở cổng (a). Trang đăng ký hiện số tài khoản (hoặc số VA khi tài khoản nối qua Tingee VA), tên chủ tài khoản, mã kế hoạch và các bước đặt lệnh **hằng tháng** của ngân hàng đó (A+ không hỗ trợ lệnh có chu kỳ khác). Tạo kế hoạch A+ **không** tạo donation nào, kể cả cho kỳ hiện tại; donation chỉ sinh khi tiền về. A+ bị từ chối khi kênh của tài khoản nhận làm mất nội dung chuyển khoản (VietinBank qua Tingee), trừ khi tài khoản đó cũng được import sao kê. Chuyển giữa A và A+ là hủy kế hoạch cũ rồi tạo kế hoạch mới. Quy tắc (h) chỉ áp dụng cho A: nếu người góp đã có donation A của tháng này rồi lệnh định kỳ cũng chạy trong tháng, tháng đó có hai donation (một của mỗi kế hoạch). Đó là tiền thật, nên Give ghi nhận cả hai.

**Khớp theo kế hoạch, không theo donation của tháng.** `match_transaction` thêm một nhánh, chạy khi nội dung chuyển khoản không có mã `GV` hợp lệ. Mã `GV` hợp lệ là mã đúng định dạng (và đúng ký tự kiểm tra nếu có) và có trong `contributions`, dù thuộc chiến dịch nào. Nội dung có cả mã `GV` hợp lệ lẫn mã `GM` thì nhánh `GM` không chạy và giao dịch được xử lý theo mã `GV` như mục 3 (mã `GV` của chiến dịch khác → `unmatched_in`).

1. Tìm **mọi** mã `GM` có ký tự kiểm tra đúng trong nội dung đã chuẩn hóa (cùng quy tắc chuẩn hóa ở mục 3) và có trong `donation_plans`. Không có mã nào thì giao dịch ở `unmatched_in` như hiện nay. Có mã của hai kế hoạch khác nhau thì giao dịch cũng ở `unmatched_in`, cho nhân viên tài chính.
2. Kế hoạch phải thuộc đúng chiến dịch của giao dịch (`plan.campaign_id = campaign_id`, cùng kiểm tra "mã thuộc đúng chiến dịch" như mã `GV`). Nếu không (tài khoản đã nhả và gắn cho chiến dịch khác), giao dịch ở `unmatched_in`, được đặt `misdirected_plan_id` và xử lý theo "Tiền A+ vào nhầm tài khoản" bên dưới.
3. Khóa chiến dịch `FOR SHARE`, rồi kế hoạch `FOR UPDATE`, rồi dòng `bank_transactions` của giao dịch `FOR UPDATE` (vẫn "chiến dịch trước"). Nếu giao dịch đã có `transaction_matches`, hoặc đã có bất kỳ dòng ledger `post` nào (đã ghi `unmatched_in`, đã khớp tay, đã giải trình), dừng ở đây: không tạo donation, không ghi gì thêm.
4. Kỳ là tháng (giờ VN) của `booked_at` của giao dịch. Dòng sao kê chỉ có ngày thì kỳ là tháng của ngày hạch toán ghi trên sao kê. Khi webhook và dòng sao kê của cùng một giao dịch được ghép, chỉ bản ghi tạo ra giao dịch (bản ghi tới trước) được khớp, nên kỳ theo `booked_at` của bản ghi đó, và việc ghép sau không đổi kỳ (ví dụ webhook lúc 23:59 ngày 31/1 và sao kê ghi ngày 1/2 → kỳ tháng 1). `INSERT` donation với `plan_id`, `plan_period`, số tiền dự định của kế hoạch, mã `reference_code` mới (cột này vẫn `NOT NULL UNIQUE`, nhưng không hiện cho người góp) `ON CONFLICT (plan_id, plan_period) DO NOTHING`, rồi đọc lại donation của kỳ đó.
5. Ghi `transaction_matches` (`INSERT … ON CONFLICT (bank_transaction_id) DO NOTHING RETURNING`). **Chỉ khi** lệnh đó trả về một dòng mới thì tăng `received_amount` và ghi ledger `received`, như một lần khớp thường; không có dòng trả về thì không làm gì thêm.

Cùng một giao dịch đến qua webhook và qua import sao kê là hai bản ghi được ghép với nhau trước khi khớp, và chỉ bản ghi không bị ghép mới vào `match_transaction` (test 2 ở mục 8, `docs/research/tingee.md` mục 8.4). Quy tắc ghép của mục 8.4 ("cả hai cùng chứa một mã tham chiếu của Give") tính cả mã `GM`. Vì một mã `GM` lặp lại mỗi tháng, nó chỉ thu hẹp ứng viên trong cửa sổ ±1 ngày của quy tắc đó; hai giao dịch cùng mã `GM`, cùng số tiền trong cửa sổ đó là hơn một ứng viên, nên chuyển nhân viên tài chính như quy tắc của mục 8.4.

**Lần chuyển thứ hai trong cùng tháng** (người góp chuyển tay thêm, hoặc lệnh chạy trễ sang tháng sau rồi lệnh của tháng đó cũng chạy) khớp vào **cùng** donation của kỳ đó: `received_amount` tăng theo quy tắc "thừa: ghi nhận toàn bộ" (mục 3), có hai dòng `received` và hai `transaction_matches`, và vẫn một donation. Không có "nợ" cho tháng bị trống.

**Tiền về sau khi kế hoạch hay chiến dịch kết thúc.** Mã `GM` của kế hoạch đã `ended` vẫn khớp như trên, vì tiền là sự thật của sao kê. Nếu chiến dịch đã `closed`, giao dịch gắn cờ `after_close` và báo người tổ chức cùng admin như hiện nay (mục 3); xử lý tiếp theo câu trả lời của luật sư (P4). Mỗi khi tiền với mã của kế hoạch đã `ended` về, dù chiến dịch còn `live` (người góp đã hủy kế hoạch) hay đã đóng, Give báo lại người góp, tối đa một lần mỗi tháng (đặt `still_running_notice_period` bằng `UPDATE … WHERE still_running_notice_period IS DISTINCT FROM <kỳ> RETURNING`, chỉ ghi thông báo khi có dòng trả về): "Có khoản chuyển mang mã kế hoạch của bạn vào [ngày]. Nếu đó là lệnh chuyển tiền định kỳ, hãy hủy lệnh trong app ngân hàng." Nếu người góp đã xóa tài khoản, donation sinh ra không có `contributor_user_id` và luôn ẩn danh.

**Tiền A+ vào nhầm tài khoản.** Lệnh định kỳ người góp quên hủy hay quên sửa có thể chạy vào một tài khoản không còn nhận cho chiến dịch của kế hoạch. Tiền đó là tiền ủng hộ thật của một người góp, nên không bao giờ khớp chéo chiến dịch và không bao giờ được giải trình thành `other_in`: khớp tay (`match_transaction` với một contribution) và `explain_inbound_transaction` đều từ chối mọi khoản vào có `misdirected_plan_id`. Có hai trường hợp:

- **Tài khoản đã nhả và gắn cho chiến dịch B** (của cùng người tổ chức, vì tài khoản đứng tên người tổ chức, mục 2.2). Giao dịch thuộc B, ở `unmatched_in` của B, có `misdirected_plan_id` (bước 2 ở trên).
- **Tài khoản cũ sau khi đổi tài khoản (DOS/Give#55), hay tài khoản không gắn với chiến dịch nào.** Giao dịch không thuộc chiến dịch nào (`campaign_id` NULL, không ghi sổ cái, mục 2.2), nên `match_transaction` không chạy. Vì vậy `record_bank_transaction` tìm mã `GM` như bước 1 trên mọi khoản vào không thuộc chiến dịch nào, đặt `misdirected_plan_id` khi có, và đưa giao dịch vào `/admin/unmatched` cho nhân viên tài chính, kèm kế hoạch và chiến dịch của mã.

**Thông báo.** Hàm ghi nhận giao dịch chỉ đặt `misdirected_plan_id`; nó không khóa kế hoạch và không gửi gì. Job `plan-notices` quét các khoản vào có `misdirected_plan_id` và `misdirected_notified_at IS NULL`, mỗi khoản một transaction: khóa chiến dịch của kế hoạch `FOR SHARE`, rồi kế hoạch `FOR UPDATE SKIP LOCKED`, rồi dòng `bank_transactions` `FOR UPDATE`, đúng thứ tự "chiến dịch trước". Bất biến phải giữ: **không hàm nào đang giữ khóa dòng kế hoạch lại chờ khóa chiến dịch**. Trong transaction đó, job:

- đặt `misdirected_notified_at = now() WHERE misdirected_notified_at IS NULL RETURNING`, và chỉ làm tiếp khi có dòng trả về (chạy lại hay chạy song song không báo hai lần);
- báo **người tổ chức** cho từng khoản: số tiền, ngày, tài khoản người chuyển (che bớt), và việc cần làm là trả lại người chuyển (bên dưới);
- báo **người góp** tối đa một lần mỗi tháng: `UPDATE give.donation_plans SET still_running_notice_period = <kỳ> WHERE id = … AND still_running_notice_period IS DISTINCT FROM <kỳ> RETURNING`, chỉ ghi thông báo khi có dòng trả về.

Người tổ chức xem các khoản này ở trang tài chính của mình, qua một view riêng lọc theo `receiving_accounts.owner_user_id`, kể cả khoản không thuộc chiến dịch nào (RLS của mục 2.6 không cho họ đọc thẳng các dòng đó). Nội dung báo người góp theo trạng thái kế hoạch:

- Kế hoạch còn `active` (thường là sau khi đổi tài khoản): "Có khoản chuyển mang mã kế hoạch của bạn vào tài khoản cũ của chiến dịch [tên]. Hãy sửa lệnh chuyển tiền định kỳ sang tài khoản mới [che bớt], rồi bấm "Tôi đã sửa lệnh". Give đã báo người tổ chức trả lại khoản này cho bạn."
- Kế hoạch đã `ended`: "Có khoản chuyển mang mã kế hoạch của bạn vào một tài khoản không còn nhận cho chiến dịch [tên]. Nếu đó là lệnh chuyển tiền định kỳ, hãy hủy lệnh trong app ngân hàng. Give đã báo người tổ chức trả lại khoản này cho bạn."

**Trả lại người chuyển** là cách xử lý mặc định, trừ khi câu trả lời P4(c') của luật sư đòi cách khác. Người tổ chức chuyển trả khoản đó từ chính tài khoản đã nhận về tài khoản đã chuyển (thấy trên sao kê). Nhân viên tài chính hoặc quản trị viên liên kết hai khoản bằng hàm mới `give.link_misdirected_return(inbound, outbound, reason, evidence)`, có ghi `audit_log`:

- **Kiểm tra:** khoản vào có `misdirected_plan_id`; khoản ra cùng tài khoản, chiều ra, hạch toán sau khoản vào, chưa có `disbursements`; số tiền khoản ra bằng khoản vào, hoặc lớn hơn khoản vào một khoản đúng bằng phí chuyển (có bằng chứng). Phí ghi thành một dòng chi riêng trên sao kê thì được giải trình riêng bằng `record_disbursement`, như mọi phí ngân hàng.
- **Giải trình khoản ra:** một dòng `disbursements` với `purpose = 'misdirected_return'`, `is_refund = false`, nên khoản ra không còn "chưa giải trình" và không chặn việc nhả tài khoản.
- **Sổ cái:** khoản ra đã có `post` `disbursed` tự động (mục 5.1) vào chiến dịch của khoản ra: B, hoặc chiến dịch cũ với tài khoản cũ sau khi đổi (tiền ra khỏi tài khoản cũ vẫn là khoản chi của chiến dịch cũ, mục 2.2). Hàm ghi trên **khoản vào** một `post` âm vào `disbursed` của chính chiến dịch đó, bằng số tiền khoản vào; nếu khoản vào đang ở `unmatched_in` của B, hàm đảo dòng đó trước. Với tài khoản cũ sau khi đổi, khoản vào không thuộc chiến dịch nào nhưng dòng âm này vẫn mang `campaign_id` của chiến dịch cũ; issue DB xác nhận ràng buộc giữa ledger và giao dịch cho trường hợp này. Kết quả: cặp này không để lại `unmatched_in` hay `disbursed` ròng; phí chuyển (nếu có) còn lại ở `disbursed` như phí ngân hàng của chiến dịch đang giữ tài khoản. Nếu khoản ra cũng không thuộc chiến dịch nào (tài khoản không gắn với chiến dịch nào, hay chủ tài khoản không phải người tổ chức, mục 2.4), hàm không ghi dòng ledger nào, chỉ ghi liên kết, dòng `disbursements` và `audit_log`.
- **Bảng phân loại lại (mục 2.4)** thêm dòng thứ năm: `unmatched_in` (hoặc không có bucket) → `disbursed` âm, cùng khuôn với `link_returned_transfer` nhưng khoản vào có trước khoản ra.
- **Công khai:** `public_statement` hiện cặp này là "trả lại khoản chuyển nhầm", không tính vào "đã gây quỹ" hay "đã chi".

Cho tới khi trả lại xong, khoản vào thuộc B vẫn ở `unmatched_in`, vẫn tính vào tổng đã nhận của B như mọi khoản chưa khớp, và vẫn chặn việc nhả tài khoản.

**Phòng trước: giữ tài khoản.** Tài khoản của một chiến dịch có kế hoạch A+, dù đã có tiền A+ về hay chưa, chỉ được nhả, hay gắn lại sau khi đổi tài khoản, khi **từng** kế hoạch A+ của chiến dịch đó qua một trong hai điều kiện:

- người góp đã bấm "Tôi đã hủy lệnh" (`standing_order_cancelled_at`); hoặc
- kế hoạch đã `ended` ít nhất 3 tháng, và không có khoản vào nào mang mã `GM` của nó trên tài khoản đó trong 3 tháng gần nhất; hoặc
- với tài khoản cũ sau khi đổi, kế hoạch còn `active`: người góp đã bấm "Tôi đã sửa lệnh" (`standing_order_moved_at`), hoặc không có khoản vào nào mang mã `GM` của nó trên tài khoản cũ trong 3 tháng gần nhất và đã có ít nhất một khoản mang mã đó vào tài khoản mới.

Các điều kiện về tiền xét mọi `bank_transactions` của tài khoản, kể cả giao dịch không thuộc chiến dịch nào.

Điều kiện áp cho mọi nhánh của `release_account_binding` ở mục 2.2, kể cả nhánh nhả ngay khi chưa nhận giao dịch nào (lệnh đã đặt có thể chưa chạy lần nào), và cho kiểm tra gắn lại tài khoản cũ sau khi đổi (`GIVE_ACCOUNT_HISTORY_OPEN`). Thiếu thì hàm báo `GIVE_ACCOUNT_STANDING_ORDERS_OPEN`. Nhân viên tài chính hoặc quản trị viên bỏ qua được điều kiện này bằng `give.override_standing_order_hold(binding, reason)`, ví dụ khi người góp không trả lời: hàm ghi người, thời điểm và lý do (bắt buộc) vào các cột `standing_order_hold_*` của binding và ghi `audit_log`; lần nhả hay gắn lại sau đó đọc các cột này. Như `decide_account_swap`, người ra quyết định không được là người tổ chức của chiến dịch đó. Vì A+ chỉ hướng dẫn lệnh hằng tháng, cửa sổ 3 tháng đủ để thấy một lệnh bị quên. Đổi tài khoản (DOS/Give#55) không bị chặn: tài khoản cũ bị khóa và chỉ gắn lại được khi qua điều kiện trên.

**Chiến dịch tạm dừng (`suspended`).** Lệnh định kỳ vẫn chạy trong lúc tạm dừng. Tiền về trong lúc đó vẫn khớp như mọi giao dịch của chiến dịch tạm dừng (mục 3). Job `plan-notices` gửi người góp có kế hoạch A+ `active` một thông báo **một lần cho mỗi lần tạm dừng**: "Chiến dịch [tên] đang tạm dừng. Bạn có thể tạm ngưng hoặc hủy lệnh chuyển tiền định kỳ trong app ngân hàng. Nếu bạn hủy lệnh, Give sẽ không nhắc bạn đặt lại khi chiến dịch mở lại." Job khóa chiến dịch `FOR SHARE`, rồi kế hoạch `FOR UPDATE SKIP LOCKED`, kiểm tra lại kế hoạch còn `active`, chiến dịch vẫn `suspended` và `now() < ends_at` (quá `ends_at` thì kế hoạch sẽ kết thúc và người góp nhận thông báo kết thúc, không phải thông báo tạm dừng), rồi `UPDATE … SET suspended_notice_at = now() WHERE id = … AND suspended_notice_at IS NULL RETURNING id` và chỉ ghi thông báo khi có dòng trả về. `transition_campaign` khi chuyển `suspended → live` đặt lại `suspended_notice_at = NULL` cho các kế hoạch A+ `active` của chiến dịch (đã khóa chúng `FOR UPDATE`), để lần tạm dừng sau lại được báo.

**Thông báo kết thúc cho kế hoạch A+** thêm vào nội dung chung ở mục 4.3.4: "**Hãy hủy lệnh chuyển tiền định kỳ trong app ngân hàng của bạn.** Give không hủy được lệnh này; nếu lệnh còn chạy, tiền vẫn vào tài khoản của người tổ chức sau khi chiến dịch đóng." Thông báo có nút "Tôi đã hủy lệnh" (đặt `standing_order_cancelled_at`, dùng ở điều kiện giữ tài khoản bên trên). Kèm các bước của ngân hàng người góp đã chọn (`standing_order_bank`), lấy từ hướng dẫn đã xác minh ở cổng (a), dạng: mở app → mục chuyển tiền định kỳ (tên mục theo ngân hàng) → chọn lệnh tới [số tài khoản che bớt] có nội dung [mã `GM…`] → hủy; và giờ chót hủy nếu ngân hàng có (Vietcombank: trước 7:30 sáng ngày chạy, theo hướng dẫn Finhay, cần xác minh lại ở cổng (a)).

**Đổi tài khoản (DOS/Give#55)** quan trọng hơn với A+: lệnh định kỳ vẫn trỏ tài khoản cũ, và tiền vào tài khoản cũ sau lúc đổi không còn thuộc chiến dịch (mục 2.2). Khi đổi tài khoản, đặt lại `standing_order_moved_at = NULL` và báo mọi người góp có kế hoạch A+ `active` sửa lệnh sang tài khoản mới, kèm các bước của ngân hàng họ và nút "Tôi đã sửa lệnh". Tiền vẫn vào tài khoản cũ được xử lý theo "Tiền A+ vào nhầm tài khoản" ở trên.

**Import sao kê và Tingee:** mã `GM` nằm trong nội dung chuyển khoản như mã `GV`, nên parser sao kê và kênh Tingee không đổi. Tài khoản VietinBank qua Tingee vẫn không có nội dung, nên tiền A+ vào đó rơi vào `unmatched_in` như mọi donation khác.

Test bắt buộc thêm cho A+:

- (o) Giao dịch có mã `GM` → tạo donation của kỳ đúng một lần; cùng giao dịch qua webhook và import sao kê (đã ghép theo `docs/research/tingee.md` mục 8.4), hoặc xử lý lại → không có donation hay dòng ledger thứ hai.
- (p) Hai giao dịch `GM` khác nhau trong cùng tháng, kể cả song song → một donation, `received_amount` bằng tổng, hai dòng `received`.
- (q) Mã `GM` của chiến dịch A trong giao dịch vào tài khoản đã nhả và gắn cho chiến dịch B → `unmatched_in` của B, có `misdirected_plan_id`; vào tài khoản cũ sau khi đổi → giao dịch không thuộc chiến dịch nào, có `misdirected_plan_id`, hiện ở `/admin/unmatched`. Trong cả hai trường hợp, sau khi `plan-notices` chạy (kể cả hai lần hoặc song song): người tổ chức nhận đúng một thông báo cho mỗi khoản và thấy khoản đó trong view của mình; người góp được báo đúng nội dung theo trạng thái kế hoạch (`active`: sửa lệnh; `ended`: hủy lệnh), tối đa một lần mỗi tháng.
- (r) Mã `GM` về sau khi chiến dịch `closed` → khớp, có cờ `after_close`, báo người tổ chức, admin và người góp (người góp tối đa một lần mỗi tháng).
- (s) Tạo kế hoạch A+ cho chiến dịch `d93_disaster` (kể cả khi các câu khác của P4 đã có câu trả lời), chiến dịch chưa có `legal_basis`, hay chiến dịch không có `ends_at`, hoặc vào tài khoản VietinBank qua Tingee không có import sao kê → bị từ chối; tạo kế hoạch A+ không sinh donation.
- (t) Đã có donation A của tháng, rồi chuyển sang A+ và lệnh chạy trong cùng tháng → hai donation cho tháng đó, mỗi kế hoạch một.
- (u) Chiến dịch tạm dừng qua `ends_at` và không mở lại → mọi kế hoạch (A và A+) `ended` với `campaign_closed` và có thông báo kết thúc.
- (v) Xóa tài khoản của người góp có cả kế hoạch `active` lẫn kế hoạch đã kết thúc → xóa thành công; mọi kế hoạch không còn `contributor_user_id`, `public_name`, `message`; không còn `plan_stop_tokens` nào của các kế hoạch đó.
- (w) Nhả tài khoản (mọi nhánh, kể cả chiến dịch `cancelled` chưa nhận giao dịch nào) hoặc gắn lại tài khoản cũ sau khi đổi, khi còn kế hoạch A+ chưa qua điều kiện giữ tài khoản → `GIVE_ACCOUNT_STANDING_ORDERS_OPEN`; một kế hoạch đã xác nhận hủy cộng một kế hoạch `ended` trên 3 tháng không có tiền → nhả được; `override_standing_order_hold` → nhả được và có `audit_log`. Đổi tài khoản, mọi người góp A+ bấm "Tôi đã sửa lệnh" → gắn lại tài khoản cũ được dù kế hoạch còn `active`. Tiền `GM` của A vào B → `explain_inbound_transaction` sang `other_in` và khớp tay vào một contribution của B đều bị từ chối; sau `link_misdirected_return` → B không còn `unmatched_in` hay `disbursed` ròng từ cặp này, khoản ra có `disbursements` `misdirected_return`. Với tài khoản cũ sau khi đổi → `disbursed` ròng của chiến dịch cũ chỉ tăng đúng phí chuyển (0 khi không có phí). Khoản vào và khoản ra đều không thuộc chiến dịch nào → không có dòng ledger, chỉ có liên kết, `disbursements` và `audit_log`.
- (x) Chiến dịch có kế hoạch A+ sang `suspended` → mỗi người góp A+ nhận đúng một thông báo tạm dừng, kể cả khi `plan-notices` chạy hai lần hoặc song song; mở lại rồi tạm dừng lần nữa → thêm đúng một thông báo; người góp kế hoạch A không nhận thông báo này.
- (y) Giao dịch mang `GM` với ký tự kiểm tra sai, hoặc chuỗi như "DUONG MANH HUNG" sau khi bỏ dấu cách → không khớp nhánh kế hoạch; có cả mã `GV` hợp lệ và mã `GM` → khớp theo `GV`; có mã `GM` của hai kế hoạch → `unmatched_in`. Giao dịch đã có `transaction_matches` (hoặc đã khớp tay) được xử lý lại → không có donation mới, `received_amount` và ledger không đổi.

#### 4.3.6 Phương án C: thu định kỳ qua cổng thanh toán được cấp phép

> Thêm ngày 2026-11-19 sau khi JOY nêu: "các bên vẫn có gói mà, theo thẻ tín dụng hoặc đóng từng tháng". JOY (2026-11-19) chọn kiểm tra cổng của C song song với cổng của A+, phương án nào qua trước thì làm trước (mục 4.3.3). Tra cứu trên web ngày 2026-11-19. Ký hiệu: _đã đọc_ (đọc trang gốc), _qua tìm kiếm_ (chỉ đọc đoạn trích kết quả tìm kiếm), _suy luận_.

**Ý tưởng.** Người góp lưu thẻ hoặc liên kết ví một lần với một cổng thanh toán có giấy phép trung gian thanh toán. Mỗi tháng Give gửi lệnh thu qua cổng, và **cổng chuyển tiền thẳng vào tài khoản riêng của chiến dịch**, không qua Give. Người tổ chức là đơn vị chấp nhận thanh toán (merchant) hoặc merchant con của cổng.

**Các nền tảng khác làm thế nào:**

- **GoFundMe** (_đã đọc_ [điều khoản][gfm-terms], [biểu phí][gfm-pricing]): người góp ủy quyền cho "GoFundMe hoặc nhà cung cấp" trừ phương thức thanh toán mỗi tháng (ToS 6.2(b)); bộ xử lý là Adyen, Stripe, PayPal và PayPal Giving Fund (ToS mục 5); GoFundMe nói mình không nhận, không giữ, không xử lý tiền (ToS 3.2), người tổ chức đưa thông tin ngân hàng cho bộ xử lý. Nhưng tiền **không** về thẳng ngân hàng của người tổ chức: bộ xử lý giữ tiền cho tới khi người thụ hưởng tự rút ra ("Transfers", ToS 2.24), và tiền không được rút trong 120 ngày có thể bị hoàn lại người góp hoặc sung công (ToS 7.1(b), 7.1(c); _đọc qua bản tóm tắt của công cụ đọc, chưa đọc nguyên văn mục 7_). Phí ở Mỹ 2,9% + 0,30 USD mỗi lần; ToS 2.17 cho phép thêm "phí cố định định kỳ". Thu định kỳ dừng khi chiến dịch không còn hợp lệ hoặc người góp hủy.
- **Kickstarter "Pledge Over Time"** (_đã đọc_ [FAQ][ks-pot], [Stripe case study][stripe-ks]): chia làm 3 lần bằng nhau, lần đầu khi dự án thành công, rồi mỗi tháng một lần; người tạo dự án tự bật; tối thiểu 125 USD. Lần thu lỗi có 7 hoặc 14 ngày để sửa, quá hạn thì cam kết bị bỏ, phần đã thu "có thể" được coi là ủng hộ thêm, tức người tạo dự án nhận ít hơn số đã cam kết (_suy luận_). Tiền **không** về ngay cho người tạo: lần đầu được chi khoảng 14 ngày sau khi dự án kết thúc, lần hai và ba khoảng 8 và 12 tuần sau khi kết thúc (FAQ, mục "How will I be paid?"), tức tiền nằm ở một số dư phía bộ xử lý trong thời gian đó. Kickstarter dùng Stripe Connect để chuyển tiền cho người tạo (case study); Pledge Over Time cũng chạy qua Stripe Connect là _suy luận_. Mô hình này liên quan tới `back`, ngoài phạm vi #255.
- **Patreon** (_đã đọc_ [điều khoản][patreon-terms]): Patreon là đơn vị thu tiền, giữ số dư của người sáng tạo rồi mới chi trả, và tự xử lý chargeback. Trái D3, không phải mô hình cho Give.
- **Stripe Connect** (_đã đọc_ [loại charge][stripe-charges]): chỉ **direct charge** để tiền nằm ở tài khoản của bên nhận, cũng là nơi hoàn tiền và chargeback bị trừ; destination charge và "separate charges and transfers" đều cho tiền vào số dư của nền tảng. Stripe không mở tài khoản cho doanh nghiệp hay cá nhân Việt Nam ([Stripe global][stripe-global]); Connect chỉ chi trả xuyên biên giới giữa Mỹ, Anh, EEA, Canada và Thụy Sĩ ([cross-border payouts][stripe-xb]); Việt Nam chỉ là nơi nhận của Global Payouts ([Stripe changelog][stripe-gp]), tức nền tảng giữ tiền rồi chi ra (_suy luận_: trái D3).

**Các cổng ở Việt Nam** (nguồn của từng ý, kể cả các cổng không đưa vào bảng, ở `docs/research/recurring-payment-gateways.md`):

| Cổng                      | Thu định kỳ / token                                                                                                                                                                                                             | Mô hình merchant con, tiền về thẳng tài khoản người tổ chức                                                                                                                                                                                                                                                                      | Cá nhân làm merchant                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MoMo                      | Có: `requestType=subscription` thu theo chu kỳ không cần người góp thao tác, và liên kết ví trả về token định kỳ; phải qua "Tokenization Evaluation Form" trước ([MoMo subscription][momo-sub]; _qua tìm kiếm_, trang trả 403)  | Có `subPartnerCode` "chỉ cho nhóm Master Merchant và 3PSP" ([MoMo AIO][momo-aio]; _qua tìm kiếm_); tiền về đâu: **không tìm thấy**                                                                                                                                                                                               | Từ 19/3/2026 tài khoản hộ kinh doanh phải có giấy phép và tài khoản ngân hàng đứng tên hộ ([MoMo][momo-hkd]; _qua tìm kiếm_); cá nhân thường: không tìm thấy |
| ZaloPay                   | Có: AgreementPay, người góp xác nhận liên kết trong app, merchant nhận `pay_token` rồi tự thu; người góp hủy liên kết trong app ([ZaloPay wallet token][zlp-token]; _đã đọc_)                                                   | `sub_app_id` "chỉ cho đối tác đặc biệt" ([ZaloPay API][zlp-api]; _qua tìm kiếm_); tiền về đâu: **không tìm thấy**                                                                                                                                                                                                                | Một nguồn thứ cấp nói cá nhân và hộ kinh doanh đăng ký được bằng CCCD và tài khoản ngân hàng ([FPT Shop][zlp-fpt]; _qua tìm kiếm_)                           |
| Bảo Kim                   | Có: "Auto Debit" (đăng ký số tiền 0 rồi thu bằng token), thẻ quốc tế hỗ trợ "CIT + MIT (UCOF)" ([Bảo Kim B2B][bk-overview], [create order][bk-order]; _đã đọc_)                                                                 | Có mô hình Master/Sub Merchant (`master_merchant_code`, `sub_merchant_code`), nhưng webhook có trường "số tiền thay đổi **số dư** của sub merchant" ([webhook][bk-webhook]; _đã đọc_), _suy luận_: có thể có số dư tại Bảo Kim thay vì tiền về thẳng ngân hàng; ai điều khiển việc chi ra: chưa rõ, hỏi ở câu 6 của thư hỏi cổng | Không tìm thấy                                                                                                                                               |
| VNPAY                     | Có token (`token_create`, `token_pay`), nhưng `token_pay` là trang chuyển hướng cần IP của người góp, không có chế độ định kỳ ([VNPAY token][vnp-token]; _đã đọc_); vì vậy có vẻ người góp phải có mặt mỗi lần thu (_suy luận_) | Không tìm thấy                                                                                                                                                                                                                                                                                                                   | Không tìm thấy                                                                                                                                               |
| OnePay, Alepay, 2C2P (VN) | OnePay VN: không tìm thấy tài liệu token; Alepay: có token, không có lịch định kỳ; 2C2P: tài liệu chung có token và gói định kỳ (_đã đọc_), chưa rõ áp dụng ở Việt Nam (OnePay, Alepay: _qua tìm kiếm_)                         | 2C2P nhận danh sách merchant con (_qua tìm kiếm_); tiền về đâu: không tìm thấy                                                                                                                                                                                                                                                   | Không tìm thấy                                                                                                                                               |
| Stripe, PayPal            | Stripe: có, nhưng Việt Nam không phải nước mở được tài khoản; PayPal VN: không tìm thấy thu định kỳ, nhận từ nước ngoài 4,4% + phí cố định, ủng hộ tính là "thương mại" ([PayPal VN][paypal-vn]; _qua tìm kiếm_)                | Không, theo các điểm ở trên                                                                                                                                                                                                                                                                                                      | Không phù hợp                                                                                                                                                |

**Không cổng nào công bố đủ cả ba điều C cần**: Give gửi lệnh thu định kỳ không cần người góp có mặt, tiền về thẳng tài khoản riêng của từng người tổ chức, và cá nhân (không phải doanh nghiệp) làm merchant được. Biểu phí, thời gian quyết toán (T+n), cách xử lý chargeback và việc có nhận ngành hàng từ thiện (MCC 8398) hay không đều **không công bố**; phải hỏi bằng văn bản. Gần nhất là MoMo, ZaloPay và Bảo Kim.

**C có trái D3 không.** Không trái, nếu cổng quyết toán thẳng vào tài khoản riêng của chiến dịch, phí của cổng trừ ở cổng hoặc tính riêng cho người tổ chức, hoàn tiền và chargeback trừ vào phía người tổ chức, và token thẻ hay ví nằm ở cổng (Give chỉ lưu mã tham chiếu). Đây là mô hình direct charge của Stripe (_suy luận_). **Trái** D3 nếu tiền đi qua số dư của Give, hoặc qua một số dư ở cổng mà Give điều khiển việc chi ra: khi đó Give thực chất giữ tiền.

**Mô hình phổ biến trên thị trường không phải quyết toán thẳng.** GoFundMe và Kickstarter đều để tiền ở một **số dư do bộ xử lý giữ** rồi mới chi cho người tổ chức (GoFundMe: tới khi người thụ hưởng rút, không có hạn tối đa, và tiền chưa rút sau 120 ngày có thể bị hoàn lại hay sung công; Kickstarter: khoảng 14 ngày, và 8 và 12 tuần với Pledge Over Time). Bảo Kim cũng có số dư của merchant con (_đã đọc_), nhưng ai điều khiển việc chi ra thì chưa rõ. Một số dư do cổng giữ thay mặt người tổ chức, mà Give không điều khiển, có chấp nhận được theo D3 và D93 Art. 17.2 (tiền vào tài khoản riêng tại ngân hàng thương mại) hay không là câu hỏi P4(j) cho luật sư, không phải điều thiết kế này giả định. Cho tới khi có câu trả lời, C chỉ được thiết kế chi tiết với cổng quyết toán thẳng vào tài khoản ngân hàng của chiến dịch.

**Pháp lý** (_đã đọc_ trừ khi ghi khác):

- **Nghị định 52/2024** ([văn bản][nd52]): cổng thanh toán điện tử kết nối, truyền và xử lý dữ liệu điện tử giữa khách hàng, đơn vị chấp nhận thanh toán và ngân hàng (Art. 3.18), hỗ trợ thu hộ, chi hộ thì tự thanh toán cho các bên (Art. 3.17); đó là dịch vụ trung gian thanh toán cần giấy phép của NHNN (Art. 22), làm mà không có giấy phép bị cấm (Art. 8.7). Không tìm thấy hướng dẫn nào về nền tảng chỉ gửi lệnh thu qua một cổng có phép. Give có cần giấy phép riêng hay không là câu hỏi cho luật sư; hợp đồng Give–cổng có thể dựa vào Thông tư 40/2024 Art. 9.7 (hợp tác với đối tác) ([TT 40/2024][tt40]) (_suy luận_). Lưu ý: dự thảo sửa Nghị định 52 công bố 27/7/2026 chưa rõ đã ban hành chưa, và các Thông tư 41/2025, 22/2026 sửa Thông tư 40 chưa được đọc, nên Art. 9.7 có thể đã đổi.
- **Người tổ chức làm merchant:** Thông tư 15/2024 Art. 3.8 định nghĩa đơn vị chấp nhận thanh toán là "tổ chức, cá nhân **cung cấp hàng hóa, dịch vụ**" ([TT 15/2024 hợp nhất][tt15-vbhn]); Art. 20.3 đòi hợp đồng, kiểm tra và tài khoản thanh toán để nhận tiền (_số điều chưa xác minh lại_). Thông tư 18/2024 về thẻ, đã được sửa bởi Thông tư 45/2025 (hợp nhất ở văn bản 30/VBHN-NHNN ngày 19/12/2025, [văn bản hợp nhất][tt18-vbhn]; _qua tìm kiếm, chưa đọc nguyên văn_), cấm "giao dịch thanh toán khống", tức giao dịch không có mua bán hàng hóa, dịch vụ thật (định nghĩa ở Art. 3.9 và điều cấm ở Art. 25.1(a) theo bản gốc [TT 18/2024][tt18]; _số điều chưa xác minh lại với bản hợp nhất_). Ủng hộ không phải mua bán, nên **cá nhân vận động từ thiện có làm merchant thẻ hay ví được không là rủi ro lớn nhất của C** (_suy luận_, chưa tìm thấy hướng dẫn).
- **Nghị định 93/2021 Art. 17.2** (với `d93_disaster`, như mục 4.3.2): cá nhân nhận tiền vào tài khoản riêng tại ngân hàng thương mại cho từng cuộc vận động. Vì vậy tiền từ cổng phải về đúng tài khoản đó, không về ví hay số dư ở cổng, và việc thu phải dừng đúng hạn nhận (_suy luận_). C dừng được khi Give tự giữ lịch thu và chỉ không gửi lệnh nữa. Nếu lịch thu chạy ở phía cổng (như `requestType=subscription` của MoMo, thu "không cần người góp thao tác"), Give phải gọi API hủy và chỉ coi là đã dừng khi cổng xác nhận hủy trước lần thu kế tiếp. Gói `subscription` của MoMo có ngày hết hạn (`subscriptionInfo.expiryDate`, cổng từ chối lệnh thu từ ngày đó; _qua tìm kiếm_); Give đặt ngày đó không muộn hơn `ends_at` của chiến dịch, làm lớp dừng thứ hai nếu lệnh hủy lỗi. Dù vậy C vẫn khác A+, nơi Give không dừng được gì.
- **Thương mại điện tử:** Luật 122/2025/QH15 (hiệu lực 1/7/2026) và Nghị định 248/2026 ([NĐ 248/2026][nd248]): định danh điện tử người bán từ 1/1/2027 (Art. 18.1(a)); nền tảng lớn công khai đối tác thanh toán (Art. 18.3(d)). Give có phải "sàn thương mại điện tử" theo luật này không: không tìm thấy, câu hỏi cho luật sư.
- **Ủy quyền của người góp:** với ví, lần liên kết (xác nhận trong app) là bước ủy quyền; không tìm thấy quy định đòi thêm bước cho từng lần trừ ví định kỳ (Thông tư 40/2024; _suy luận_ từ việc không tìm thấy). Với thẻ: Thông tư 18/2024 (bản hợp nhất 30/VBHN-NHNN) đòi đối chiếu sinh trắc học chủ thẻ một lần trước khi dùng thẻ cho giao dịch điện tử, có các trường hợp miễn (Art. 16.6 theo bản gốc; _qua tìm kiếm, số điều chưa xác minh_); Thông tư 50/2024, sửa bởi Thông tư 77/2025 (hợp nhất ở văn bản 25/VBHN-NHNN ngày 20/01/2026, [văn bản hợp nhất][tt50-vbhn]; _qua tìm kiếm_), còn có ngưỡng xác thực cho giao dịch ngân hàng trực tuyến (_chưa đọc_); lệnh thu định kỳ đã đăng ký có được miễn hay không: không tìm thấy. Chưa thấy quy định nào cho giao dịch do merchant khởi tạo trên thẻ đã lưu.

**Chi phí và việc phải làm.**

- **Với người tổ chức:** ký hợp đồng merchant (hoặc merchant con) với cổng và qua KYC của cổng (có thể phải là hộ kinh doanh); chịu phí mỗi giao dịch (không công bố; ví dụ ngoài nước GoFundMe 2,9% + 0,30 USD, PayPal 4,4%); tiền về chậm hơn chuyển khoản (T+n theo cổng) và có thể là một khoản gộp đã trừ phí; chịu hoàn tiền và chargeback.
- **Với JOY:** chọn một cổng làm trước; ký hợp đồng nền tảng giữa DOS và cổng, dạng hợp đồng chỉ chốt sau khi cổng trả lời thư hỏi bên dưới. Lưu ý: "Master Merchant" thường là bên nhận quyết toán rồi chi cho merchant con, tức trái D3 (_suy luận_), nên DOS không được là bên nhận tiền; qua thẩm định của cổng (MoMo có form đánh giá tokenization); hỏi luật sư các câu ở P4. Trước khi chọn cổng, gửi MoMo, ZaloPay và Bảo Kim thư hỏi bằng văn bản ở `docs/research/recurring-step2-outreach.md` phần A (bảy câu: quyết toán, cá nhân làm merchant con, thu khi người góp không có mặt, ngành từ thiện, phí và chargeback, tiền về ngân hàng hay số dư ở cổng, dữ liệu cho nền tảng). Cổng đầu tiên trả lời "có" cho câu 1–4 và nói tiền về thẳng tài khoản ngân hàng của người tổ chức ở câu 6 là ứng viên làm trước.
- **Với Give (kỹ thuật, _suy luận_):** một kênh mới trong mục 5 (`gateway`), nhận webhook kết quả thu của cổng và khớp theo mã giao dịch của cổng thay vì mã `GV`; đối soát khoản quyết toán gộp trên sao kê với các lần thu; sổ cái cần thêm bút toán cho phí, hoàn tiền và chargeback; kế hoạch hằng tháng (mục 4.3.4) thêm chế độ `gateway` với token tham chiếu. Lớn hơn A+ nhiều, và chỉ nên thiết kế chi tiết sau khi một cổng qua quy tắc chọn ở trên.

**So với A+:** A+ không tốn phí và không cần hợp đồng, nhưng Give không dừng được lệnh khi chiến dịch đóng và phụ thuộc ngân hàng của người góp giữ nội dung chuyển khoản. C tự động thật và dừng đúng hạn, nhưng tốn phí cho người tổ chức, cần hợp đồng với cổng, và có thể vướng quy định "merchant phải bán hàng hóa, dịch vụ". Cả hai đều cần luật sư trước khi phát hành.

**Câu hỏi cho luật sư:** các câu về ủng hộ hằng tháng, gồm A+ và C, nằm ở P4 (mục 9).

[gfm-recurring]: https://support.gofundme.com/hc/en-us/articles/26707416172059-Provide-ongoing-support-with-recurring-monthly-donations
[tg-dd]: https://developers.tingee.vn/docs/direct-debit/
[tg-dd-bill]: https://developers.tingee.vn/docs/direct-debit/payment-bill/
[tg-dd-wh]: https://developers.tingee.vn/docs/direct-debit/webhook/
[napas-pg]: https://en.napas.com.vn/napas-payment-gateway-service-for-other
[lvn-unt]: https://luatvietnam.vn/uy-nhiem-thu-la-gi-883-99474-article.html
[tvpl-tt15]: https://thuvienphapluat.vn/van-ban/Tien-te-Ngan-hang/Circular-15-2024-TT-NHNN-provision-of-cashless-payment-services-618416.aspx
[vnba-vcb]: https://vnba.org.vn/vi/vcb-digibank-cap-nhat-them-nhieu-tinh-nang-uu-viet-348.htm
[finhay-vcb]: https://www.finhay.com.vn/chuyen-tien-dinh-ky-trong-vietcombank-bang-ung-dung-vcb-mobile-banking-toi-finhay
[momo-link]: https://www.momo.vn/hoi-dap/dich-vu-lien-ket-la-gi
[gfm-terms]: https://www.gofundme.com/en-ca/c/terms
[gfm-pricing]: https://www.gofundme.com/pricing
[ks-pot]: https://help.kickstarter.com/hc/en-us/articles/33915468199835-Pledge-Over-Time-FAQ
[stripe-ks]: https://stripe.com/customers/kickstarter
[patreon-terms]: https://www.patreon.com/policy/legal
[stripe-charges]: https://docs.stripe.com/connect/charges
[stripe-global]: https://stripe.com/global
[stripe-xb]: https://docs.stripe.com/connect/cross-border-payouts
[stripe-gp]: https://docs.stripe.com/changelog/clover/2026-01-28/cross-border-payouts-new-countries
[momo-sub]: https://developers.momo.vn/v3/docs/payment/api/wallet/subscription/
[momo-aio]: https://developers.momo.vn/v3/docs/payment/api/payment-aio-device/
[momo-hkd]: https://www.momo.vn/tin-tuc/khuyen-mai/loa-bao-momo-nhan-tien-dung-chuan-tai-khoan-ho-8565
[zlp-token]: http://docs.zalopay.vn/docs/guides/payment-acceptance/tokenization/wallet-token/
[zlp-api]: https://developers.zalopay.vn/downloads/api/ZaloPay-APIs-Integration-Document.pdf
[zlp-fpt]: https://fptshop.com.vn/tin-tuc/danh-gia/zalopay-merchant-200893
[bk-overview]: https://developers.baokim.vn/en/docs/B2B/overview
[bk-order]: https://developers.baokim.vn/en/docs/B2B/api-reference/master-merchant/basic-pro/create-order
[bk-webhook]: https://developers.baokim.vn/en/docs/B2B/api-reference/master-merchant/basic-pro/webhook-payment
[vnp-token]: https://sandbox.vnpayment.vn/apis/docs/thanh-toan-token/token.html
[paypal-vn]: https://www.paypal.com/vn/webapps/mpp/merchant-fees
[nd52]: https://vanban.vcci.com.vn/nghi-dinh-522024nd-cp-quy-dinh-ve-thanh-toan-khong-dung-tien-mat
[tt40]: https://luatvietnam.vn/tai-chinh/thong-tu-40-2024-tt-nhnn-2024-hoat-dong-cung-ung-dich-vu-trung-gian-thanh-toan-360680-d1.html
[tt15-vbhn]: https://luatvietnam.vn/tai-chinh/van-ban-hop-nhat-26-vbhn-nhnn-2025-hop-nhat-thong-tu-quy-dinh-ve-cung-ung-dich-vu-thanh-toan-khong-dung-tien-mat-419248-d5.html
[tt18]: https://luatvietnam.vn/tai-chinh/thong-tu-18-2024-tt-nhnn-cua-ngan-hang-nha-nuoc-viet-nam-quy-dinh-ve-hoat-dong-the-ngan-hang-358546-d1.html
[tt18-vbhn]: https://vbpl.moj.gov.vn/TW/Lists/vbpq/Attachments/186079/30.2025.VBHN.NHNN.docx
[tt50-vbhn]: https://luatvietnam.vn/tai-chinh/van-ban-hop-nhat-25-vbhn-nhnn-2026-quy-dinh-an-toan-bao-mat-dich-vu-truc-tuyen-nganh-ngan-hang-431744-d5.html
[nd248]: https://hethongphapluat.com/nghi-dinh-248-2026-nd-cp-huong-dan-luat-thuong-mai-dien-tu.html

## 5. Adapter kênh thanh toán

### 5.1 Interface (TypeScript, `apps/web/src/server/channels/`)

```ts
type ChannelKind = "bank_api" | "payos" | "statement_import" | "crypto"

interface NormalizedTx {
  providerTxId: string | null // id do ngân hàng/kênh cấp; null → đi qua hàng chờ import (mục 5.2)
  direction: "in" | "out"
  asset: string // 'VND' | 'USDT' …
  amount: bigint
  bookedAt: Date
  bookedDateOnly: boolean // sao kê chỉ có ngày, không có giờ (#10)
  description: string
  counterpartyName?: string
  counterpartyAccountMasked?: string
  balanceAfter?: bigint
  raw: unknown
}

interface PaymentInstruction {
  kind: "vietqr" | "checkout_url" | "crypto_address"
  vietqr?: {
    emvPayload: string
    bankBin: string
    accountNumber: string
    accountName: string
    amount: bigint
    addInfo: string
  }
  checkoutUrl?: string
  crypto?: { chain: string; address: string; asset: string; memo?: string }
  expiresAt?: Date
}

interface PaymentChannel {
  kind: ChannelKind
  buildInstruction(
    account: ReceivingAccount,
    c: Contribution
  ): Promise<PaymentInstruction>
  /** Webhook: kiểm tra chữ ký TRƯỚC, rồi trả về dedupeKey và danh sách giao dịch đã chuẩn hóa */
  parseWebhook?(
    req: Request,
    account?: ReceivingAccount
  ): Promise<{ dedupeKey: string; txs: NormalizedTx[] }>
  /** Đối soát chủ động */
  fetchTransactions?(
    account: ReceivingAccount,
    since: Date
  ): Promise<NormalizedTx[]>
  // File sao kê không đi qua interface này: nó còn mang kỳ sao kê, số dư và cờ định dạng,
  // nên đi qua `src/server/statement-parsers/` và pipeline `statement_import` (#16).
}
```

Pipeline dùng chung cho mọi kênh, mỗi bước đều chạy lại được:

```
đầu vào → inbound_events (UNIQUE channel+dedupe_key) → parse/normalize
       → give.record_bank_transaction (UNIQUE account+provider_tx_id)
       → in:  give.match_transaction → ledger_entries (post 'received' | 'unmatched_in')
       → out: ledger_entries (post 'disbursed') → chờ give.record_disbursement
```

Webhook trả 200 ngay sau khi đã ghi `inbound_events`. Việc xử lý thất bại không làm mất dữ liệu, vì job `reprocess_inbound_events` sẽ chạy lại các dòng có `processed_at IS NULL`. Mỗi lần thử được đếm trước khi chạy (`begin_inbound_attempt`); sau 10 lần thất bại, sự kiện bị "đỗ" (`parked_at`), không được chạy lại nữa và hiện trong `give.parked_inbound_events` cho tài chính/admin, người có thể gửi nó chạy lại bằng `give.retry_inbound_event`. Lỗi mà thử lại cũng không qua (ví dụ cơ sở dữ liệu từ chối nội dung sao kê) được báo là lỗi cuối (`p_final`): sự kiện kết thúc ngay, giữ mã lỗi, không chạy lại và không bị "đỗ".

### 5.2 Các kênh

> **Đổi kênh (JOY, 2026-11-18, D8):** kênh `payos` trong bảng dưới được thay bằng `tingee`. Dòng `payos` giữ lại để tham khảo cho tới khi DOS/Give#24 và #25 được viết lại cho Tingee. Nghiên cứu và đề xuất ánh xạ (interface, khóa bí mật, webhook, chống ghi trùng với import sao kê) nằm ở `docs/research/tingee.md`.

| Kênh               | Dùng khi                                                                 | `buildInstruction`                                                                  | Nhận giao dịch                                                                                              | Ghi chú                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `statement_import` | **Mặc định cho MVP**, hợp với mọi ngân hàng                              | VietQR sinh tại chỗ theo chuẩn EMVCo/NAPAS (không gọi dịch vụ ngoài)                | Người tổ chức hoặc admin tải file sao kê lên; parser theo từng ngân hàng                                    | Dùng số bút toán làm `provider_tx_id` khi sao kê có. Nếu không có, xem "Import không có id" ngay dưới bảng.                                                                        |
| `bank_api`         | Khi ngân hàng đối tác cấp API hoặc webhook biến động số dư               | VietQR                                                                              | Webhook có chữ ký + `fetchTransactions` để đối soát hằng ngày                                               | Mỗi ngân hàng một implementation. Các bước giữ nguyên.                                                                                                                             |
| `payos`            | Người tổ chức có tài khoản PayOS của riêng họ, tiền vào tài khoản của họ | `createPaymentLink`, `orderCode` = số nguyên duy nhất ánh xạ tới contribution       | Webhook PayOS (HMAC-SHA256 bằng checksum key), sau đó **gọi API lấy thông tin đơn để xác nhận** rồi mới ghi | Key của người tổ chức lưu trong Supabase Vault. Không dùng API chi hộ (payouts), vì nền tảng không giữ tiền. Giới hạn độ dài `description` cần xác minh.                           |
| `crypto`           | Chỉ bật sau khi JOY chốt pháp lý (G2)                                    | Địa chỉ ví của campaign và token được chấp nhận (ví dụ USDT trên một chain cố định) | Indexer, ví dụ webhook của một dịch vụ theo dõi địa chỉ, sau đó đọc lại từ RPC để xác nhận đủ số block      | `providerTxId` = `txHash:logIndex`. Ghi `vnd_equivalent` theo tỷ giá lúc ghi nhận. Không khớp được mã ủng hộ thì là `unmatched_in`, trừ khi dùng địa chỉ riêng cho từng người góp. |

**Import không có id.** Fingerprint không được dùng làm danh tính giao dịch, vì hai dòng sao kê khác nhau có thể trùng thời điểm, số tiền và nội dung, và `ON CONFLICT DO NOTHING` sẽ lặng lẽ bỏ mất một dòng. Thay vào đó:

- Mỗi parser khai báo `hasStableRowId` và `hasRunningBalance`. Định dạng sao kê không có cả hai thì **không hỗ trợ import tự động**.
- Mọi dòng được đưa vào hàng chờ `give.statement_import_rows (import_batch_id, row_no, parsed jsonb, group_key, occurrence, status)` trước khi thành `bank_transactions`. `group_key` = hash(account, booked_at, amount, description, balance_after); `occurrence` là thứ tự của dòng trong nhóm trùng `group_key` của cùng file.
- `status` có các giá trị `ready`, `duplicate` (đã có trong một lần import trước với cùng `group_key` + `occurrence`, và số dư chạy khớp), `ambiguous`, `imported`.
- Dòng bị đánh `ambiguous` khi: nhóm có hơn 1 dòng mà thiếu `balance_after`; hoặc lần import trùng khoảng thời gian cho ra số dòng trong nhóm khác lần trước; hoặc số dư chạy không liên tục. Admin xử lý tay từng dòng `ambiguous`, có ghi `audit_log`. Dòng `ambiguous` không bao giờ bị bỏ lặng lẽ.

Kênh crypto nằm sau M4, nhưng schema đã có sẵn chỗ (`asset`, `vnd_equivalent`, `chain`, `address`) để không phải migration phá vỡ.

### 5.3 Job định kỳ (Vercel Cron → route handler có secret → RPC)

| Job                  | Tần suất | Việc                                                                                                                  |
| -------------------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| `activate-scheduled` | 5 phút   | `approved` → `live` khi tới `starts_at`                                                                               |
| `finalize-ended`     | 5 phút   | `finalize_campaign` cho từng campaign đã quá `ends_at`; campaign lỗi được ghi `audit_log` và không chặn campaign khác |
| `lapse-pledges`      | 1 giờ    | `lapse_overdue_pledges`                                                                                               |
| `remind-pledges`     | 1 giờ    | `remind_pledge_payments`: nhắc thanh toán cam kết vào ngày 1, 3 và 6 của hạn thanh toán (mỗi ngày một lần)            |
| `reprocess-inbound`  | 5 phút   | Xử lý lại `inbound_events` còn treo; đỗ sự kiện sau 10 lần thử                                                        |
| `reconcile-accounts` | 1 ngày   | `fetchTransactions` cho các kênh có hỗ trợ; báo lệch khi số dư không khớp                                             |
| `send-outbox`        | 1 phút   | Gửi email/thông báo, có retry và backoff                                                                              |
| `remind-unexplained` | 1 ngày   | Nhắc người tổ chức giải trình các khoản chi                                                                           |

Mọi job đều idempotent. Nếu một lần chạy bị trùng hoặc bị bỏ lỡ, lần chạy sau sửa lại được.

## 6. Cấu trúc repo Give

```
Give/  (pnpm + Turborepo, Node 24, theo mẫu các repo DOS)
├── apps/web/                   Next 16
│   ├── src/app/(public)/       discovery, trang campaign, donate, trang sao kê
│   ├── src/app/(account)/      ủng hộ của tôi, campaign của tôi, editor, dashboard
│   ├── src/app/(admin)/        duyệt, báo cáo vi phạm, xác minh tài khoản, nhật ký
│   ├── src/app/api/webhooks/   [channel]/route.ts
│   ├── src/app/api/cron/       [job]/route.ts
│   └── src/server/             channels/, rpc wrappers, vietqr/, statement-parsers/
├── packages/ui                 port từ apps/web trên nhánh dev (ProjectCard, TypeBadge, CreateProjectForm, DonationForm, filters…)
└── docs/
(DDL và pgTAP nằm ở DOS.Me/supabase/{migrations,tests/database})
```

Ở M0, `apps/strapi` cùng các trang `catalyst/*` (dữ liệu mock trong `data.ts`) sẽ bị gỡ. Lịch sử git vẫn còn giữ chúng.

## 7. Các mốc MVP

Mỗi mốc kết thúc bằng một luồng chạy thật trên **beta**, với dữ liệu thật, không mock. Mốc chỉ coi là xong khi các test tiền trong mục 8 thuộc mốc đó đã pass.

| Mốc                            | Phạm vi                                                                                                                                                                                                                                                                                             | Migration                   | Tiêu chí xong                                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **M0 – Nền móng**              | Tái cấu trúc repo; Next 16; đăng nhập DOS.Me; organizers, categories (seed 16 danh mục give/back), campaigns, milestones, media, updates, status events, audit_log, admins; editor tạo campaign; duyệt; trang discovery và chi tiết (port UI)                                                       | `give_foundation`           | Tạo nháp → gửi duyệt → admin duyệt → trang công khai hiện trên beta                                                              |
| **M1 – Give (import sao kê)**  | receiving_accounts + xác minh + account_bindings; contributions (kèm token trạng thái cho khách); VietQR; inbound_events, statement_import_rows, bank_transactions, matches, ledger (post/reversal); parser sao kê cho 1–2 ngân hàng; trang sao kê công khai; giải trình chi; finalize cho từ thiện | `give_money_core`           | Khách vãng lai donate → import sao kê → khớp tự động → số liệu và sao kê công khai đúng → chi tiền có giải trình → đóng campaign |
| **M2 – Kênh tự động**          | `tingee` (D8, trên tài khoản người tổ chức) và/hoặc `bank_api` (nếu ngân hàng đã có API); webhook; Realtime "đã nhận"; reconcile job                                                                                                                                                                | `give_channels` (links, D8) | Giao dịch tự hiện trong vòng 1 phút; webhook lặp hoặc đến lệch thứ tự không làm sai số                                           |
| **M3 – Back (AON)**            | reward_tiers; create/cancel pledge; finalize; payment_due, nhắc nhở, lapse; fulfillment_status; "Ủng hộ của tôi"                                                                                                                                                                                    | `give_rewards`              | Kịch bản đạt và không đạt đều chạy hết vòng; hai người tranh suất cuối thì chỉ một người được                                    |
| **M4 – Kiểm duyệt & vận hành** | reports, suspend, outbox email, báo cáo tài chính xuất CSV, nhật ký admin                                                                                                                                                                                                                           | `give_ops`                  | Báo cáo vi phạm → tạm dừng → mở lại có nhật ký; email đi qua outbox có retry                                                     |
| Sau MVP                        | Kênh crypto, phí nền tảng, tổ chức (`public.organizations`), vận chuyển có tính phí, đa tiền tệ                                                                                                                                                                                                     | –                           | –                                                                                                                                |

M1 không phụ thuộc vào việc đàm phán với ngân hàng. M2 làm `tingee` trước (D8, thay cho `payos`), rồi thêm `bank_api` khi có đối tác.

## 8. Test bắt buộc cho các luồng tiền

pgTAP (DB) và Vitest (adapter, parser):

1. Cùng một webhook gửi 2 lần → 1 `bank_transactions`, 1 dòng ledger.
2. Cùng một giao dịch đến qua webhook và qua import sao kê → không bị nhân đôi (dùng số bút toán).
3. Mã ủng hộ của campaign A xuất hiện trong giao dịch vào tài khoản của campaign B → không khớp, ghi `unmatched_in` cho B.
4. Số tiền thiếu hoặc thừa → trạng thái và `received_amount` đúng như mục 3.
5. Tiền về sau khi QR hết hạn → vẫn `received`. Tiền về sau `closed` → có cờ và có thông báo.
6. Hai `create_pledge` song song tranh suất cuối → đúng một cái thành công, `quantity_claimed ≤ limit`.
7. `finalize_campaign` gọi đồng thời hoặc gọi lại → một kết quả duy nhất, ledger không đổi ở lần gọi sau.
8. Hủy hoặc tạo pledge sau `ends_at` khi cron chưa finalize → bị từ chối. Hủy hoặc tạo chạy song song với `finalize_campaign` → kết quả nhất quán, vì cùng khóa dòng campaign.
9. `lapse`: pledge chưa trả → `lapsed`, nhả suất, `pledged` giảm đúng `intended_amount`. Pledge đã trả một phần → `refund_due`; sau khi khoản hoàn được giải trình thì thành `refunded`, ledger có reversal `disbursed` + post `refunded`.
10. Không thể UPDATE hay DELETE `ledger_entries`, kể cả với role `authenticated`.
11. RLS: người tổ chức A không đọc được contribution và giao dịch của B; `guest_email` không bao giờ xuất hiện trong view công khai; tên ẩn danh không lộ.
12. Webhook sai chữ ký → bị ghi lại với `signature_valid=false` và không tạo giao dịch.
13. Parser sao kê: bộ file mẫu của từng ngân hàng (đã xóa dữ liệu cá nhân) cho ra đúng số dòng, số tiền và chiều giao dịch.
14. Khớp tay một giao dịch `unmatched_in` → có đúng một reversal và một post `received`; tổng "đã thanh toán" không đổi; khớp tay lần hai bị từ chối.
15. Giao dịch `out` không bao giờ đi vào `match_transaction`, không tạo `received` hay `unmatched_in`.
16. Tạo donation cho campaign `back`, pledge cho campaign `give`, hoặc pledge với tier của campaign khác → bị từ chối, cả qua RPC lẫn insert thẳng (trigger).
17. Tài khoản nhận không được gắn cho campaign mới khi campaign cũ còn pledge `payment_due`/`refund_due`; giao dịch của campaign cũ vẫn mang `campaign_id` cũ sau khi tài khoản được dùng lại.
18. Token xem trạng thái của khách: đúng token → thấy trạng thái; sai hoặc hết hạn → 404; role `anon` vẫn không đọc thẳng được `contributions`.
19. Import sao kê có hai dòng giống hệt nhau mà không có số dư chạy → cả hai thành `ambiguous`, không dòng nào bị bỏ.

## 9. Câu hỏi còn mở

| #   | Câu hỏi                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Ảnh hưởng                   | Cần trước               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ----------------------- |
| P1  | Back: số đã thanh toán < mục tiêu sau hạn thì xử lý thế nào                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Điều khoản, `finalize`      | M3                      |
| P2  | Phí nền tảng: không giữ tiền thì thu bằng cách nào (tip riêng cho DOS, hay xuất hóa đơn cho người tổ chức)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Thêm bảng phí               | Sau MVP                 |
| P3  | Ngân hàng đối tác và định dạng sao kê ưu tiên. **Đã chốt (JOY, 2026-11-18):** Techcombank Business trước (file CSV hoặc XLSX tải từ Techcombank Business web, parser `tcb-business`, DOS/Give#17); ACB làm sau, khi có người tổ chức cần (`docs/research/bank-statements.md` mục 6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Parser ở M1                 | M1                      |
| P4  | Xác nhận pháp lý: Nghị định 93 (G1), crypto (G2), tài khoản thường. Ủng hộ hằng tháng (mục 4.3, D9): (a) kế hoạch hằng tháng có phải là "cam kết với người đóng góp" theo D93 Art. 8.2 để kéo dài thời hạn nhận không; (b) với A+, người tổ chức xử lý thế nào tiền từ lệnh định kỳ do người góp tự đặt về sau hạn nhận (trả lại người chuyển, đưa vào phương án số dư theo Art. 18.4, hay cách khác), và Give có trách nhiệm gì khi đã đưa mã cố định cho người góp; (c) A+ có được bật cho chiến dịch thiên tai, dịch bệnh, sự cố (`d93_disaster`) không, khi Give biết trước lệnh có thể chạy sau hạn (A+ tắt cho nhóm này trừ khi câu này được trả lời "có"); (c') người tổ chức xử lý thế nào tiền A+ vào nhầm tài khoản, sau khi tài khoản được dùng lại hay sau khi đổi tài khoản (thiết kế mặc định là trả lại người chuyển, mục 4.3.5); (d) Art. 4.3 có cấm mức tối thiểu cho mỗi kỳ do nền tảng đặt không (câu hỏi 7 của `docs/research/legal-charity-campaigns.md`); (e) đồng ý nhận nhắc định kỳ và liên kết dừng đã đủ theo Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 chưa. Với C (mục 4.3.6), hỏi cùng lúc: (f) cá nhân vận động từ thiện có làm đơn vị chấp nhận thanh toán thẻ hay ví được không, khi TT 15/2024 Art. 3.8 nói "cung cấp hàng hóa, dịch vụ" và TT 18/2024 cấm giao dịch khống; (g) Give chỉ gửi lệnh thu qua cổng có phép thì có cần giấy phép trung gian thanh toán riêng không (NĐ 52/2024 Art. 8.7, 22); (h) Give có là sàn thương mại điện tử theo Luật 122/2025 và NĐ 248/2026 không; (i) phí của cổng có được trừ vào tiền nhận theo D93 không; (j) tiền từ cổng có phải về đúng tài khoản riêng của cuộc vận động (D93 Art. 17.2) không, và một số dư do cổng giữ thay mặt người tổ chức rồi mới chi ra (mô hình phổ biến của GoFundMe, Kickstarter) có chấp nhận được theo D3 và Art. 17.2 không | Bật kênh nào; bật A+ hoặc C | M1 / crypto / A+ hoặc C |
| P5  | Vận chuyển trong MVP: đề xuất chỉ thu địa chỉ, không tính phí ship                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `requires_shipping`         | M3                      |
| P6  | Tên miền (ví dụ give.dos.me) và luồng đăng nhập first-party cụ thể theo `DOS.Me/docs/platform/DOS-ARCHITECTURE.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Cấu hình auth               | M0                      |
| P7  | Quyền admin: tạo `give.admins` riêng hay dùng hệ role chung của DOS                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | RLS admin                   | M0                      |
