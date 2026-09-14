# Dashboard Overview — Sales Summary Implementation Plan

> Status: Proposed plan only (no runtime implementation in this task)  
> Prepared: 2026-09-14  
> Target routes: `/dashboard/overview`, `/contact`, `/system/permissions`  
> Design goal: minimal, user-friendly, permission-safe, and consistent with the CRM two-section layout

## 1. Outcome

สร้างหน้า Dashboard กลางที่ประกอบ Section ตามสิทธิ์ของผู้ใช้ โดยเริ่มจาก `SALE SUMMARY` และใช้ Month/Year filters ชุดเดียวกับทุก card และทุก section ที่รองรับ filter นั้น

ขอบเขต release แรก:

1. Shared Desktop Toolbar + mobile filter controls
2. Sale Summary / Monthly Report
3. Sale Target ใน Account drawer
4. Sale Tracking gauges
5. Annual Sale Report (ปีปัจจุบัน + 4 ปีย้อนหลัง)
6. Permission, authorization, cache/recovery, empty/error/loading states และ automated checks

ไม่รวมใน release นี้:

- Leaderboard / Gamification (เก็บเป็น Phase ถัดไป)
- การตั้งค่า widget เองและปุ่ม Add widget
- ระบบอัตราแลกเปลี่ยนหรือการรวมหลายสกุลเงินเป็น THB
- การแก้โครงสร้าง `EditDealPanel` หรือ preload ข้อมูลหนักของ Pipeline

## 2. Evidence from the current codebase

สิ่งที่ตรวจพบและใช้เป็นฐานของแผน:

- `/dashboard/overview` ปัจจุบันเป็น client-side placeholder, มีค่าตัวเลขจำลอง และยังไม่ใช้ `WorkspaceLayout` (`src/app/dashboard/overview/page.tsx`).
- หน้าเดิมมี Tailwind shadow และ gradient ซึ่งขัดกับ design-system ปัจจุบันที่กำหนด flat UI, borders, no shadows, no gradients.
- Dashboard permission คือ `crm_overview`; Sale Deal right-menu permission คือ `pipeline.information` (`src/lib/menu-registry.ts`).
- ผู้ใช้หลาย Department ได้สิทธิ์แบบ union; ADMIN เห็นทุก menu (`getUserVisibleMenuKeys`).
- Scope การเห็นดีลจริงของ Pipeline คือ:
  - ADMIN: ทุกดีล
  - MANAGEMENT: ดีลที่ owner หรือ team member อยู่ใน Department เดียวกับผู้ใช้
  - GENERAL: ดีลที่ตนเป็น owner หรือ team member
  (`src/lib/pipeline-security.ts#getOpportunityAccessWhere`)
- Sales deal ใช้ `Opportunity.type = SALES_DEAL`; Won ใช้ `status = WON`; วันที่โหลดใช้ `goodsLoadingDate`; มูลค่าใช้ `value` + `currency`; account ใช้ `companyId`.
- Sales deal ที่ถูก Won ผ่าน flow ปัจจุบันต้องมี Value, Currency, Goods Loading Date และ Invoice Number; `closedAt` คือเวลาที่กดปิดดีล ไม่ใช่วันรับรู้ยอดขาย.
- Account drawer สร้าง tabs จาก registry และกรองด้วย `contact.*` right-menu permissions (`src/components/contact/EditAccountPanel.tsx`).
- DB รองรับ THB/USD/EUR/CNY แต่ยังไม่พบ exchange-rate source ที่เหมาะกับการรวมยอดข้ามสกุลเงิน.
- Pusher guidebook กำหนด Dashboard เป็น aggregate snapshot: fetch ตอนเปิด/เปลี่ยน filter และใช้ visible polling 60–120 วินาทีเฉพาะเมื่อมี business need; ไม่ควร subscribe ทุก deal.

## 3. Product definitions (authoritative for implementation)

### 3.1 Shared filter period

- `month`: 1–12; ค่าเริ่มต้นคือเดือนปัจจุบันตาม `Asia/Bangkok`.
- `year`: ค่าเริ่มต้นคือปีปัจจุบัน ค.ศ.
- Year options เริ่มจากปีปัจจุบันและย้อนหลังจนถึงปีที่เก่าที่สุดซึ่งมี Sales Deal หรือ Sale Target แต่ไม่เสนอปีอนาคตใน release แรก.
- URL เป็นเจ้าของ filter state: `?month=9&year=2026`; refresh/share/back-forward ต้องคง filter เดิม.
- Server validate ค่าทั้งคู่เสมอ; ค่าไม่ถูกต้อง fallback เป็นเดือน/ปีปัจจุบัน ไม่ส่งค่าตรงเข้า query โดยไม่ตรวจ.
- ขอบเขตเดือนคำนวณเป็น `[start, nextMonthStart)` ใน timezone `Asia/Bangkok` เพื่อหลีกเลี่ยง end-of-day และ timezone off-by-one.
- Toolbar เป็น desktop-only ตามมาตรฐานที่ผู้ใช้กำหนด (`hidden` บน mobile). บน mobile ให้มี compact filter row เป็นส่วนแรกของ Body เพื่อไม่ทำให้ filter ใช้งานไม่ได้.

### 3.2 Permission and data scope

การเห็น route และการเห็นแต่ละ Section เป็นคนละชั้น:

1. Route gate: ต้องมี `crm_overview` หรือเป็น ADMIN จึงเปิดหน้าได้.
2. Sale Summary gate: ต้องมี `pipeline.information` หรือเป็น ADMIN จึงเห็น Section.
3. Sale Target tab gate: เพิ่ม key `contact.sale_target`; ต้องมีสิทธิ์นี้หรือเป็น ADMINจึงเห็น tab.
4. การอ่าน aggregate และ deal rows ทุก query ต้องประกอบ `getOpportunityAccessWhere(actor)` ที่ server; การซ่อน component ฝั่ง client ไม่ใช่ security boundary.
5. การแก้ Sale Target ต้องตรวจทั้ง `contact` + `contact.sale_target` ที่ server และต้องเข้าถึง Account นั้นได้ตาม Contact actor policy จริง.
6. ผู้ใช้หลาย Department ใช้ union ของ menu permissions แต่ data scope ยังคงตาม role/access policy; ห้ามตีความว่ามี menu permission แล้วเห็นทุก deal.
7. ถ้าสิทธิ์ถูกถอนระหว่างเปิดหน้า: request ถัดไปต้องได้ 403/section omitted, client ล้าง cache ของ section นั้น และไม่ render snapshot เก่า.

### 3.3 Monthly Report

เลือกเฉพาะ `type = SALES_DEAL` และ `goodsLoadingDate` อยู่ในเดือน/ปีที่เลือก แล้วแบ่งแบบ mutually exclusive:

| Card | Query rule | ความหมาย |
|---|---|---|
| Waiting to Load | `status = OPEN` | ลูกค้า confirm Loading Date แล้ว แต่งานยังไม่จบ |
| Won / Completed | `status = WON` | งานโหลดและปิดการขายแล้ว |
| Total This Month | union ของสองกลุ่มข้างต้น | งานที่ยังรอโหลด + งานที่ Won ของเดือน |

กฎเพิ่มเติม:

- ไม่รวม `LOST`, `CANCELLED`, `COMPLETED` และ deal types อื่นใน Total; แสดงคำอธิบายใน info tooltip.
- ไม่รวม Sales Deal ที่ไม่มี `goodsLoadingDate` เพราะไม่สามารถระบุเดือนได้.
- Account = `company.displayName ?? company.name`; ถ้า legacy row ไม่มี company ให้ใช้ `Unassigned account` และเก็บแถวไว้เพื่อ audit แทนการทำยอดหาย.
- Amount แสดง `value + currency`; null value แสดง `Not specified` และนับจำนวนดีลได้ แต่ไม่บวกเข้ายอดเงิน.
- ห้ามบวกหลาย currency เข้าด้วยกัน. Card header แสดงยอดแยก currency เช่น `฿8.2M · $24K`; เรียง THB ก่อนแล้วตาม currency code.
- ทุก card กด expand ได้เพื่อดูรายการ Account, Deal topic, Loading Date, Amount; default แสดง 5 รายการ เรียง Loading Date แล้ว Amount และมี `View all` แบบ paginated drawer/table.
- Card รวมต้องไม่ query/ส่ง deal details ซ้ำสามชุด: server สร้าง snapshot เดียวแล้ว group เป็น summary DTO.

ตัวอย่าง acceptance dataset:

- A: OPEN, loading 2026-09-05, THB 100 → Waiting 100, Total 100
- B: WON, loading 2026-09-10, THB 200 → Won 200, Total 200
- C: LOST, loading 2026-09-12, THB 300 → ไม่อยู่ในทั้งสาม card
- D: WON, loading 2026-10-01, THB 400 → ไม่อยู่ใน September
- E: OPEN, loading null, THB 500 → ไม่อยู่ใน September
- F: WON, loading 2026-09-15, USD 10 → Won/Total แสดง USD 10 แยกจาก THB 200

### 3.4 Sale Target data model

เพิ่ม model ใหม่ ไม่ใส่ column ต่อปีบน `Company`:

```prisma
model CompanySaleTarget {
  id        String   @id @default(cuid())
  companyId String
  year      Int
  amount    Decimal  @db.Decimal(18, 2)
  currency  String   @default("THB")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  company   Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@unique([companyId, year, currency])
  @@index([year, currency])
}
```

หมายเหตุ implementation:

- ใช้ `Decimal` สำหรับเป้าทางการเงิน ไม่ใช้ Float เพิ่มเติม.
- Release แรก UI default THB แต่ schema รองรับสกุลอื่นโดยไม่ต้อง migration ใหม่.
- Year รับปีปัจจุบันและย้อนหลังเท่านั้น; amount ต้อง `>= 0`, precision ไม่เกิน 2 ตำแหน่ง.
- `0` หมายถึงตั้งเป้าเป็นศูนย์โดยเจตนา; การไม่มี row หมายถึงยังไม่ได้ตั้งเป้า ต้องแยกกันใน UI.
- Mutation เป็น upsert ต่อ `[companyId, year, currency]`; delete target ใช้ action แยกและ confirmation ไม่ตีความช่องว่างเป็น delete อัตโนมัติ.
- เก็บ audit ผ่าน `CompanyLog` โดยบันทึก old/new value, year และ currency; persistence ของ target + audit อยู่ transaction เดียวกัน.

### 3.5 Sale Target tab UX

- เพิ่ม RIGHT MENU registry: `contact.sale_target`, label `Sale Target`, parent `contact`, icon `Target`, sort หลัง Projects และก่อน Email (ปรับ sort order โดยตั้งใจ).
- ใช้ dedicated component `src/components/contact/SaleTargetTab.tsx`; ไม่เพิ่ม business logic ก้อนใหญ่เข้า `EditAccountPanel.tsx`.
- Tab โหลด targets เมื่อ active เท่านั้นและ unmount เมื่อ inactive; Account drawer เปิดเร็วเหมือนเดิม.
- ตาราง minimal 3 columns: Year, Target, Actions.
- แถวปีปัจจุบันอยู่บนสุด; เพิ่ม/แก้ย้อนหลังได้; ไม่มี future year.
- Inline edit หนึ่งแถวต่อครั้ง, Save/Cancel ชัดเจน, format เงินเมื่อ blur, keyboard Enter/Escape รองรับ.
- Optimistic update เฉพาะ row ที่แก้; แสดง pending state; failure rollback เฉพาะ operation และไม่ทับการแก้ row อื่น.
- Server response เป็น authoritative DTO แล้ว merge กลับ cache; ไม่ใช้ `router.refresh()` และไม่ global revalidate.
- Empty state: `No sale targets yet` + ปุ่ม `Add target` เฉพาะผู้ที่แก้ได้.

### 3.6 Sale Tracking

- แสดงเฉพาะ Accounts ที่มี target ในปีที่ filter เลือก.
- Actual = ผลรวม `value` ของ `SALES_DEAL + WON` ซึ่ง `goodsLoadingDate` อยู่ในปีที่เลือก และ currency ตรงกับ target.
- Progress `% = actual / target × 100`.
- Target > 0: gauge แสดง 0–100 บน arc แต่ label แสดงค่าจริงได้เกิน 100 เช่น `126%`; ใช้ success accent เมื่อถึงเป้า.
- Target = 0: ไม่หาร; แสดง `No measurable target` และ actual แยกต่างหาก.
- ถ้ามี Won deals ต่าง currency: ไม่ convert และไม่รวม; แสดงข้อความเช่น `2 deals in other currencies excluded`.
- เรียง default: progress ต่ำสุดก่อนเพื่อ actionable; toolbar/card control เปลี่ยนเป็น highest/Account A–Z ได้โดยไม่เปลี่ยน global period.
- Card แสดง Account, Actual / Target, percentage และ compact accessible gauge. ใช้ CSS/SVG แบบ flat ไม่มี gradient/shadow และมี text value เสมอ ไม่พึ่งสีอย่างเดียว.
- จำนวน account มากให้ใช้ responsive grid + `Show more`; ไม่ render gauges หลายร้อยตัวพร้อมกัน.

### 3.7 Annual Sale Report

- แสดง 5 columns: ปีที่ filter เลือกเป็น anchor + 4 ปีย้อนหลัง. ตัวอย่างเมื่อเลือก 2026 คือ 2026–2022.
- เลือกเฉพาะ `SALES_DEAL`, `status = WON`, มี `value`, และ year ของ `goodsLoadingDate` อยู่ในช่วง 5 ปี.
- Group ตาม Account + Year + Currency; grand total ของแต่ละปีแยกตาม currency.
- Account rows เป็น union ของ Accounts ที่มียอดในอย่างน้อยหนึ่งปี; sort ตามยอดของ anchor year (THB ก่อน) แล้วชื่อ.
- Cell แสดง amount และ `% share` ภายในยอดรวมของปี/สกุลเดียวกัน.
- YoY badge = `(current - previous) / previous × 100` เฉพาะ currency เดียวกัน:
  - previous > 0: แสดงค่าบวก/ลบ
  - previous = 0 และ current > 0: แสดง `New` ไม่แสดง Infinity%
  - ทั้งคู่ = 0: ไม่แสดง badge
- Table sticky เฉพาะ header และ Account column; horizontal scroll บนจอแคบ; mobile ใช้ year selector + Account rows แบบ stacked ไม่บีบ 5 columns.
- ใช้ reference ภาพแนบเฉพาะ hierarchy: year totals → account rows → share/YoY; ไม่ลอก dense spacing หรือสีที่ขัด design-system.

## 4. Page composition and design standard

### Desktop Toolbar (hidden on mobile)

- อยู่ภายใน Workspace ไม่อยู่ Main Navbar.
- ซ้าย: `CRM Overview` + last updated/stale indicator ขนาดเล็ก.
- ขวา: Month select, Year select, Refresh button.
- Filters ชุดเดียวเป็น page state และส่งให้ทุก section; Section ห้ามสร้าง month/year state ของตนเอง.
- ตัด Settings, Add widget และ date-range placeholder ออกจาก release แรกเพื่อลดความซับซ้อน.

### Body

ลำดับ:

1. Mobile filter row (mobile only)
2. SALE SUMMARY header + scope label เช่น `Your deals`, `Sales department`, `All accessible deals`
3. Monthly Report: 3 summary cards
4. Sale Tracking
5. Annual Sale Report
6. Leaderboard placeholder ไม่ render ใน release นี้

Visual rules:

- ใช้ `WorkspaceLayout scrollMode="auto"` และ standard max width/padding.
- Background `#252728`; cards `#3A3B3C`; component borders `#4E4F50`; primary accent `#C7F33C`.
- ไม่มี shadow และ gradient; แยกชั้นด้วย border, whitespace และ typography.
- Rounded cards ใช้ `rounded-2xl` หรือ `rounded-[2rem]` อย่างสม่ำเสมอ.
- Skeleton ต้องมีขนาดใกล้ content จริงเพื่อลด CLS.
- ทุก amount ใช้ `Intl.NumberFormat`; full value อยู่ใน tooltip/accessible label เมื่อ compact เป็น K/M.
- Loading, empty, stale และ error state แยกความหมาย; fetch fail ต้องรักษา snapshot เก่าและมี Retry ไม่เปลี่ยนเป็นยอด 0.

## 5. Proposed architecture and ownership

```text
src/app/dashboard/overview/page.tsx
  └─ auth + route permission + initial filter parsing + initial snapshot
     └─ DashboardOverviewView (page state / URL filters / recovery owner)
        ├─ DashboardToolbar
        └─ SalesSummarySection (mounted only when authorized)
           ├─ MonthlySalesReport
           ├─ SaleTrackingGrid
           └─ AnnualSalesReportTable

src/lib/dashboard/
  ├─ dashboard-permissions.ts   server authorization + section capabilities
  ├─ dashboard-period.ts        Bangkok month/year boundaries
  ├─ sales-summary-query.ts     scoped aggregate/detail query
  ├─ sales-summary-dto.ts       minimal serializable DTO + formatter contracts
  └─ sales-summary-cache.ts     SWR key factory scoped by actor/month/year

src/lib/actions/sales-target.ts
  └─ authorized read/upsert/delete + transaction audit

src/components/contact/SaleTargetTab.tsx
  └─ active-tab fetch + row-scoped optimistic mutation
```

Ownership rules:

- Server page owns initial auth and authorized snapshot.
- `DashboardOverviewView` owns URL filter state, SWR snapshot, refresh, visible recovery และ stale/error state.
- Query module owns calculation; components do not recompute business totals from arbitrary detail arrays.
- Sale Target tab owns its form draft/pending state. Target data remains authoritative in Neon.
- Dashboard does not import Pipeline board/drawer components and does not expand `EditDealPanel`.

### Suggested DTO

```ts
type MoneyTotal = { currency: string; amount: string };

type SalesDealRow = {
  id: string;
  topic: string;
  accountId: string | null;
  accountName: string;
  loadingDate: string;
  amount: string | null;
  currency: string;
};

type SalesOverviewSnapshot = {
  period: { month: number; year: number; timezone: "Asia/Bangkok" };
  scopeLabel: string;
  monthly: {
    waiting: { count: number; totals: MoneyTotal[]; preview: SalesDealRow[] };
    won: { count: number; totals: MoneyTotal[]; preview: SalesDealRow[] };
    total: { count: number; totals: MoneyTotal[]; preview: SalesDealRow[] };
  };
  tracking: AccountSaleProgress[];
  annual: AnnualAccountSales[];
  generatedAt: string;
};
```

ใช้ string สำหรับ Decimal/amount ข้าม server-client boundary เพื่อไม่เสีย precision; convert เพื่อแสดงผลที่ presentation boundary เท่านั้น.

## 6. Query and performance plan

- Query ต้องเริ่มจาก authorized `where` แล้วเพิ่ม `type/status/date`; ห้าม fetch ทุก Opportunity แล้ว filter ใน browser.
- Initial page ส่งเฉพาะ summary, tracking, annual matrix และ top-5 preview ต่อ card; full monthly rows โหลดเมื่อผู้ใช้กด View all พร้อม cursor pagination.
- เลือกเฉพาะ field ใน DTO; ห้าม include activities, notes, attachments, quotations, AI context หรือ full user/company objects.
- พิจารณา query 3 กลุ่มที่รันขนานหลัง resolve actor/capabilities หนึ่งครั้ง: monthly, tracking, annual.
- Reuse `getOpportunityAccessWhere`; ห้ามทำ data-scope rule สำเนาใหม่ที่ drift จาก Pipeline.
- ตรวจ `EXPLAIN (ANALYZE, BUFFERS)` กับ production-like fixture ก่อนเพิ่ม index. Candidate ที่ต้องวัด ไม่เพิ่มโดยเดา:
  - `(type, status, goodsLoadingDate)`
  - `(companyId, type, status, goodsLoadingDate)`
- Cache key มี actor id + permission/scope version + month + year; ห้ามแชร์ aggregate ระหว่าง user โดย key ที่ไม่มี actor scope.
- Request race: response ของ filter เก่าห้ามทับ filter ใหม่; use SWR key isolation/latest request guard.

## 7. Realtime, optimistic UI, and recovery contract

### Dashboard

- Release แรกไม่สร้าง Pusher channel/subscription เพิ่มและไม่ subscribe `pipeline-updated` ทุก deal.
- Initial SSR snapshot → revalidate เมื่อเปลี่ยน filter → refresh เมื่อ window focus/กลับ visible.
- หากธุรกิจยืนยันว่าต้องเห็น aggregate สดระหว่างเปิดค้าง: เพิ่ม visible polling 120 วินาทีเป็นค่าตั้งต้น, หยุดเมื่อ hidden/offline/unmount, no overlap, error backoff + jitter.
- Pusher global bell จาก authenticated shell ยังคงเดิม; Dashboard ไม่สร้าง client ใหม่.
- Recovery เป็น targeted snapshot ของ active month/year เท่านั้น; ไม่ `mutate(() => true)`, ไม่ `router.refresh()`, ไม่ global cache revalidation.
- Fetch error รักษา last good snapshot พร้อม `Data may be outdated` + Retry.

### Sale Target mutation

ลำดับ: authenticate → authorize Account + `contact.sale_target` → validate → transaction(upsert/delete + audit) → return authoritative row → optimistic cache reconcile.

- UI paint optimistic row ทันทีและ rollback เฉพาะ mutation เดิมเมื่อ confirmed failure.
- Disable/save pending เฉพาะ row นั้น; row อื่นยังแก้ได้.
- ไม่ต้อง business inbox/bell สำหรับการแก้ target.
- Release แรกไม่ต้อง realtime event เพราะ target เป็น low-frequency configuration; refetch on focus/open tab เพียงพอ.
- หากภายหลังมี requirement ให้หลายคนเห็น target เปลี่ยนทันที ให้ใช้ authorized minimal invalidation ผ่าน Contact subscription owner เดิม ห้ามสร้าง Pusher client ใหม่ใน tab.

### Pusher page-policy update required during implementation

เมื่อ implement ต้องอัปเดต `.agents/skills/pusher-management/references/pusher-management.md` แถว `/dashboard/overview` และ `/contact` ให้บันทึก contract จริงที่เลือก รวม cache owner, polling enabled condition และ recovery behavior; การแก้เอกสารไม่ถือว่า runtime implement แล้ว.

## 8. File touch plan

ไฟล์ที่คาดว่าจะเพิ่ม/แก้ (ยืนยัน callers/signatures อีกครั้งก่อน implementation):

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | `CompanySaleTarget` relation/model/indexes |
| `prisma/migrations/<timestamp>_add_company_sale_targets/migration.sql` | additive migration |
| `src/lib/menu-registry.ts` | `contact.sale_target` declaration + Target icon mapping |
| `src/app/dashboard/overview/page.tsx` | server auth, route gate, initial snapshot composition |
| `src/components/dashboard/DashboardOverviewView.tsx` | shared filter/cache/recovery owner |
| `src/components/dashboard/DashboardToolbar.tsx` | desktop toolbar + mobile filter variant |
| `src/components/dashboard/SalesSummarySection.tsx` | section composition only |
| `src/components/dashboard/MonthlySalesReport.tsx` | 3 cards + details trigger |
| `src/components/dashboard/MonthlyDealDrawer.tsx` | paginated Account/Deal/Amount details |
| `src/components/dashboard/SaleTrackingGrid.tsx` | account gauges |
| `src/components/dashboard/AnnualSalesReportTable.tsx` | 5-year matrix + responsive view |
| `src/lib/dashboard/*` | date, permission, query, DTO, key helpers |
| `src/lib/actions/sales-target.ts` | authorized target queries/mutations |
| `src/components/contact/EditAccountPanel.tsx` | register/render Sale Target tab only |
| `src/components/contact/SaleTargetTab.tsx` | target table + scoped optimistic UX |
| `.agents/skills/pusher-management/references/pusher-management.md` | actual page policy after implementation |
| focused test files under `src/lib/dashboard/*.test.ts` | calculations, boundaries, access/cache keys |

`EditDealPanel.tsx`, `KanbanBoard.tsx`, `deal-draft-store.ts`, and Pipeline heavy-data key factories should remain unchanged unless implementation trace proves a real dependency. If any Pipeline file changes, run the mandatory Pipeline gate.

## 9. Delivery slices with checks

### Slice 0 — Freeze calculation and authorization contract

Document fixtures for statuses, currencies, missing values, role scopes and Bangkok date boundaries.  
**Check:** focused pure tests fail before helpers exist and cover Sep 30/Oct 1, year boundary, zero target, previous-year zero, multi-currency and unauthorized scope.

### Slice 1 — Data model + Sale Target vertical slice

Add schema/migration, registry permission, server actions, dedicated active-only tab, audit and optimistic row reconciliation.  
**Check:** Prisma validate/migration check; ADMIN/allowed user succeeds; denied user fails at server; duplicate company/year/currency upserts one row; target/audit transaction observed; inactive tab makes no target request; failure rolls back only edited row.

### Slice 2 — Authorized Monthly Report vertical slice

Convert page to server entry + WorkspaceLayout, implement shared URL filters and three cards using scoped query/DTO.  
**Check:** fixture totals exactly match §3.3; General/Management/Admin each see only expected deals; URL refresh retains month/year; mobile filter remains usable; LOST/null-date/next-month rows do not leak into totals.

### Slice 3 — Sale Tracking vertical slice

Load Accounts with selected-year targets and same-currency Won actuals; add accessible gauges and overflow states.  
**Check:** 0%, 100%, >100%, target=0, no target, missing value and other-currency cases render correct text and never NaN/Infinity.

### Slice 4 — Annual Report vertical slice

Implement 5-year aggregate matrix, share, YoY/New semantics, sticky desktop table and mobile layout.  
**Check:** independently recomputed fixture totals/share/YoY match; anchor 2026 yields 2026–2022; Jan 1/Dec 31 Bangkok boundaries land in correct year; empty previous year renders New rather than Infinity.

### Slice 5 — Recovery, performance and final integration

Add targeted focus/visible recovery (and 120s polling only if business requirement is confirmed), stale/error states, pagination and policy documentation.  
**Check:** filter race cannot paint old result; hidden view stops recovery; simulated fetch failure retains snapshot; full details are absent from initial payload; query plan is recorded against production-like data; no extra Pusher client/subscription appears.

### Final verification gates

Run commands that exist in the repository at implementation time, minimally:

```bash
npx prisma validate
npx tsc --noEmit
node --import tsx --test src/lib/dashboard/*.test.ts
npm run verify:pipeline
```

`npm run verify:pipeline` is mandatory if any Pipeline-related behavior/file or shared Pipeline access helper is touched. Also run focused Contact tests and a production build if the final Next.js route/data boundary changes require it. Browser validation must cover desktop and mobile sizes, permission variants, filters, drill-down, empty/error/stale states and no-shadow/no-gradient visual inspection.

## 10. Acceptance criteria

- User without `crm_overview` cannot load Dashboard data.
- User with Dashboard but without `pipeline.information` sees no Sale Summary data or payload.
- Every Sale Summary number obeys the same Pipeline actor scope as the source deals.
- One Month/Year selection drives Monthly, Tracking and Annual anchor year; state survives reload/share.
- Monthly cards clearly distinguish Waiting, Won and Total and expose Account + Deal Amount details.
- Sale Target is an authorized right-menu tab, supports current/past years and saves atomically with audit.
- Tracking shows every accessible Account that has a target in the selected year and handles 0/>100%/multi-currency safely.
- Annual report shows anchor year + 4 previous years, Won only, grouped by Account, with finite share/YoY values.
- No mixed-currency arithmetic occurs without an explicit FX policy.
- Dashboard adds no per-deal Pusher subscription, no duplicate client, no global cache invalidation and no `router.refresh()`.
- Inactive Sale Target tab performs no work; dashboard details are loaded on demand/paginated.
- Desktop follows Desktop Toolbar + Body; mobile has usable Body filters; all UI follows flat dark design with no shadows/gradients.
- Loading, authoritative empty, stale and error states are visually and semantically distinct.

## 11. Risks, rejected options, and open product decision

### Risks

- `Opportunity.value` is Float in the legacy model; historical sums can contain floating-point artifacts. Format presentation consistently and consider a separate future money migration, not a drive-by migration in this feature.
- Legacy Won rows may violate current validation (missing company/loading date/value). Surface excluded counts in diagnostic logging/QA fixture; do not silently invent values.
- Company visibility policy must be confirmed from actual Contact actor helpers before target mutation implementation; menu permission alone is insufficient.
- Aggregate queries over long history may need a composite index, but add only after measured query evidence.

### Rejected for release one

- **Summing every currency as THB:** mathematically wrong without rate/date/source.
- **Using `closedAt` as sales period:** measures when staff clicked Won, not the Loading Date business rule.
- **Public/global Dashboard channel:** risks data leakage and message fanout; snapshot recovery is sufficient for aggregate reporting.
- **Fetching every deal to the browser:** unnecessary transfer and exposes detail beyond presentation needs.
- **Putting Sale Target inline in `EditAccountPanel`:** increases drawer coupling; dedicated tab boundary is testable and unmountable.
- **One target column per year:** requires schema migration every year and prevents clean uniqueness/querying.

### Product decision to confirm before implementation

ปัจจุบันแผนใช้ `goodsLoadingDate` เป็น sales attribution date ทั้ง Monthly และ Annual และแสดงหลาย currency แยกกัน หากธุรกิจต้องการ “ยอดเงินบาทรวม” ต้องกำหนด FX source, rate date (invoice/loading/payment), rounding และการเก็บ historical rate ก่อนเริ่ม implementation; ไม่ควรคำนวณจาก live rate ย้อนหลัง.

## 12. Phase-next placeholder: Leaderboard

ยังไม่ออกแบบคะแนนใน release นี้ เพื่อไม่ผูก gamification กับ metric ที่ยังไม่ได้ตกลง ใน Phase ถัดไปต้องกำหนดอย่างน้อย: scoring events, anti-gaming rules, role/data scope, time window, tie-break, audit/reversal เมื่อ deal ถูก reopen และ privacy ของรายบุคคล ก่อนเพิ่ม UI หรือ realtime event.
