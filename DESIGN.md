# DESIGN.md: Give design system

This file is the single source of truth for how Give looks. Every UI change follows it. If a screen needs something this file does not cover, add the rule here in the same PR, and get the owner's approval before merging.

It replaces the visual parts of `docs/Design-Principles.md` (2025). The owner's rules from that file still hold:

- minimal;
- low corner radius;
- green primary with a light orange accent;
- generous white space;
- mobile first.

## 1. What Give should feel like

Give is a place where strangers send money to strangers. Every screen has to feel **calm, trustworthy and precise**, like a bank statement designed by a good editor. The quality bar is GoFundMe for clarity and Kickstarter for project pages.

Three rules beat everything else:

1. **One idea per section.** A section has one heading, one short paragraph at most, and one primary action.
2. **Fewer boxes.** Use white space and alignment to group things, not borders. A border or a card has to earn its place. Nested boxes (a card inside a card, a bordered chip inside a card) are not allowed.
3. **Everything sits on the grid.** Every left edge on a page lines up with the container edge or a grid column. Nothing is "about right".

## 2. Layout

### 2.1 One container for the whole site

There is exactly one page container, used by the header, every page body and the footer:

| Token                 | Value  |
| --------------------- | ------ |
| `--container-max`     | 1200px |
| Gutter, below 640px   | 16px   |
| Gutter, 640 to 1023px | 24px   |
| Gutter, 1024px and up | 32px   |

1200px is the content width; the gutter sits outside it, so at 1440px the content starts at x = 120. In code this is `container-page`. No page sets its own `max-w-*` on the outer wrapper. Inner text blocks may be narrower (see 2.3), but they start at the container's left edge, never centered on their own.

### 2.2 Grid

- 12 columns, 24px gap from 1024px; 8 columns, 16px gap below; 4 columns on phones.
- **Detail pages** (campaign, project, statement) use main = 8 columns and sidebar = 4 columns from 1024px. The sidebar is sticky from the top of the main column (top offset 96px). Below 1024px the sidebar moves under the hero, before the story.
- **List pages** (home sections, discovery, my campaigns) use card grids: 1 column below 640px, 2 columns from 640px, 3 columns from 1024px. Never 4.
- **Forms** use a single column of at most 640px, left-aligned in the container. Labels sit above inputs.
- Every grid child gets `min-w-0`, so long content wraps instead of pushing the layout off-screen.

### 2.3 Measure

Body text is at most 68 characters per line (`max-w-[68ch]`). Headings are at most 20 words and use `text-wrap: balance`.

### 2.4 Vertical rhythm

Spacing uses a 4px base. These are the only values allowed:

`4, 8, 12, 16, 24, 32, 48, 64, 96`

| Where                            | Space                         |
| -------------------------------- | ----------------------------- |
| Between page sections            | 96px desktop, 64px phone      |
| Section heading to its content   | 24px                          |
| Between related items in a group | 12 or 16px                    |
| Inside a card                    | 24px padding (16px on phones) |
| Between form fields              | 24px                          |

## 3. Type

The font is **Be Vietnam Pro**, which renders stacked Vietnamese diacritics (ễ, ặ, ỗ) cleanly. Use weights 400, 500, 600 and 700 only.

| Style   | Size / line height      | Weight               | Use                              |
| ------- | ----------------------- | -------------------- | -------------------------------- |
| Display | 48 / 56 (36 / 44 phone) | 700                  | Home hero headline only          |
| H1      | 36 / 44 (30 / 38 phone) | 700                  | Page title, one per page         |
| H2      | 24 / 32                 | 600                  | Section heading                  |
| H3      | 18 / 28                 | 600                  | Card title, sub-section          |
| Body    | 16 / 26                 | 400                  | All running text                 |
| Lead    | 18 / 28                 | 400                  | The home hero paragraph only     |
| Small   | 14 / 22                 | 400                  | Captions, meta, helper text      |
| Figure  | 30 / 36                 | 700, tabular numbers | Money amounts in the funding box |

Rules:

- Text below 14px is not allowed, except the 12px Badge (section 6).
- At most 3 sizes on one card, not counting the Badge.
- Muted text is for metadata only, never for content a donor needs to act on.

### Reference codes

Give's reference codes (`GV…` for donations and pledges, `XM…` for account verification, such as `GVA7K3M9P`) are copied by hand into banking apps, so they are set in mono, one character at a time. In code this is the `RefCode` component (and `MachineId` for the other strings below); pages never set `font-mono` themselves.

| Style        | Size / line height                                                | Weight | Use                                                                                                                               |
| ------------ | ----------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Code, large  | 24 / 32                                                           | 600    | The code a person types into a bank app (the transfer content, the verification code) and the "Mã ủng hộ" / "Mã cam kết" key fact |
| Code, inline | One step above the line: 16px in a 14px line, 18px in a 16px line | 600    | A code inside a sentence, a list row or a meta line                                                                               |

Rules:

- **Font:** the system mono stack (`font-mono`: SF Mono on Apple, Consolas on Windows, the system monospace on Android and Linux), 0.025em letter spacing, `text` color, never muted. Give loads no mono web font.
- **Minimum 16px:** mono reads a step smaller than Be Vietnam Pro at the same px (its capitals are about 14% shorter, so a 16px code looks like 14px text). So an inline code is set one step above its line, and a code is never below 16px.
- **No look-alike characters:** codes use only `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, with no 0/O or 1/I/L, so no system mono font can make a code ambiguous. A new kind of code uses the same alphabet.
- **Shown as stored:** no spaces, dashes or grouping inside a code, and no lowercase. What a person copies must match the transfer content exactly.
- **Copy button:** every code a person must type into another app has a "Sao chép" button next to it.
- **Not inside a Badge:** a Badge holds only its status word; a code that goes with it sits next to the Badge as an inline code. Text the page cannot style (select options, toasts, notification text) shows codes in the text font.
- **Inputs:** a field where a person types a code is `font-mono` and uppercase, and the campaign story editor (Markdown source) is `font-mono`, both at the field's 16px.
- **Other strings:** bank account numbers are numbers, set in Be Vietnam Pro with tabular numbers like money, not mono. Machine strings on staff screens (bank transaction ids, raw transfer descriptions, record ids, error codes, parser names) use `MachineId`: mono, weight 400, the line's size but at least 16px, in `text` or `text-muted`.

## 4. Color

Colors are **semantic tokens**, and every component uses the tokens, never raw palette classes like `gray-500`. Both themes are designed. The site declares `color-scheme: light dark` and follows the visitor's system setting, so browsers never apply their own forced dark mode.

| Token            | Light          | Dark           | Use                                        |
| ---------------- | -------------- | -------------- | ------------------------------------------ |
| `bg`             | #FFFFFF        | #0F1115        | Page background                            |
| `surface`        | #F7F8FA        | #171A20        | Bands, sidebars, inputs                    |
| `surface-raised` | #FFFFFF        | #1E222A        | Cards, menus, dialogs                      |
| `border`         | #E6E8EC        | #2A2F38        | Dividers, card edges, inputs               |
| `text`           | #111318        | #F2F4F7        | Headings and body                          |
| `text-muted`     | #5B6270        | #A3AAB8        | Meta, captions                             |
| `primary`        | #047857        | #34D399        | Primary buttons, links, progress           |
| `primary-fg`     | #FFFFFF        | #052E22        | Text on primary                            |
| `primary-soft`   | #ECFDF5        | #0B2A21        | Selected chip, info background             |
| `accent`         | #C2410C        | #FB923C        | "Dự án sáng tạo" label and icon only       |
| `accent-soft`    | #FFF7ED        | #2A1A0E        | Background of the "Dự án" label            |
| `danger`         | #B42318        | #F97066        | Errors, destructive actions                |
| `warning`        | #B54708        | #FDB022        | Deadlines, attention                       |
| `primary-hover`  | #065F46        | #6EE7B7        | Hover state of primary buttons             |
| `danger-soft`    | #FEF3F2        | #2D1412        | Background of error notices and badges     |
| `warning-soft`   | #FFFAEB        | #2A1F0A        | Background of attention notices and badges |
| `scrim`          | #111318 at 50% | #000000 at 60% | Dims the page behind a phone sheet         |

Contrast: body text >= 4.5:1, large text and icons >= 3:1, in both themes.

## 5. Shape, borders, elevation

- Radius: 4px for buttons, inputs, chips, images and badges; 6px for cards and dialogs. Nothing larger, and no pills.
- Borders are 1px `border`. A screen has at most two levels: page and card.
- Shadow appears only on floating things (menus, dialogs, the sticky funding box on scroll): `0 8px 24px rgb(0 0 0 / 0.08)`. Cards in a grid have a border and no shadow.

## 6. Components

Each component lives in `apps/web/src/components/ui` and is built on shadcn/ui (Radix) primitives, restyled with the tokens above. Pages never restyle a component inline. If a page needs a variant, it is added to the component and listed here.

### Button

| Size         | Height | Padding x | Text      |
| ------------ | ------ | --------- | --------- |
| sm           | 36px   | 12px      | 14px, 600 |
| md (default) | 44px   | 16px      | 16px, 600 |
| lg           | 52px   | 24px      | 16px, 600 |

- **Variants:** `primary` (filled), `secondary` (border, `bg` fill), `ghost` (no border, used in the header) and `danger`.
- **One primary per view:** one primary button per screen region.
- **Icons:** icon and text get an 8px gap, and the icon is 20px.

### Input, select, textarea

- Height 44px, 1px `border` on a `surface` fill.
- Focus: 2px `primary` ring.
- The label is 14px, weight 500, and sits 8px above the input.
- Helper text and errors go 8px below the input, in 14px.

### Tag (category)

A tag is **not** a button-sized box.

- Size: 28px high, 10px horizontal padding, 14px text, radius 4px.
- Look: a `surface` fill with no border.
- Interactive tags: hover goes to `border`; the selected state is a `primary-soft` fill with `primary` text.
- The 44px touch target comes from an invisible hit area (padding or `::after`), not from a bigger visible box.

### Filter bar (discovery)

- **Layout:** one row only. On the left: the type tabs ("Tất cả / Từ thiện / Dự án sáng tạo"), the "Danh mục" menu and the "Trạng thái" menu (Đang gây quỹ / Đã kết thúc / Tất cả). On the right: the result count ("128 chiến dịch") and the "Sắp xếp" menu (Nổi bật / Mới nhất / Sắp kết thúc / Gần đạt mục tiêu).
- **Menu labels:** a menu button reads "Name: value" ("Sắp xếp: Nổi bật"). Where the row is tight it shows only the value; the name stays in the accessible name. If the longest values still do not fit from 768px, only the "Danh mục" button shrinks and ends in an ellipsis (the chosen category also shows under "Đang lọc"). The row never wraps and never pushes the page sideways.
- **Phones:** the row scrolls sideways, with no wrapping onto a second line. An edge fades only on the side that still has more to scroll to. Below 768px the menus open as a sheet fixed to the bottom of the screen; from 768px, where the row no longer scrolls, they open as a popover under their button.
- **State:** every control is a link; filters, order and page live in the URL. Changing a filter or the order goes back to the first page.
- **Type control:** a segmented control on a `surface` strip, 36px items, the current item on `surface-raised`.
- **No chip wall:** never show every category as a wall of chips.

### Card (campaign)

- **Image:** 16:9 cover, radius 6px on top, `object-cover`.
- **Body:** 16px padding. It holds, in order:
  1. the type label;
  2. a title of at most 2 lines;
  3. the organizer name with a verified check;
  4. a progress bar;
  5. one line of figures ("125.000.000 ₫ đã nhận · 70%");
  6. a meta line ("8 người ủng hộ · Còn 9 ngày").
- **Description:** cards show no description text.
- **Click target:** the whole card is one link. It has a hover border and no lift animation.

### Funding box (campaign sidebar)

- **Top:** the big figure, then the goal line, then the progress bar.
- **Middle:** two meta figures side by side, then the primary button at full width, then the share buttons.
- **Statement teaser:** the statement summary is a separate block under the box, not inside it.

### Tabs

- Text tabs with a 2px `primary` underline on the active tab.
- 44px high, 24px apart, on a 1px `border` baseline that spans the container.

### Empty state

- An icon (40px, `text-muted`), an H3, one line of text and at most one button.
- The title always looks like an H3. In the page outline it is an H3 under a section's H2, and an H2 where the empty state stands directly under the page's H1.
- Centered inside its region, no dashed border.

### Badge (status)

- 24px high, 8px padding, 12px weight 600 text.
- Fill from the semantic soft color.

## 7. Header and footer

- **Header:**
  - 64px high, `bg` with a 1px bottom `border`, sticky.
  - Left: the logo, 28px.
  - Center: search, at most 480px wide, which opens a full-width sheet on phones.
  - Right: "Khám phá", "Tạo chiến dịch" (secondary button sm) and the account menu (or "Đăng nhập" ghost).
  - All aligned to the container.
- **Footer:**
  - `bg` band with a 1px top `border`, 64px top padding (48px on phones), as in the approved mockups, so it stays apart from the `surface` organizer band above it.
  - 4 columns from 1024px, 2 below, real links only.
  - Bottom line in Small.

## 8. Page templates

| Page               | Template                                                                                                                                                                                                                                                                                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home               | Hero (headline, one paragraph, one primary + one text link, statement receipt card on the right) · "Đang được quan tâm" (3 cards) · "Hai cách gây quỹ" (two columns on a `surface` fill with no border: icon, H3, 3 short lines, one link each; categories are NOT listed here) · trust strip (3 columns, icon + H3 + one line) · organizer band · footer |
| Discovery          | H1 + one line · filter bar with result count (6.Filter bar) · active filters · card grid (2.2) · pagination: "Đang xem X trên Y chiến dịch" and a secondary "Xem thêm" button, centered, 48px under the grid                                                                                                                                              |
| Campaign / project | Breadcrumb · H1 + organizer line · 8/4 grid: media + tabs (Câu chuyện / Sao kê / Người ủng hộ) in main, funding box + reward tiers (project) in sidebar                                                                                                                                                                                                   |
| Donate / pledge    | Form template (2.2), with a campaign summary strip on top                                                                                                                                                                                                                                                                                                 |
| /me, /admin        | Same container. Page header (H1 + one action), then content tables or forms. Side navigation from 1024px, top tabs below.                                                                                                                                                                                                                                 |

## 9. Imagery and icons

- Covers are real photos supplied by organizers.
- Placeholders are a flat `surface` fill with the type icon, never illustrations that look like content.
- Icons come from lucide (outline, 1.5px stroke): 16px inside a line of text (meta lines, links, labels), 20px in buttons (6.Button), 24px in navigation, 40px in empty states.

## 10. Motion

- Only color, border and opacity transitions, 150ms.
- No lift, scale or parallax.
- `prefers-reduced-motion` turns them off.

## 11. Don't

These are taken from the 2026-11 owner review:

- A row of bordered 44px boxes for categories inside a card. Use plain text or 28px tags instead, or leave categories out.
- Two cards side by side whose content pushes past the viewport. Use `min-w-0`, and test at 320 to 1440px.
- A wall of filter chips wrapping onto 3 lines. Use one row plus a dropdown.
- A page body that starts at a different left edge than the header. Use one container (2.1).
- Relying on the browser to invent a dark theme. Design both themes (4).

## 12. Definition of done for any UI PR

1. **Screenshots:** light and dark at 375, 768, 1280 and 1440px are attached to the PR, for every changed page.
2. **No horizontal scroll** from 320 to 1440px.
3. **Alignment:** every left edge lines up with the container or a grid column. The reviewer checks with an overlay grid.
4. **Spacing, type and color** come only from the values in this file.
5. **Accessibility:** Lighthouse accessibility >= 95 and keyboard paths work.
6. **Separate review:** an independent design review against this file, not only an accessibility check.
7. **Owner sign-off:** the owner signs off any new page template.
