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

1200px is the content width; the gutter sits outside it, so at 1440px the content starts at x = 120. In code this is `container-page`. No page sets its own `max-w-*` on the outer wrapper. Inner text blocks may be narrower (see 2.3), but they start at the container's left edge, never centered on their own, except an empty state (6) and the discovery pagination (8), which are centered in their region.

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
| `accent-soft`    | #FFF7ED        | #2A1A0E        | Fill of "Dự án" labels and icon tiles      |
| `danger`         | #B42318        | #F97066        | Errors, destructive actions                |
| `warning`        | #B54708        | #FDB022        | Deadlines, attention                       |
| `primary-hover`  | #065F46        | #6EE7B7        | Hover state of primary buttons             |
| `danger-soft`    | #FEF3F2        | #2D1412        | Background of error notices and badges     |
| `warning-soft`   | #FFFAEB        | #2A1F0A        | Background of attention notices and badges |
| `scrim`          | #111318 at 50% | #000000 at 60% | Dims the page behind a phone sheet         |

Contrast: body text >= 4.5:1, large text and icons >= 3:1, in both themes.

## 5. Shape, borders, elevation

- Radius: 4px for buttons, inputs, chips, images and badges; 6px for cards, dialogs and panels with a fill and no border (`surface` or a soft color, such as the "Hai cách" panels and notices). Nothing larger, and no pills.
- Borders are 1px `border`. A screen has at most two levels: page and card.
- Shadow appears only on floating things (menus, dialogs, the sticky funding box on scroll): `0 8px 24px rgb(0 0 0 / 0.08)`. Cards in a grid have a border and no shadow.

## 6. Components

Each component lives in `apps/web/src/components/ui` and is built on shadcn/ui (Radix) primitives, restyled with the tokens above. Pages never restyle a component inline. If a page needs a variant, it is added to the component and listed here.

### Focus ring

- **Site-wide:** an element focused from the keyboard (`:focus-visible`) shows a 2px `primary` ring 2px outside its box, so the ring reaches 4px beyond the element.
- **Whole, everywhere:** the ring of a control that receives keyboard focus is whole: not cut off by its container, not over the control's own text, and not touching another control's box. The exceptions are the skip link ("Chuyển tới nội dung chính"), which shows over the start of the header only while it has focus, and a footer link that wraps (see Room instead).
- **Inside instead:** where those 4px are not free, or the whole box is one link, the ring is drawn inside the element, 2px wide:
  - On the element's edge:
    - Tabs: inside the tab, which reaches 4px past its label on each side, so the ring clears the label.
    - The segmented control (filter bar): inside the item, because the items sit 4px apart and 4px from the strip's edge.
    - A campaign card and a reward tier that can be chosen, where the whole box is one link: inside the box's edge.
  - 2px in from the edge, where the element's box meets the next control's or sits 4px from it: the items of a menu sheet or popover and the sheet's "Đóng", the header's menu links, the header's icon buttons ("Tìm kiếm", "Thông báo", "Mở menu"; on "Thông báo" the ring is drawn above the unread badge), and the side list of `/me` and `/admin` from 1024px.
- **Room instead:** bare text links stacked in a list (the footer columns): each link is a 28px box centred in its 36px row, and the row is its hit area, so the site-wide ring stays 4px clear of the next link. A link that wraps onto two lines fills its row; its ring then meets the edge of the next link's box, 4px clear of that link's text.
- **Scrolled clear:** a control focused from the keyboard is scrolled into view with its whole ring: at least 70px below the top of the screen (the 65px sticky header, the 4px of the ring and 1px for scroll rounding), 5px above the bottom, and below 1024px on a campaign page clear of the support bar (its height plus the same 5px).
- **In the filter bar, a tag row and a tab row** the ring is also never under an edge fade. A control wider than the space between the fades starts at the left fade. With scripting turned off the row cannot bring a partly visible control into view, so this holds for a control that is fully in view, in a browser that reports scripting as off; an older one keeps the right-edge fade.
- **Fields** (input, select, textarea) differ: the 2px ring sits on the field's own edge with no offset and shows on every focus, pointer included.

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
- Focus: a 2px `primary` ring on the field's edge, with no offset (see Focus ring).
- The label is 14px, weight 500, and sits 8px above the input.
- Helper text and errors go 8px below the input, in 14px.

### Tag (category)

A tag is **not** a button-sized box.

- Size: 28px high, 10px horizontal padding, 14px text, radius 4px.
- Look: a `surface` fill with no border.
- Interactive tags: hover goes to `border`; the selected state is a `primary-soft` fill with `primary` text.
- The 44px touch target comes from an invisible hit area (padding or `::after`), not from a bigger visible box.
- Focus: the site-wide ring (see Focus ring) is whole on every tag, also at the ends of a row that scrolls sideways (see Filter bar, focus room).

### Filter bar (discovery)

- **Layout:** one row only. On the left: the type tabs ("Tất cả / Từ thiện / Dự án sáng tạo"), the "Danh mục" menu and the "Trạng thái" menu (Đang gây quỹ / Đã kết thúc / Tất cả). On the right: the result count ("128 chiến dịch") and the "Sắp xếp" menu (Nổi bật / Mới nhất / Sắp kết thúc / Gần đạt mục tiêu).
- **Menu labels:** a menu button reads "Name: value" ("Sắp xếp: Nổi bật"). Where the row is tight it shows only the value; the name stays in the accessible name. If the longest values still do not fit from 768px, only the "Danh mục" button shrinks and ends in an ellipsis (the chosen category also shows under "Đang lọc"). The row never wraps and never pushes the page sideways.
- **Phones:** the row scrolls sideways, with no wrapping onto a second line. An edge fades only on the side that still has more to scroll to; with scripting turned off the page cannot tell, so no edge fades. Below 768px the menus open as a sheet fixed to the bottom of the screen; from 768px, where the row no longer scrolls, they open as a popover under their button.
- **State:** every control is a link; filters, order and page live in the URL. Changing a filter or the order goes back to the first page.
- **Type control:** a segmented control on a `surface` strip with a 4px radius, 36px items, the current item on `surface-raised` with a 1px `border` line drawn inside it and no shadow. Its focus ring is drawn inside the item (see Focus ring).
- **Menus and keyboard focus:** keyboard focus never sits outside an open menu: focus that leaves the menu closes it. On phones, opening the sheet moves focus to the checked item, and Tab past the last item or Shift+Tab back to the menu button closes the sheet; from 768px the popover closes when focus moves before its button (Shift+Tab) or past its last item. Closing with Escape, "Đóng" or the dimmed page, or choosing an item with the keyboard, gives focus back to the menu button. With scripting turned off the menu button opens and closes the menu; the sheet then shows without the dimmed page and without "Đóng", which need JavaScript.
- **Focus room:** a row that scrolls sideways clips at its edge, so the filter bar, the statement's tag row and a tab row keep room for the focus ring just outside the container: 5px at each end (the 4px of the ring plus 1px for scroll rounding), and on the filter bar 4px above and below. This room is not layout spacing and shows nothing but a ring: items still start at the container edge (on a tab row the labels do, and each tab reaches 4px into the room), the fades cover the same 24px inside it, and anything scrolled past an end is covered in the room. An item focused from the keyboard is scrolled clear of the fade together with its ring: 29px from the edge (the 24px fade plus these 5px). Focus inside an open menu sheet does not move the row behind it.
- **Statement tag row:** the same one row of tags at every width. It can overflow at any width (a longer label, a larger count), so its edge fades are not limited to phones.
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

- Text tabs with a 2px `primary` underline on the active tab, as wide as the label.
- 44px high, labels 24px apart, on a 1px `border` baseline that spans the container. Each tab reaches 4px past its label on each side, as room for its focus ring; the first label stays on the container edge.
- **When the row does not fit** (phones, and `/admin` up to 1024px): it scrolls sideways, with no wrapping. While it overflows, a 24px edge fades into `bg` only on the side that still has more tabs (an overlay, as on the filter bar, not a mask); the baseline stays whole under the fade. A tab focused from the keyboard is scrolled clear of the fade with its ring, 29px from the edge (see Filter bar, Focus room); its focus ring is drawn inside the tab (see Focus ring). A row that fits has no fade; before JavaScript runs, the right edge fades as a fallback, and with scripting turned off no edge fades.

### Empty state

- An icon (40px, `text-muted`), an H3, one short sentence of text, which may wrap to two balanced lines on phones, and at most one button. A whole page differs (below).
- The title looks like an H3, except on a whole page. In the page outline it is an H3 under a section's H2, and an H2 where the empty state stands directly under the page's H1.
- Centered inside its region, no dashed border.
- It keeps 48px above and below and 16px at the sides inside its region (a panel, a list, a tab).
- Where the page section that holds it already carries the "Between page sections" padding of 2.4 and has no other content (home with no campaign), it adds no space of its own (`flush` on the component): that distance is the whole gap to the section above and below, and the container gutter is its side margin.
- **Whole page** (not found, an error, a donation the visitor may not open): the empty state is the page body, centered in the container with 64px above and below (96px from 640px). Its title is the page's H1 and looks like one, 12px above its text; the text is in `text`, balanced, at most two sentences, and a secondary button may come before the primary: side by side from 640px, stacked at full width below.

### Badge (status)

- 24px high, 8px padding, 12px weight 600 text.
- Fill from the semantic soft color.

## 7. Header and footer

- **Header:**
  - 64px high, `bg` with a 1px bottom `border`, sticky.
  - Left: the logo, 28px.
  - Center: search, a 44px field (6.Input) at most 480px wide, which opens a full-width sheet on phones.
  - Right: "Khám phá", "Tạo chiến dịch" (secondary button sm) and the account menu (or "Đăng nhập" ghost).
  - All aligned to the container.
- **Footer:**
  - `bg` band with a 1px top `border`, 64px top padding (48px on phones), as in the approved mockups, so it stays apart from the `surface` organizer band above it.
  - 4 columns from 1024px, 2 below, real links only.
  - Each link is a 28px box centred in a 36px row, which is its hit area (see 6.Focus ring).
  - Bottom line in Small.

## 8. Page templates

| Page               | Template                                                                                                                                                                                                                                                                                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home               | Hero (headline, one paragraph, one primary + one text link, statement receipt card on the right) · "Đang được quan tâm" (3 cards) · "Hai cách gây quỹ" (two columns on a `surface` fill with no border: icon, H3, 3 short lines, one link each; categories are NOT listed here) · trust strip (3 columns, icon + H3 + one line) · organizer band · footer |
| Discovery          | H1 + one line · filter bar with result count (6.Filter bar) · active filters · card grid (2.2) · pagination: "Đang xem X trên Y chiến dịch" and a secondary "Xem thêm" button, centered, 48px under the grid                                                                                                                                              |
| Campaign / project | Breadcrumb · H1 + organizer line · 8/4 grid: media + tabs (Câu chuyện / Sao kê / Người ủng hộ) in main, funding box + reward tiers (project) in sidebar                                                                                                                                                                                                   |
| Donate / pledge    | Form template (2.2), with a campaign summary strip on top                                                                                                                                                                                                                                                                                                 |
| /me, /admin        | Same container. Page header (H1 + one action), then content tables or forms. Side navigation from 1024px, top tabs below.                                                                                                                                                                                                                                 |

- **Home hero:** from 1024px the text spans 8 columns and the statement receipt card 4 (columns 9 to 12). With no live campaign the hero has no statement card and the right columns stay empty; its one action is "Tạo chiến dịch của bạn", a primary button, and the empty state under the hero has no button of its own.
- **"Hai cách gây quỹ" panels:** the two panels are not cards: no border, radius 6px, 24px padding, 32px from 1024px.

## 9. Imagery and icons

- Covers are real photos supplied by organizers.
- Placeholders are a flat `surface` fill with the type icon, never illustrations that look like content.
- Icons come from lucide (outline, 1.5px stroke): 16px inside a line of text (meta lines, links, labels), 20px in buttons (6.Button), 24px in navigation, 40px in empty states and on a cover placeholder.
- The stroke is 1.5px at 24px; icons drawn larger keep a 1.5px rendered stroke, and smaller icons scale it down (1px at 16px).
- 24px also for the home's feature icons (trust strip, "Hai cách"); the "Hai cách" icon sits in a 44px tile, radius 4px, filled `primary-soft` or `accent-soft` with the matching icon color.

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
