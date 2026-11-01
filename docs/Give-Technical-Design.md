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

| #   | Nội dung                                                                                                                                                                                                                  | Nguồn                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| D1  | Sản phẩm = GoFundMe (từ thiện, flexible) + Kickstarter (reward, all-or-nothing). Equity, cho vay, chia lợi nhuận nằm ngoài phạm vi.                                                                                       | Handoff                  |
| D2  | Thị trường đầu tiên là Việt Nam, đơn vị tiền VND.                                                                                                                                                                         | JOY                      |
| D3  | **Nền tảng không giữ tiền.** Tiền đi thẳng vào tài khoản nhận của từng campaign. Give chỉ ghi nhận, đối soát và công khai.                                                                                                | JOY                      |
| D4  | Mỗi campaign từ thiện có một tài khoản nhận riêng. Ưu tiên tài khoản minh bạch của ngân hàng đối tác. Nếu ngân hàng không cấp API thì dùng tài khoản thường kèm import sao kê, hoặc ví crypto. JOY tự xử lý phần pháp lý. | JOY                      |
| D5  | Dùng chung Supabase của DOS, schema riêng `give`. Mọi DDL là migration idempotent trong `DOS.Me/supabase/migrations/`, đi qua CI preview → beta → prod.                                                                   | JOY + `DOS.Me/AGENTS.md` |
| D6  | Stack: Next.js 16 (App Router) + `@supabase/supabase-js` + đăng nhập first-party của DOS.Me, triển khai trên Vercel. **Bỏ Strapi.** Từ repo cũ chỉ port UI (ProjectCard, bộ lọc, layout trang chi tiết).                  | Đề xuất, chưa phản đối   |
| D7  | All-or-nothing ở VN dùng **phương án A: cam kết trước, đạt mục tiêu mới thanh toán**. Lý do: thanh toán QR không lưu được phương thức thanh toán, và theo D3 nền tảng không giữ tiền.                                     | Đề xuất                  |

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

Với chiến dịch `give`, mọi bước chuyển sang `in_review`, `approved` hoặc `live` (gồm cả cron mở chiến dịch và mở lại sau tạm dừng) cần một tài khoản nhận dùng được: đang gắn với chiến dịch, đã xác minh, thuộc người tổ chức đã xác minh và đứng tên pháp lý của người đó. Thiếu thì hàm báo `GIVE_CAMPAIGN_NO_RECEIVING_ACCOUNT`; cron bỏ qua chiến dịch đó và để nó ở `approved` (DOS/Give#38). Chiến dịch `back` chỉ cần tài khoản khi thanh toán (M3).

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

Chỉ hàm `give.release_account_binding()` được nhả binding, và chỉ khi campaign đã xong hẳn phần tiền:

- `give`: đã `closed` ít nhất 30 ngày, và mọi giao dịch của tài khoản trong thời gian binding đã được khớp hoặc giải trình.
- `back`: `failed` hoặc `cancelled`, hoặc `succeeded` và không còn contribution nào ở `payment_due`, `partially_paid` hay `refund_due`.

Mỗi giao dịch được gắn `campaign_id` theo binding đang hiệu lực tại lúc ghi nhận, và không bao giờ đổi sau đó (mục 2.4). Nhờ vậy, khi tài khoản được dùng lại cho campaign sau, sao kê, tiền chưa khớp và báo cáo chi của campaign cũ vẫn tách bạch.

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
  UNIQUE (channel, dedupe_key)
)

give.bank_transactions (                 -- bản sao sao kê, cho cả crypto (direction = in/out)
  id uuid PK,
  receiving_account_id uuid,
  campaign_id uuid NULL,                 -- theo account_bindings tại lúc ghi nhận; trigger cấm đổi.
                                         -- NULL = tài khoản không có binding hiệu lực → hàng chờ admin
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
  bucket text CHECK IN ('pledged','received','disbursed','refunded','unmatched_in'),
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

**Phân loại lại (reclassification)** không bao giờ sửa dòng cũ. Nó ghi một cặp dòng trong cùng transaction: một `reversal` đảo dòng `post` cũ (số tiền ngược dấu, trỏ `reverses_entry_id`), và một `post` vào bucket mới. Có hai trường hợp:

| Từ             | Sang       | Khi nào                                                                                        |
| -------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| `unmatched_in` | `received` | Người tổ chức hoặc admin khớp tay một giao dịch không có mã với một contribution               |
| `disbursed`    | `refunded` | Khoản chi được giải trình là hoàn tiền cho một contribution (`record_disbursement(is_refund)`) |

Vì index unique chỉ áp lên dòng `post`, và `reverses_entry_id` là UNIQUE, mỗi giao dịch đổi bucket được đúng một lần. Nếu admin cần sửa một lần khớp sai, việc đó đi qua hàm riêng `give.admin_correct_match()`, có lý do bắt buộc và ghi `audit_log`; hàm này nằm ngoài MVP.

Bốn con số mà handoff yêu cầu, áp dụng cho mô hình không giữ tiền:

| Con số              | Tính từ                                                                                 | Ghi chú                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Cam kết             | `SUM(pledged)`                                                                          | Chỉ có ở back                                                                                                          |
| Đã thanh toán       | `SUM(received)` + `SUM(unmatched_in)` (đã tính cả các dòng reversal)                    | Tiền đã vào tài khoản nhận. Khớp tay sau này chỉ chuyển tiền giữa hai bucket, tổng không đổi.                          |
| Được phép giải ngân | give: bằng "đã thanh toán". back: bằng "đã thanh toán", vì chỉ thu sau khi đạt mục tiêu | Tiền đã nằm trong tài khoản của người tổ chức, Give không chặn được. Con số này để công khai, không phải để kiểm soát. |
| Đã chi / đã hoàn    | `SUM(disbursed)`, `SUM(refunded)`                                                       | Kèm phần chưa giải trình: các khoản chi chưa có dòng trong `disbursements`                                             |

View công khai (client chỉ được đọc các view này):

- `give.public_campaigns`: campaign ở trạng thái `live` trở về sau, kèm các tổng ở trên.
- `give.public_contributions`: tên đã che theo `is_anonymous`, không có email.
- `give.public_statement`: giao dịch vào và ra, số tài khoản đối ứng đã che. Tên đối ứng chỉ hiện khi giao dịch khớp với một contribution không ẩn danh.

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

| Hàm                                                            | Việc chính                                                                                                                                                                                                                                                                                   | Chống lỗi                                                                                                                                                      |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `give.transition_campaign(campaign, to, actor, reason)`        | Đổi trạng thái theo bảng chuyển hợp lệ, ghi `campaign_status_events` và `audit_log`                                                                                                                                                                                                          | `FOR NO KEY UPDATE` dòng campaign; chuyển không hợp lệ thì `RAISE`                                                                                             |
| `give.create_donation(campaign, amount, contributor/guest, …)` | Tạo contribution `awaiting_transfer`, sinh `reference_code`; với khách vãng lai sinh thêm token xem trạng thái và trả về đúng một lần                                                                                                                                                        | Campaign phải `type='give'` và `live`; sinh lại mã nếu trùng                                                                                                   |
| `give.create_pledge(campaign, tier, amount, user, address)`    | Khóa campaign rồi khóa tier, kiểm tra còn suất, tăng `quantity_claimed`, ghi ledger `pledged +amount`                                                                                                                                                                                        | `FOR UPDATE` campaign **rồi** tier; kiểm tra lại dưới khóa: `type='back'`, `status='live'`, `now() < ends_at`, tier thuộc đúng campaign, `amount ≥ min_amount` |
| `give.cancel_pledge(contribution, user)`                       | Hoàn suất, ghi ledger `pledged −amount`                                                                                                                                                                                                                                                      | `FOR UPDATE` campaign rồi tier; kiểm tra lại dưới khóa `status='live'` **và** `now() < ends_at`. Nếu cron chưa kịp finalize thì vẫn từ chối sau `ends_at`.     |
| `give.record_bank_transaction(normalized_tx)`                  | Upsert `bank_transactions` (gắn `campaign_id` theo binding), rồi rẽ nhánh theo chiều: `in` → `match_transaction`; `out` → ledger `disbursed` (post), chờ giải trình                                                                                                                          | `ON CONFLICT (receiving_account_id, provider_tx_id) DO NOTHING`; gọi lại nhiều lần vẫn an toàn                                                                 |
| `give.match_transaction(tx, contribution?, actor?)`            | Chỉ cho giao dịch `in`. Tìm mã ủng hộ trong `description`, kiểm tra mã thuộc **đúng `campaign_id` của giao dịch**, ghi `transaction_matches` và ledger `received`, cập nhật `received_amount` và `status`. Khớp tay một giao dịch đang `unmatched_in` thì ghi cặp reversal + post (mục 2.4). | `RAISE` nếu `direction='out'`; `UNIQUE (bank_transaction_id)`; không có mã thì ghi `unmatched_in`                                                              |
| `give.finalize_campaign(campaign)`                             | back: tổng `pledged` ≥ mục tiêu thì `succeeded` và mọi pledge sang `payment_due`, có `payment_due_at`. Ngược lại thì `failed`, pledge sang `cancelled` và hoàn suất. give: `closed`.                                                                                                         | `FOR UPDATE` campaign (cùng khóa với các hàm pledge); chỉ chạy khi `now() ≥ ends_at` và đang `live`/`settling`; gọi lần hai không làm gì                       |
| `give.lapse_overdue_pledges()`                                 | Pledge quá hạn: chưa trả đồng nào → `lapsed`; đã trả một phần → `refund_due` (người tạo phải hoàn lại `received_amount` trong 14 ngày). Cả hai đều nhả suất và ghi ledger `pledged −(intended_amount)`.                                                                                      | Khóa campaign rồi tier theo lô                                                                                                                                 |
| `give.record_disbursement(tx, purpose, …)`                     | Giải trình một khoản chi. Nếu là hoàn tiền cho một contribution: ghi reversal `disbursed` + post `refunded`, và khi tổng hoàn ≥ `received_amount` thì contribution `refund_due` → `refunded`                                                                                                 | Chỉ người tổ chức của campaign, hoặc finance; chỉ cho giao dịch `out` cùng `campaign_id`                                                                       |

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

Webhook trả 200 ngay sau khi đã ghi `inbound_events`. Việc xử lý thất bại không làm mất dữ liệu, vì job `reprocess_inbound_events` sẽ chạy lại các dòng có `processed_at IS NULL`.

### 5.2 Các kênh

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

| Job                  | Tần suất | Việc                                                                      |
| -------------------- | -------- | ------------------------------------------------------------------------- |
| `activate-scheduled` | 5 phút   | `approved` → `live` khi tới `starts_at`                                   |
| `finalize-ended`     | 5 phút   | `finalize_campaign` cho các campaign đã quá `ends_at`                     |
| `lapse-pledges`      | 1 giờ    | `lapse_overdue_pledges`                                                   |
| `reprocess-inbound`  | 5 phút   | Xử lý lại `inbound_events` còn treo                                       |
| `reconcile-accounts` | 1 ngày   | `fetchTransactions` cho các kênh có hỗ trợ; báo lệch khi số dư không khớp |
| `send-outbox`        | 1 phút   | Gửi email/thông báo, có retry và backoff                                  |
| `remind-unexplained` | 1 ngày   | Nhắc người tổ chức giải trình các khoản chi                               |

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
| **M2 – Kênh tự động**          | `payos` (trên tài khoản người tổ chức) và/hoặc `bank_api` (nếu ngân hàng đã có API); webhook; Realtime "đã nhận"; reconcile job                                                                                                                                                                     | `give_channels` (Vault ref) | Giao dịch tự hiện trong vòng 1 phút; webhook lặp hoặc đến lệch thứ tự không làm sai số                                           |
| **M3 – Back (AON)**            | reward_tiers; create/cancel pledge; finalize; payment_due, nhắc nhở, lapse; fulfillment_status; "Ủng hộ của tôi"                                                                                                                                                                                    | `give_rewards`              | Kịch bản đạt và không đạt đều chạy hết vòng; hai người tranh suất cuối thì chỉ một người được                                    |
| **M4 – Kiểm duyệt & vận hành** | reports, suspend, outbox email, báo cáo tài chính xuất CSV, nhật ký admin                                                                                                                                                                                                                           | `give_ops`                  | Báo cáo vi phạm → tạm dừng → mở lại có nhật ký; email đi qua outbox có retry                                                     |
| Sau MVP                        | Kênh crypto, phí nền tảng, tổ chức (`public.organizations`), vận chuyển có tính phí, đa tiền tệ                                                                                                                                                                                                     | –                           | –                                                                                                                                |

M1 không phụ thuộc vào việc đàm phán với ngân hàng. M2 làm `payos` trước, rồi thêm `bank_api` khi có đối tác.

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

| #   | Câu hỏi                                                                                                            | Ảnh hưởng              | Cần trước   |
| --- | ------------------------------------------------------------------------------------------------------------------ | ---------------------- | ----------- |
| P1  | Back: số đã thanh toán < mục tiêu sau hạn thì xử lý thế nào                                                        | Điều khoản, `finalize` | M3          |
| P2  | Phí nền tảng: không giữ tiền thì thu bằng cách nào (tip riêng cho DOS, hay xuất hóa đơn cho người tổ chức)         | Thêm bảng phí          | Sau MVP     |
| P3  | Ngân hàng đối tác và định dạng sao kê ưu tiên                                                                      | Parser ở M1            | M1          |
| P4  | Xác nhận pháp lý: Nghị định 93 (G1), crypto (G2), tài khoản thường                                                 | Bật kênh nào           | M1 / crypto |
| P5  | Vận chuyển trong MVP: đề xuất chỉ thu địa chỉ, không tính phí ship                                                 | `requires_shipping`    | M3          |
| P6  | Tên miền (ví dụ give.dos.me) và luồng đăng nhập first-party cụ thể theo `DOS.Me/docs/platform/DOS-ARCHITECTURE.md` | Cấu hình auth          | M0          |
| P7  | Quyền admin: tạo `give.admins` riêng hay dùng hệ role chung của DOS                                                | RLS admin              | M0          |
