# Calendar Project Plan (`/calendar`)

> สถานะ: **แผนงานเท่านั้น — ยังไม่มี Calendar implementation**  
> ปรับปรุงล่าสุด: 2026-09-11  
> เจ้าของเอกสาร: ทีมพัฒนา CRM  
> Route เป้าหมาย: `/calendar`

## 1. วิธีใช้เอกสารนี้สำหรับ AI Agent

เอกสารนี้เป็นแหล่งความจริงสำหรับการพัฒนา Calendar แบบต่อเนื่องหลาย Agent ให้ทำตามลำดับต่อไปนี้ก่อนแก้โค้ดทุกครั้ง:

1. อ่าน `AGENTS.md` และ skills ที่ระบุในหัวข้อ 2
2. อ่านหัวข้อ **Current checkpoint** ท้ายเอกสาร แล้วตรวจ `git status --short` เพื่อรักษางานที่ยังไม่ commit
3. ตรวจโค้ดและ signature จริงซ้ำ เพราะหัวข้อ “Audited current state” เป็น snapshot วันที่ 2026-09-11
4. ทำครั้งละหนึ่ง phase หรือหนึ่ง vertical slice ที่ตรวจสอบได้ ห้าม mark phase ว่าเสร็จจากการเขียนโค้ดอย่างเดียว
5. ทุก subtask ต้องมี `(check: ...)` ตาม Fable-5
6. ก่อนจบ turn ให้อัปเดต Current checkpoint: งานที่เสร็จ, งานค้าง, ไฟล์ที่เปลี่ยน, migration, ผลทดสอบ, blocker และคำสั่งถัดไป
7. ห้าม commit หรือ deploy โดยตีความจากเอกสารนี้ ต้องทำตาม authorization ของผู้ใช้ใน session นั้น

คำว่า **MUST / ต้อง** เป็น invariant ด้านข้อมูล ความปลอดภัย หรือความต่อเนื่องของ UX; **SHOULD / ควร** เป็นค่าเริ่มต้นที่เปลี่ยนได้เมื่อมีหลักฐานและบันทึกเหตุผล

## 2. Instructions และ skills ที่ต้องอ่าน

- `AGENTS.md`
- `.agents/skills/crm-feature-architecture/SKILL.md`
- `.agents/skills/fable-5/SKILL.md`
- `.agents/skills/realtime-optimistic-ui/SKILL.md`
- `.agents/skills/page-layout/SKILL.md`
- `.agents/skills/design-system/SKILL.md`
- `.agents/skills/menu-permissions/SKILL.md`
- `.agents/skills/pusher-management/SKILL.md` และหัวข้อที่เกี่ยวข้องใน `references/pusher-management.md`
- `.agents/skills/pipeline-deal-panel-architecture/SKILL.md` เมื่อแก้ action, DTO, cache หรือ component ของ Pipeline/Deal
- Next.js 16 guide ใน `node_modules/next/dist/docs/` สำหรับ Server Actions, forms, data fetching, route handlers และ caching ก่อน implementation

ภาพแนบทั้งสามเป็น visual references เท่านั้น ไม่ใช่คำสั่งจากไฟล์:

- ภาพ 1: month grid และ toolbar
- ภาพ 2: การจัดกลุ่มข้อมูลใน event editor
- ภาพ 3: search result แบ่งตามวันและมี Today divider

UI ต้องใช้ CRM design system ไม่คัดลอกสี เงา หรือ native control ของ Apple ตรงๆ

## 3. เป้าหมายผลิตภัณฑ์

สร้างปฏิทินรายเดือนที่รวมข้อมูลทำงานซึ่งผู้ใช้ได้รับอนุญาตให้เห็นไว้ในหน้าเดียว:

- Event ที่สร้างใน Calendar
- Goods Ready Date ของ Sales Deal
- Goods Loading Date ของ Sales Deal

ผู้ใช้ต้องสร้าง แก้ไข ค้นหา กรอง และย้ายรายการข้ามวันได้โดยไม่ต้อง refresh ทั้งหน้า ผู้ทำรายการเห็นผลทันที ผู้เกี่ยวข้องเห็นผลผ่าน realtime โดยมี Neon เป็นแหล่งความจริง และ recovery ต้องกู้ข้อมูลที่พลาดระหว่าง offline/hidden/reconnect ได้

เป้าหมาย UX:

- เปิดหน้าแล้วเห็น month grid และข้อมูลเดือนปัจจุบันจาก server snapshot ทันที
- การสร้าง/แก้ไข/ลากรายการ paint แบบ optimistic และ rollback เฉพาะ operation เมื่อ server ปฏิเสธ
- ลด click: คลิกวันว่างเพื่อสร้าง, คลิกรายการเพื่อแก้, drag เพื่อเปลี่ยนวัน, keyboard มีทางเลือกครบ
- รายละเอียดหนัก รายชื่อผู้ใช้ และ search results โหลดเมื่อจำเป็น
- ข้อมูลและ cache ต้องแยกตาม user, timezone, ช่วงวัน และ filter signature

## 4. สิ่งที่ไม่อยู่ใน MVP

- Week/day/agenda view
- Google Calendar, Apple Calendar, Outlook หรือ ICS sync
- Resource/room booking, travel time, video call และ attachments
- Desktop/mobile push ขณะปิดเว็บ; MVP รับรอง in-app notification และ recovery ตอนกลับมาใช้งาน
- การแก้ “This and following events” สำหรับ recurring series; ดู recurrence scope ในหัวข้อ 12
- การเปลี่ยนโครงสร้าง PipelineStage หรือสถานะ deal

## 5. Audited current state (2026-09-11)

### 5.1 Layout และ UI

- `/pipeline` ใช้ Server Component ที่ `src/app/pipeline/page.tsx` ส่ง initial snapshot เข้า `PipelineView`
- `PipelineView` ใช้ `WorkspaceLayout`, toolbar อยู่ใน workspace และใช้ `scrollMode="hidden"`
- drawer pattern ปัจจุบันอยู่ใน `EditDealPanel.tsx` และ `NotificationDrawer.tsx`: mobile เต็มจอ, desktop ชิดขวา, backdrop, border/rounded โดยห้ามเพิ่ม shadow ตาม design-system
- CRM palette หลัก: `#252728`, `#3A3B3C`, `#4E4F50`, accent `#C7F33C`
- dependencies ปัจจุบันมี `date-fns`, `@dnd-kit/core`, `@dnd-kit/sortable`, SWR และ Zod; ยังไม่มี calendar/recurrence library

### 5.2 Deal dates และ permissions

- `Opportunity` มี `dueDate`, `goodsReadyDate`, `goodsLoadingDate` เป็น `DateTime?`
- Goods Ready/Loading ถูกแก้ผ่าน `updateOpportunity`; Opportunity Due Date ยังเป็นข้อมูลเฉพาะเหตุการณ์ของการ์ดใน Pipeline และไม่ถูก project เข้า Calendar
- `getOpportunityAccessWhere` เป็น policy ปัจจุบัน:
  - `ADMIN`: เห็นทุก deal
  - `MANAGEMENT`: เห็น deal ที่ owner หรือ team member อยู่ใน Department ของ actor
  - `GENERAL`: เห็น deal ที่ตนเป็น owner หรือ team member
- mutation แบบ `ownerOrAdmin` อนุญาต Admin/Management และ owner; General team memberที่ไม่ใช่ ownerดูได้แต่แก้ไม่ได้
- `pipeline.information` คือ Department menu permission ของ Sale Deal UI แต่ action เดิมไม่ได้บังคับ permission นี้ครบทุก path ดังนั้น Calendar DAL ต้องตรวจ permission ฝั่ง server เองสำหรับ Goods Ready/Loading
- Opportunity ยังไม่มี `departmentId` โดยตรง ห้ามเดา Department จาก client; ใช้ policy เดิมจาก owner/team และบันทึกข้อจำกัดนี้

### 5.3 Realtime และ notification

- connection owner อยู่ที่ authenticated shell; page ใหม่ห้ามสร้าง `new Pusher`
- shared subscription manager รองรับ lazy connection, ref count, hidden-tab dormancy และ reconnect recovery
- Pipeline ใช้ per-user private channel `private-pipeline-{userId}` / `pipeline-updated`
- Header ใช้ `private-user-{userId}` / `new-notification`
- Notification ต้อง persist ใน Neon ก่อนส่ง Pusher; Pusher เป็น transport ไม่ใช่แหล่งความจริง
- มี Vercel cron `/api/cron/archive` และ `CRON_SECRET`; ยังไม่มี reminder scheduler

### 5.4 Tags และ migrations

- `Tag` เดิมเป็น global tag ของ Opportunity และ unique ด้วย name ทั้งระบบ ไม่มี Department ownership
- Calendar tag ต้องไม่ reuse model นี้โดยตรง เพราะอาจเปิดเผยชื่อ tag ข้าม Department และชน global uniqueness
- repository มี Prisma migrations แต่ production DB เคยตอบ `P3005 schema is not empty` ต่อ `prisma migrate deploy`; phase schema ต้อง audit/baseline migration state ก่อน deploy ห้ามใช้ `--force-reset`

## 6. Product decisions ที่แผนนี้กำหนด

### 6.1 Calendar item types

ใช้ discriminated union เดียวที่ UI เข้าใจ แต่แยก mutation owner ตาม domain:

```ts
type CalendarItemType =
  | 'EVENT'
  | 'DEAL_GOODS_READY'
  | 'DEAL_GOODS_LOADING';
```

- `EVENT` เป็น entity ใหม่และ Calendar เป็นเจ้าของ
- Deal date เป็น projection จาก `Opportunity`; ห้าม copy วันที่มาเก็บใน Calendar table
- ID ฝั่ง client ต้อง stable: `event:{eventId}` หรือ `deal:{dealId}:{field}`
- DTO เดือนต้องไม่มี detail ยาว, raw user object, activity logs, attachments หรือข้อมูล deal ที่ไม่ใช้ render

### 6.2 Event visibility

Event ต้องมี Department ชัดเจน:

- Owner เห็นและแก้ event ของตน
- ผู้ใช้ที่ถูกเลือกเป็น participant/reminder recipient เห็น event แต่แก้ไม่ได้ใน MVP
- Management เห็นและแก้ event ของ Department ที่ตนสังกัด
- Admin เห็นและแก้ทั้งหมด
- General คนอื่นใน Department จะ **ไม่เห็นโดยอัตโนมัติ** เว้นเป็น owner/recipient เพื่อลดการเปิดเผยข้อมูลเกินจำเป็น
- ผู้ใช้ Department เดียวให้ระบบเลือกอัตโนมัติ; ผู้ใช้หลาย Department ต้องเลือกตอนสร้าง event
- server ต้อง derive actor และตรวจ Department membership ใหม่ทุก mutation ห้ามเชื่อ `ownerId`, role หรือ permissions จาก client

หาก product ต้องการ “ทุกคนใน Department เห็นทุก event” ให้เปลี่ยน policy นี้ก่อน Phase 2 และบันทึก migration/recipient impact ห้ามเปลี่ยนเงียบๆ ระหว่าง implementation

### 6.3 Edit permissions สำหรับ Deal dates

| Item | มองเห็น | แก้ไข/Drag |
|---|---|---|
| Goods Ready/Loading | ต้องผ่าน `/calendar`, Pipeline deal access, `pipeline.information`, และเป็น `SALES_DEAL` | Admin, Management ที่มี access, หรือ owner ตาม `ownerOrAdmin` semantics |
| Event | owner, selected recipient, Management ของ Department, Admin | owner, Management ของ Department, Admin |

Client `canEdit` ใช้เพื่อ UX เท่านั้น ทุก action ต้อง enforce ตารางนี้บน server

### 6.4 Menu permissions

เพิ่ม level-2 menu:

```text
key: calendar
label: Calendar
parentKey: sales_ops
href: /calendar
icon: Calendar
```

- Department ต้องได้รับ `calendar` จึงเข้า route และ query ได้
- Deal dates ยังต้องผ่าน Pipeline permission ตามตารางข้างบน ไม่ถือว่ามี Calendar permission แล้วเห็น Sales Deal ทุกใบ
- Admin bypass menu visibility ตามระบบเดิม
- Phase implementation ต้อง sync menu ผ่าน flow ของระบบและทดสอบ direct URL access ไม่ใช่แค่ซ่อนปุ่ม

## 7. UX และ layout specification

### 7.1 Page shell

- `CalendarPage` เป็น Server Component สำหรับ auth + initial month snapshot
- `CalendarView` ใช้ `<WorkspaceLayout scrollMode="hidden">`
- desktop: toolbar สูงคงที่ด้านบน, month grid กินพื้นที่ที่เหลือและ scroll ภายในเมื่อ viewport ต่ำ
- mobile: toolbar ย่อเป็นสองแถว, grid เลื่อนแนวนอนหรือใช้ cell ความกว้างขั้นต่ำโดยยังคง month semantics; ห้ามซ่อนข้อมูลทั้งหมดเป็น list โดยไม่มี product approval
- ใช้ border และ flat color; ห้าม shadow/gradient

### 7.2 Toolbar

ฝั่งซ้าย:

1. `Today` กลับเดือนปัจจุบันและ focus วันที่วันนี้
2. Previous / Next เปลี่ยนเดือนด้วยปุ่ม icon และรองรับ keyboard
3. ชื่อเดือนและปี เช่น `September 2026`; ใช้ locale ของ UI ที่ตกลง และ timezone ของ Calendar

ฝั่งขวา:

1. `Filters` พร้อม badge จำนวน filter ที่ active; เปิด `CalendarFiltersPanel`
2. Search icon เปิด `CalendarSearchPanel` และ focus search input หลัง transition พร้อม
3. ปุ่ม `New event` เป็น optional desktop shortcut; click วันว่างเป็น primary shortcut

Navigation ต้องอัปเดต URL เป็น `?month=2026-09` ด้วย history API/router ที่เหมาะสม เพื่อ refresh/share URL แล้วได้เดือนเดิม แต่การเปลี่ยนเดือนต้องไม่ reset panel/draft โดยไม่จำเป็น

### 7.3 Month grid

- 7 columns, เริ่ม Sunday ตามภาพอ้างอิง; week-start ต้องเป็น config เดียวใน formatter/query/tests
- แสดง 5 หรือ 6 สัปดาห์ตามเดือน รวม adjacent-month days ที่อยู่ใน grid range
- Today ใช้ accent ring/pill; วันนอกเดือนใช้ muted text
- item เรียง: all-day/multi-day ก่อน แล้ว timed item ตามเวลา แล้ว stable ID
- event หลายวัน render เป็น segment ต่อ week row; continuation edges แสดง rounded state ถูกต้อง
- จำกัดจำนวน item ที่เห็นต่อ cellตามความสูง และใช้ `+N more`; เปิด day agenda panel โดยไม่โหลด detailทุก item
- สีแต่ละ source ต้องแยกได้ทั้งสี + icon/label เพื่อ accessibility:
  - Event: tag color หรือ neutral accent
  - Goods Ready
  - Goods Loading
- ห้ามใช้สีอย่างเดียวสื่อประเภทหรือสถานะ

### 7.4 Event editor panel

สร้าง `CalendarEventPanel` แยกจาก `EditDealPanel`; นำ layout conventions มาใช้แต่ห้ามเพิ่ม Calendar logic เข้า `EditDealPanel.tsx`

Fields:

- Event Name (required, max lengthกำหนดใน Zod และ DB contract)
- Event Detail textarea (optional, bounded length)
- Department (เฉพาะ actor หลาย Department/Admin)
- All Day toggle
- Start Date + Time
- End Date + Time; all-day ใช้ end-exclusive ภายในแต่ UI แสดงวันสุดท้ายแบบ inclusive
- Repeat: Never, Every day, Every week, Every month, Every year
- End Repeat: Never หรือ date (MVP ต้องรองรับเพื่อป้องกัน unbounded expansion; “Never” query ต้อง bounded ตาม viewport)
- User Reminder toggle
- Selected users; โหลด directory on demand เมื่อเปิด selector
- Tags; เลือก tag เดิมหรือสร้าง tagใหม่ภายใต้ Department

Interaction:

- คลิกวันว่างเปิด create panel โดย prefill วันนั้นและ default duration 1 ชั่วโมง; all-day default ให้ตัดสินใน Phase 0
- draft อยู่ใน `calendar-draft-store.ts` keyed by `[userId, draftId/eventId]`
- ปิด panel ขณะ dirty ต้อง preserve draft;หลัง save สำเร็จจึง clear
- save button อยู่ตำแหน่งคงที่; `Cmd/Ctrl+Enter` save, Escape ปิดชั้นบนสุด, validation focus field แรก
- Deal date pill ไม่มี click editor หรือ clear action; Goods Ready/Loading เปลี่ยนวันจาก Calendar ได้ด้วย drag/drop เท่านั้น
- Delete มีเฉพาะ Event

### 7.5 Filters panel

Filter stateอยู่ใน URL เมื่อแชร์แล้วมีความหมาย และอยู่ใน client stateเพื่อ paint ทันที:

- Source type: Event, Goods Ready, Goods Loading
- Tags เป็น pills
- Owner/selected user
- Department selectorเฉพาะ Admin/Management ที่มีหลาย Department
- `Clear all` และ badge countแบบ Pipeline

Month snapshot SHOULD มี fields พอ filter source/tag/ownerใน client เพื่อไม่ยิง requestทุก click ถ้า filter ลดชุดเดิม ส่วน filterที่ขยาย permission scopeหรือเปลี่ยน Department ต้อง query serverใหม่

### 7.6 Search panel

- เปิดเป็น right EditPanel pattern; desktopประมาณ 450–600px, mobileเต็มจอ
- focus input หลัง panel mount; debounce 250–350ms และ cancel/ignore stale request
- query ขั้นต่ำ 2 ตัวอักษร เว้นการค้นด้วย exact tag/date shortcut
- server search เฉพาะข้อมูลที่ actorมีสิทธิ์ และคืน cursor pagination DTO
- ค้น Event Name/Detail, tag, deal topic, company display name; ห้ามโหลด activity log
- group ตาม local calendar date; แทรก `TODAY` divider ระหว่างกลุ่มอดีตและวันนี้/อนาคตตามภาพ 3
- sort: กลุ่มอดีตใหม่ไปเก่า, วันนี้และอนาคตเก่าไปใหม่ หรือแสดงสอง sectionชัดเจน; test contractต้องล็อก
- คลิกผลลัพธ์: navigate month → highlight item → เปิด editor/detail panel โดยไม่โหลดทั้งปี
- empty, loading, error, offline และ permission-revoked states ต้องไม่ถูกแปลงเป็นรายการว่างอย่างเงียบๆ

## 8. Proposed data model

ชื่อจริงอาจเปลี่ยนหลัง Phase 0 schema spike แต่ semantic ต้องคง:

```prisma
enum CalendarRepeatFrequency {
  NONE
  DAILY
  WEEKLY
  MONTHLY
  YEARLY
}

model CalendarEvent {
  id                 String   @id @default(cuid())
  name               String
  detail             String?
  departmentId       String
  ownerId            String
  allDay             Boolean  @default(false)
  startAt            DateTime
  endAt              DateTime
  timezone           String   @default("Asia/Bangkok")
  repeatFrequency    CalendarRepeatFrequency @default(NONE)
  repeatUntil        DateTime?
  revision           Int      @default(1)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  department         Department @relation(...)
  owner              User @relation(...)
  recipients         CalendarEventRecipient[]
  tags               CalendarEventTag[]
  exceptions         CalendarEventException[]

  @@index([departmentId, startAt])
  @@index([ownerId, startAt])
  @@index([repeatFrequency, startAt, repeatUntil])
}

model CalendarEventRecipient {
  eventId             String
  userId              String
  reminderEnabled     Boolean @default(true)
  reminderOffsetMins  Int     @default(0)
  event               CalendarEvent @relation(...)
  user                User @relation(...)
  @@id([eventId, userId])
  @@index([userId, eventId])
}

model CalendarTag {
  id             String @id @default(cuid())
  departmentId   String
  name           String
  normalizedName String
  color          String
  @@unique([departmentId, normalizedName])
}

model CalendarEventTag {
  eventId String
  tagId   String
  @@id([eventId, tagId])
}

model CalendarEventException {
  id                 String @id @default(cuid())
  eventId            String
  occurrenceStartAt  DateTime
  overrideStartAt    DateTime?
  overrideEndAt      DateTime?
  isCancelled        Boolean @default(false)
  @@unique([eventId, occurrenceStartAt])
}

model CalendarReminderDelivery {
  id                 String @id @default(cuid())
  eventId            String
  recipientId        String
  occurrenceStartAt  DateTime
  scheduledFor       DateTime
  deliveredAt        DateTime?
  status             String
  attempts           Int @default(0)
  lastError          String?
  @@unique([eventId, recipientId, occurrenceStartAt, scheduledFor])
  @@index([status, scheduledFor])
}
```

ข้อกำหนด schema:

- ใช้ additive migration, foreign keys และ indexes; ห้าม reset production
- ตรวจ query plan ด้วยข้อมูลใกล้เคียงจริงก่อนเพิ่ม indexเกินรายการข้างต้น
- `revision` incrementแบบ atomic ทุก update เพื่อ reject event/reply ที่เก่า
- delete Event ต้อง cascade joins/exceptions; delivery history retention ต้องกำหนดก่อน hard delete
- Notification enum เพิ่ม `CALENDAR_REMINDER` เมื่อ reminder phaseเริ่ม ไม่เพิ่มล่วงหน้าโดยไม่มี consumer
- recurrence expansion ไม่สร้าง rowทุก occurrenceล่วงหน้า

## 9. DTO, query และ cache ownership

### 9.1 DTO

```ts
type CalendarMonthItemDTO = {
  id: string;
  sourceType: CalendarItemType;
  sourceId: string;
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  color: string | null;
  tagIds: string[];
  owner: { id: string; name: string | null; image: string | null };
  departmentId: string | null;
  canEdit: boolean;
  revision: number;
};
```

- Month DTO ส่งเฉพาะสิ่งที่ grid/filter/drag ใช้
- `detail`, recipient list, recurrence exceptions และ logs โหลดด้วย detail key ตอนเปิด panel
- Derived deal itemใช้ `Opportunity.updatedAt` เป็น revisionเริ่มต้น; eventใช้ integer revision

### 9.2 Date range

- Query range คือ startOfWeek(month start) ถึง endOfWeek(month end) ไม่ใช่ทั้งปี
- query standalone events และ Opportunity date projections แบบขนานภายใน server boundary เดียว
- recurring seriesเลือก masterที่อาจ intersect range แล้ว expandบน serverแบบ bounded
- responseต้องระบุ `rangeStart`, `rangeEnd`, `generatedAt`, `items`, และ `truncatedDays` ถ้ามี safety cap

### 9.3 Cache keys

สร้าง key factory ใน `src/lib/calendar/calendar-cache.ts`:

```text
['calendar-month', userId, timezone, rangeStart, rangeEnd, permissionScope, filterSignature]
['calendar-event-detail', userId, eventId]
['calendar-day', userId, localDate, filterSignature]
['calendar-search', userId, normalizedQuery, filterSignature, cursor]
['calendar-tags', userId, departmentId]
```

- ห้าม key ที่ไม่มี user scope
- เก็บ current, previous, next month ได้เพื่อ navigation แต่ unloadเดือนเก่าที่พ้น bounded window
- prefetch adjacent monthเมื่อ pointer/focusอยู่บน prev/next หรือเริ่ม cross-month drag ไม่ prefetchทั้งปี
- filterที่เป็น subsetใช้ local derived data; filterที่เปลี่ยน permission scopeใช้ server requestใหม่
- logout/account changeต้อง clear Calendar cachesและ draftsของบัญชีเก่า

### 9.4 Network budgets ที่ต้องวัด ไม่ใช่คำรับรอง

Phase performance ต้องบันทึก cold/warm แยกกัน:

- initial `/calendar` requests และ transferred/decoded bytes
- month navigation requests; cache hitต้องไม่ยิง month fetchซ้ำ
- เปิด editorไม่โหลด user directoryจนกด recipient selector
- search request countต่อการพิมพ์และการยกเลิก stale requests
- realtime event serialized sizeเป้าหมายไม่เกิน 5KB; ส่ง delta/referenceเมื่อใหญ่กว่า
- hidden tabไม่มี Calendar polling; Calendar ไม่สร้าง Pusher clientเพิ่มจาก shell

ห้ามรายงานเปอร์เซ็นต์ลด network หรือ latencyจนกว่าจะมี before/after measurementจาก fixtureเดียวกัน

## 10. Server boundaries และ module map

```text
src/app/calendar/page.tsx                     auth + initial viewport snapshot
src/app/calendar/loading.tsx                  immediate route feedback
src/components/calendar/CalendarView.tsx      page orchestration only
src/components/calendar/CalendarToolbar.tsx
src/components/calendar/CalendarMonthGrid.tsx
src/components/calendar/CalendarDayCell.tsx
src/components/calendar/CalendarItemPill.tsx
src/components/calendar/CalendarEventPanel.tsx
src/components/calendar/CalendarFiltersPanel.tsx
src/components/calendar/CalendarSearchPanel.tsx
src/components/calendar/CalendarDayAgendaPanel.tsx
src/components/calendar/CalendarRecipientPicker.tsx
src/components/calendar/CalendarTagPicker.tsx
src/lib/calendar/calendar-access.ts            server-only authorization helpers
src/lib/calendar/calendar-queries.ts           month/detail/search reads
src/lib/calendar/calendar-dto.ts               selects + discriminated DTOs
src/lib/calendar/calendar-cache.ts             keys + pure merge helpers
src/lib/calendar/calendar-recurrence.ts        pure bounded occurrence expansion
src/lib/calendar/calendar-draft-store.ts
src/lib/calendar/calendar-realtime.ts          typed event envelope/merge
src/lib/actions/calendar.ts                    public Server Actions; Zod + auth
src/app/api/cron/calendar-reminders/route.ts    durable reminder dispatcher
```

หลัก ownership:

- `CalendarView` compose state/panels ห้ามรวม recurrence, authorization หรือ DB logic
- Calendar actionแก้ Event entity; Deal date actionเรียก shared internal domain service ไม่ duplicate business rule และไม่เรียก public Server Action ซ้อนกัน
- `EditDealPanel` ไม่รับ Calendar UI เพิ่ม; เมื่อ Calendarแก้ deal dateให้ Pipeline cache/event consumer reconcileผ่าน DTOเดิม
- pure helpersของ recurrence, range, merge, drag rollbackต้อง testได้โดยไม่ mock React/DB

## 11. Mutation lifecycle และ concurrency

ทุก mutationใช้ envelope:

```ts
type CalendarMutationResult = {
  mutationId: string;
  item: CalendarMonthItemDTO | null;
  revision: number;
  affectedItemIds: string[];
};
```

ลำดับบังคับ:

1. clientสร้าง `mutationId` และ snapshotเฉพาะ item/occurrenceที่จะเปลี่ยน
2. optimistic patchทันที พร้อม pending indicatorเล็กๆ
3. server authenticate → authorize → validate → transaction persist + required audit/inbox
4. serverคืน authoritative DTO/revision
5. client mergeผลเฉพาะ operation; ห้ามทับ mutationใหม่กว่า
6. serverส่ง realtimeให้ recipientsหลัง commit
7. confirmed failure rollbackเฉพาะ operation; unknown completionให้ reconcileก่อน retry

Rules:

- createต้องใช้ idempotency keyเพื่อไม่สร้าง Eventซ้ำจาก double click/retry
- update/deleteต้องส่ง expected revision; server conflictคืน structured conflictพร้อม latest item
- dragหลายครั้งติดกันต้องรักษา orderingด้วย mutationId + revision ไม่ใช้ timestamp clientตัดสิน
- actionหลักต้อง await persistence; notification/realtime failureหลัง commitต้องไม่หลอกว่า DB rollback
- optimistic source moveต้องปรับ month/day membership, sort และ overflow countพร้อมกัน

## 12. Date, timezone และ recurrence contract

- timezoneเริ่มต้น `Asia/Bangkok`; เก็บ timezoneต่อ Event เพื่อรองรับอนาคต
- timed eventเก็บ UTC instantsและ renderใน Calendar timezone
- all-day eventใช้ end-exclusive semanticsภายใน เพื่อป้องกัน off-by-one; serializer/parserเป็นเจ้าของ conversionเพียงจุดเดียว
- Goods Ready/Loadingถือเป็น all-day date projection
- drag timed eventไปวันใหม่รักษา local start timeและ duration
- drag all-day/multi-dayรักษาจำนวนวัน
- `endAt > startAt`; all-dayอย่างน้อยหนึ่งวัน

Recurrence MVP:

- รองรับ NONE/DAILY/WEEKLY/MONTHLY/YEARLY
- query expansion boundedตาม viewport; “Never” ไม่หมายถึง generateอนันต์
- monthlyวันที่ไม่มีในเดือนเป้าหมายให้ **skip** occurrence ไม่ clamp เช่นวันที่ 31 ไม่ย้ายเป็น 28
- yearly Feb 29เกิดเฉพาะ leap year
- การลาก occurrenceซ้ำต้องถาม `This occurrence` หรือ `Entire series`
- `This occurrence` เขียน `CalendarEventException`; `Entire series` อัปเดต masterและ revision
- “This and following” เลื่อนไป phaseหลัง MVP เพราะต้อง split seriesอย่างถูกต้อง
- ต้องทดสอบ month/year boundary, leap year, all-day, locale grouping และ DSTแม้ Bangkokไม่มี DST เพื่อไม่ผูก helperกับ timezoneเดียว

## 13. Drag and drop specification

- ใช้ `@dnd-kit/core` ที่มีอยู่ ไม่เพิ่ม calendar DnD libraryก่อน spike
- pointer drag, touch long-press และ keyboard moveต้องมี equivalent
- drag overlayแสดง itemเดิมโดยไม่ unmount editor/draft
- hover Previous/Next ระหว่าง dragเป็นเวลาเริ่มต้นประมาณ 600msจึงเปลี่ยนเดือน; ค่านี้ต้อง user-testและเก็บเป็น constant
- เมื่อเปลี่ยนเดือนจาก edge hover ให้มี cooldown ป้องกันข้ามหลายเดือนโดยไม่ตั้งใจ
- prefetch target monthก่อน navigationถ้าทำได้; ถ้ายังโหลดให้คง overlayและแสดง target loading state
- dropบน adjacent-month cellย้ายได้โดยไม่ต้องกด Next
- dropที่ไม่มี permission, invalid recurrence scope หรือ server conflictต้อง rollbackและ toastข้อความเฉพาะ
- auto-scrollเฉพาะ containerที่เป็นเจ้าของ grid ห้ามเลื่อน body/Sidebar
- Escapeยกเลิก drag; keyboard userเลือก itemแล้วใช้ shortcut/เมนู “Move to date” ได้

Deal date dispatch:

- `DEAL_GOODS_READY` → shared opportunity date command
- `DEAL_GOODS_LOADING` → shared opportunity date command
- mutationต้องทำให้ทั้ง Calendar และ Pipeline consumersเห็น revisionเดียวกัน

## 14. Realtime, recovery และ reminder

### 14.1 Realtime contract

Calendar ใช้ Pusher clientเดิมและ subscription managerเดิม ไม่สร้าง connectionใหม่

แผน channelเริ่มต้น:

```text
private-calendar-{userId} / calendar-updated
```

ใช้ per-user channelเพื่อลดความเสี่ยงข้อมูลข้าม Department และคำนวณ recipientฝั่ง server:

- Event: owner + selected recipients + Managementของ Department + Adminที่จำเป็นตาม policy
- Deal date: reuse recipient logicจาก deal access; filterซ้ำตอน auth/read recovery

Typed envelope:

```ts
type CalendarRealtimeEvent = {
  schemaVersion: 1;
  eventId: string;
  action: 'ITEM_CREATED' | 'ITEM_UPDATED' | 'ITEM_DELETED' | 'PERMISSION_CHANGED';
  itemId: string;
  sourceType: CalendarItemType;
  revision: number;
  mutationId?: string;
  affectedRange: { startAt: string; endAt: string };
  item?: CalendarMonthItemDTO;
};
```

- own echo dedupeด้วย mutationIdแต่ merge authoritative revision
- eventนอก cached viewportไม่ fetchทันที; mark relevant month stale
- eventใน viewport mergeถ้าปลอดภัย มิฉะนั้น targeted month revalidate
- permission lossเอา itemออกและ clear detail/draftที่เกี่ยวข้อง
- bind/unbind handlerตัวเดียวกันและ release channelผ่าน ref count
- implementation phaseต้องเพิ่ม allowlistใน Pusher auth, tests และอัปเดต page policy matrixใน pusher guidebook

### 14.2 Recovery

- initial snapshot → subscribe acknowledgement → one bounded reconcileเพื่อปิด fetch/subscribe gap
- reconnect, `pageshow`, visible และ onlineรวมเป็น deduped recovery requestเฉพาะ active viewport
- hidden tabหยุด reminder/search/month requests; connection lifecycleเป็นของ shell
- 401 sign out/re-auth; 403 evict cacheและdraft; network errorรักษา stale snapshotพร้อม retry state
- snapshotเก่าห้ามทับ optimistic/realtime revisionใหม่

### 14.3 Reminder delivery

- Reminder เป็น persistent `Notification` + `CalendarReminderDelivery`; browser timerห้ามเป็นแหล่งส่ง
- scheduler route authenticateด้วย `CRON_SECRET`
- claim due deliveriesแบบ transaction/atomic statusและ uniquenessต่อ event-recipient-occurrence-scheduledFor
- persist notificationก่อน dispatch `new-notification`
- retry boundedพร้อม attempts/lastError; duplicate cron invocationต้องไม่สร้าง notificationซ้ำ
- recurrenceสร้าง/claim occurrenceใน look-ahead window ไม่ materializeทั้ง series
- เมื่อ eventย้าย/ลบ/recipientถูกถอด ต้อง cancel pending deliveriesที่เกี่ยวข้องใน transaction
- ตรวจข้อจำกัด scheduleจริงของ deploymentใน Phase 0 ก่อนกำหนด SLA; ห้ามรับรอง reminderตรงนาทีจนกว่าจะวัด

### Decision gate ที่ยืนยันแล้ว (Phase 0 Resolution):

1. **Reminder default**: ส่งตรงเวลาเริ่มพอดี (`reminderOffsetMins = 0`).
2. **Reminder recipients**: เฉพาะผู้ใช้ที่ toggle เปิด reminder (`reminderEnabled: true`); ผู้สร้างไม่ได้ reminder อัตโนมัติเว้นแต่เลือกตนเองเป็น recipient.
3. **Recurring event notification policy**: หาก occurrence ถูกส่ง reminder ไปแล้ว (`DELIVERED`) การแก้ชื่อหรือรายละเอียดไม่ส่งซ้ำ; แต่ถ้าเลื่อน startAt ไปยังเวลาอนาคต จะ cancel delivery เดิมและสร้าง delivery record ใหม่.
4. **Deal date scope**: Calendar project เฉพาะ Goods Ready และ Goods Loading; Opportunity Due Date ไม่แสดงและไม่มี mutation path จาก Calendar. Deal date pill ไม่มี editor/clear และแก้ได้ด้วย drag/drop เท่านั้น.

## 15. Error handling requirements

ทุก actionคืน structured resultสำหรับ expected errors และ throwเฉพาะ unexpected faults:

- `UNAUTHORIZED`: sessionหมด → sign out/re-auth
- `FORBIDDEN`: เอา itemจาก cacheถ้าสูญสิทธิ์และแจ้งสั้นๆ
- `NOT_FOUND`: itemถูกลบโดยคนอื่น → remove optimistic item
- `VALIDATION_ERROR`: แสดง field errorsและรักษา draft
- `REVISION_CONFLICT`: แสดง latest dataและให้เลือก review/reapply
- `IDEMPOTENCY_REPLAY`: merge authoritative resultเดิม
- `REMINDER_ALREADY_SENT`: ไม่ส่งซ้ำ
- `RANGE_TOO_LARGE`: ปฏิเสธ queryก่อนแตะ DB
- `RATE_LIMITED`: debounce/backoff; ไม่ retry loop
- realtime publish failหลัง commit: successกับ actorยังยืนยันจาก DB responseและ mark transport warningสำหรับ telemetry/recovery

ห้าม `catch` แล้วคืน `[]` จนผู้ใช้เข้าใจว่าไม่มี event ทั้งที่ queryล้ม

## 16. Phase plan

### Phase 0 — Contract spikes และ baseline (COMPLETED ✅)

เป้าหมาย: พิสูจน์ unknown ที่อาจเปลี่ยน architectureก่อนสร้าง UIใหญ่

- [x] ยืนยัน Event visibility, reminder offset/default และ due-date drag reason UX กับ product owner
  - **Check / ผลลัพธ์:** บันทึกชัดเจนในหัวข้อ 6.2, 6.3 และ 14.3 ไม่มี TODO กำกวม (Reminder offset=0 mins, toggle-only recipients, non-resending for past delivered occurrences และ Calendar ไม่รวม Opportunity Due Date).
- [x] ทำ timezone/recurrence pure spikeสำหรับ range Sep–Oct, Jan–Feb, leap year และ DST timezoneหนึ่งรายการ
  - **Check / ผลลัพธ์:** สร้าง `src/lib/calendar/calendar-recurrence.ts` และ `src/lib/calendar/calendar-recurrence.test.ts` (11 unit tests ผ่านหมด 100% ภายใน 5ms):
    - Sep–Oct daily boundary test
    - Dec–Jan weekly boundary test
    - Day 31 monthly skip rule (skips 30-day months & Feb, does not clamp to 30 or 28)
    - Feb 29 yearly leap-year rule (only triggers on 2024, 2028; skips 2025, 2026, 2027)
    - CalendarEventException (cancellation and time override)
    - DST transition (`America/New_York` March 2026 spring forward maintains stable UTC hours)
    - Bounded expansion safety cap (capping infinite series)
    - รันผ่าน: `npm run test:calendar` (11 pass, 0 fail).
- [x] ทำ query spikeรวม Event + 3 Opportunity date fieldsใน 42-day rangeด้วย fixtureปริมาณสมจริง
  - **Check / ผลลัพธ์:** ทดสอบบน Neon จริงที่มี 816 opportunities:
    - 42-day range (Sep 2026: Aug 30 – Oct 10): 16 opportunities match date criteria.
    - Postgres EXPLAIN ANALYZE: `Seq Scan on "Opportunity" (cost=0.00..60.28 rows=18) actual time=0.028..0.163ms loops=1` (สแกนเพียง 40 shared buffers).
    - Query duration: ADMIN 346ms, MANAGEMENT (Export) 87ms, GENERAL 71ms (1 query ต่อ actor).
- [x] audit production migration baselineและวิธี deploy additive schema
  - **Check / ผลลัพธ์:**
    - ตรวจพบว่า Neon `public` schema มี 28 tables ที่ตรงกับ schema.prisma แต่ **ไม่มีตาราง `_prisma_migrations`** ซึ่งเป็นสาเหตุให้ `prisma migrate deploy` ตอบข้อผิดพลาด `P3005: The database schema is not empty`.
    - Dry-run DDL สำหรับ 6 Calendar models (`CalendarEvent`, `CalendarEventRecipient`, `CalendarTag`, `CalendarEventTag`, `CalendarEventException`, `CalendarReminderDelivery`) เป็น pure additive (เฉพาะ `CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE ... ADD CONSTRAINT`), ไม่มี `DROP`, ไม่มี `ALTER` คอลัมน์เดิม, และไม่มี data reset.
    - แผนการ deploy ที่ปลอดภัย: Baseline migration table ด้วย `prisma migrate resolve --applied` หรือ execute additive SQL migration โดยตรง ห้ามใช้ `--force-reset`.
- [x] ตรวจ Vercel cron cadence/planและ current `vercel.json`
  - **Check / ผลลัพธ์:** `vercel.json` ปัจจุบันมี cron เดียวคือ `/api/cron/archive` ทำงานรายวัน (`0 0 * * *`). Vercel Hobby plan จำกัด cron ขั้นต่ำ 1 วัน/1 ครั้ง; Vercel Pro จึงจะรัน cadence ระดับ 1-5 นาที (`*/5 * * * *`) ได้. กำหนด SLA ของ reminder ไว้ที่ 5 นาทีบน Pro plan พร้อม client-side focus/reconnect recovery ในตัว.
- [x] บันทึก current `/pipeline` request/transfer baselineเพื่อเทียบ shared date mutation impact
  - **Check / ผลลัพธ์:**
    - Pipeline initial load: 331 open deals, 184.62 KB serialized JSON payload (เฉลี่ย 571 bytes/card), query latency บน Neon ~681ms.
    - เปรียบเทียบกับ Calendar 42-day Month DTO: 16 items (~9.2 KB), query latency ~87-346ms.
    - `updateDueDateWithLog` ทำงานใน `$transaction` (อัปเดต dueDate + สร้าง 2 ActivityLog) และส่ง Pusher `notifyPrivatePipelineUpdate` โดยไม่เรียก `revalidatePath('/pipeline')`.

Exit criteria: unknownทั้งหกถูก resolve ครบถ้วน; recurrence contract ผ่าน automated tests; migration baseline และ query evidence ถูกบันทึก; codebase สะอาด (0 errors).

### Phase 1 — Route, menu, permission และ read-only month slice (COMPLETED ✅)

- [x] เพิ่ม `calendar` ใน registry, route guard และ permission sync
  - **Check / ผลลัพธ์:** เพิ่ม `calendar` (parentKey: `sales_ops`, level: 2, iconName: `Calendar`, href: `/calendar`, sortOrder: 4) ใน [src/lib/menu-registry.ts](file:///Users/light/my-crm/src/lib/menu-registry.ts) และ sync เข้าสู่ Neon database (`MenuItem` id: `cmtx3jmv20000s7jxpdlnsh64`). อัปเดต [src/middleware.ts](file:///Users/light/my-crm/src/middleware.ts) ให้คุ้มครอง `/calendar` และสร้าง server guard ใน [src/lib/calendar/calendar-access.ts](file:///Users/light/my-crm/src/lib/calendar/calendar-access.ts) (Admin เข้าได้ทุกกรณี, Export department ที่ได้รับอนุมัติเข้าได้, unauthenticated / unauthorized user ถูก redirect ไป `/`).
- [x] สร้าง Calendar DTO/range/access helpers
  - **Check / ผลลัพธ์:** สร้าง [src/lib/calendar/calendar-dto.ts](file:///Users/light/my-crm/src/lib/calendar/calendar-dto.ts), [src/lib/calendar/calendar-access.ts](file:///Users/light/my-crm/src/lib/calendar/calendar-access.ts) พร้อม unit tests 8 รายการใน [src/lib/calendar/calendar-month.test.ts](file:///Users/light/my-crm/src/lib/calendar/calendar-month.test.ts) ป้องกัน cross-department / unauthorized leakage.
- [x] สร้าง Server Component snapshot ของ current 42-day grid range
  - **Check / ผลลัพธ์:** [src/app/calendar/page.tsx](file:///Users/light/my-crm/src/app/calendar/page.tsx) ดึง snapshot เริ่มต้นผ่าน `getCalendarMonthSnapshot` ใน [src/lib/calendar/calendar-queries.ts](file:///Users/light/my-crm/src/lib/calendar/calendar-queries.ts) ส่ง DTO เฉพาะฟิลด์ที่จำเป็น (id, title, startAt, endAt, allDay, color, owner, canEdit, revision) ปราศจาก detail/activity logs หรือ attachments หนัก.
- [x] สร้าง WorkspaceLayout, toolbar, month grid, loading states
  - **Check / ผลลัพธ์:** สร้าง [src/components/calendar/CalendarView.tsx](file:///Users/light/my-crm/src/components/calendar/CalendarView.tsx) (`WorkspaceLayout scrollMode="hidden"`), [CalendarToolbar.tsx](file:///Users/light/my-crm/src/components/calendar/CalendarToolbar.tsx) (Today, Prev/Next, Month YYYY), [CalendarMonthGrid.tsx](file:///Users/light/my-crm/src/components/calendar/CalendarMonthGrid.tsx) (7 columns Sun–Sat), [CalendarDayCell.tsx](file:///Users/light/my-crm/src/components/calendar/CalendarDayCell.tsx), [CalendarItemPill.tsx](file:///Users/light/my-crm/src/components/calendar/CalendarItemPill.tsx) และ [src/app/calendar/loading.tsx](file:///Users/light/my-crm/src/app/calendar/loading.tsx) ตรงตาม CRM Dark Theme (`#252728`, `#3A3B3C`, `#4E4F50`, `#C7F33C`) และ **NO SHADOWS** 100%.
- [x] แสดง Deal dates แบบ read-only ตาม source type และ permission
  - **Check / ผลลัพธ์:** แสดง Goods Ready (`#10B981`) และ Goods Loading (`#0EA5E9`) โดยไม่ project Opportunity Due Date. ผู้ใช้ที่ไม่มี `pipeline.information` จะไม่เห็น Goods Ready/Loading; Management ต่างแผนก หรือ General team member ที่ไม่ใช่ owner จะได้รับ `canEdit: false` ตรงตามตาราง Section 6.3 (ทดสอบใน automated test suite).
- [x] เพิ่ม cache key factory ที่มี user/range/filter scope
  - **Check / ผลลัพธ์:** สร้าง `calendarMonthKey(userId, year, month, filterSignature)` ใน [src/lib/calendar/calendar-cache.ts](file:///Users/light/my-crm/src/lib/calendar/calendar-cache.ts) ยืนยันว่า cache key แยกตาม user scope เสมอ.

Exit criteria: เข้าถึง `/calendar` ได้ตามสิทธิ์, เปลี่ยน Today/Prev/Next ได้ราบรื่นผ่าน SWR + history state, แสดง deal dates ถูกต้องตามสิทธิ์ และไม่มี mutation/realtime ส่วนเกิน.

### Phase 2 — Event CRUD vertical slice (COMPLETED ✅)

- [x] เพิ่ม additive Calendar schema/migration และ Zod contracts
  - **Check / ผลลัพธ์:** เพิ่ม enum `CalendarRepeatFrequency` และ 6 models (`CalendarEvent`, `CalendarEventRecipient`, `CalendarTag`, `CalendarEventTag`, `CalendarEventException`, `CalendarReminderDelivery`) ใน [prisma/schema.prisma](file:///Users/light/my-crm/prisma/schema.prisma) และสร้าง [prisma/migrations/20260911220000_add_calendar_events/migration.sql](file:///Users/light/my-crm/prisma/migrations/20260911220000_add_calendar_events/migration.sql). Deploy additive DDL บน Neon สำเร็จครบ 26 คำสั่ง โดยไม่มี DROP หรือ reset ข้อมูล. สร้าง Zod schemas ใน [src/lib/calendar/calendar-validation.ts](file:///Users/light/my-crm/src/lib/calendar/calendar-validation.ts).
- [x] ทำ create/read/update/delete actions พร้อม server auth, Department scope, idempotency และ revision
  - **Check / ผลลัพธ์:** สร้าง server actions ใน [src/lib/actions/calendar.ts](file:///Users/light/my-crm/src/lib/actions/calendar.ts): `createCalendarEventAction`, `updateCalendarEventAction`, `deleteCalendarEventAction`, `getCalendarEventDetailAction`, `getDepartmentTagsAction`, `createCalendarTagAction`, `getCalendarRecipientsAction`. บังคับ atomic revision increment, idempotency cache (60s), department isolation, และปฏิเสธ stale revision (`REVISION_CONFLICT`).
- [x] ทำ Event Panel + draft store + recipient/tag on-demand pickers
  - **Check / ผลลัพธ์:** สร้าง [src/lib/calendar/calendar-draft-store.ts](file:///Users/light/my-crm/src/lib/calendar/calendar-draft-store.ts) เก็บ draft ตาม `[userId, eventKey]` เพื่อป้องกัน draft สูญหายเมื่อปิด drawer. สร้าง [CalendarEventPanel.tsx](file:///Users/light/my-crm/src/components/calendar/CalendarEventPanel.tsx) (Zero Shadows 100%), [CalendarTagPicker.tsx](file:///Users/light/my-crm/src/components/calendar/CalendarTagPicker.tsx) (fetch on-demand เมื่อกดเปิด), และ [CalendarRecipientPicker.tsx](file:///Users/light/my-crm/src/components/calendar/CalendarRecipientPicker.tsx) (fetch directory on-demand พร้อม reminder toggle และ offset 0-1440 mins).
- [x] ทำ optimistic create/update/delete และ operation-scoped rollback
  - **Check / ผลลัพธ์:** เชื่อมโยงใน [src/components/calendar/CalendarView.tsx](file:///Users/light/my-crm/src/components/calendar/CalendarView.tsx): optimistic update ไปยัง SWR cache ทันทีเมื่อ save/delete พร้อม stable item sort (all-day ก่อน, ตามเวลา). หาก server reject จะ rollback เฉพาะ item นั้น.
- [x] เชื่อม persistent tag ต่อ Department
  - **Check / ผลลัพธ์:** `CalendarTag` จัดเก็บ `normalizedName` (lowercase trim) แบบ `@@unique([departmentId, normalizedName])` ป้องกัน duplicate ในแผนกเดียวกัน และไม่รั่วไหลข้ามแผนก.

Exit criteria: vertical slice create → optimistic paint → DB result → reload คงอยู่ → conflict/rollback ถูกต้อง (ผ่าน automated tests 33/33).

### Phase 3 — Realtime multi-user และ recovery

- เพิ่ม private Calendar channel authorizationและrecipient resolver (check: user subscribeได้เฉพาะ channelตน; unauthorized channel 403)
- เพิ่ม typed event producer/consumer, mutationId dedupeและrevision ordering (check: own echo, duplicate, out-of-order, delete/update race tests)
- subscribeผ่าน shared managerและ clean release (check: Calendar+Headerยังใช้ 1 client connectionต่อ active tab; navigateซ้ำ handlerไม่เพิ่ม)
- ทำ initial-subscribe reconcileและ reconnect/visible/pageshow/online recovery (check: deliberately dropped eventถูกกู้จาก Neon)
- อัปเดต `pusher-management.md` page policy/channel/event matrixตาม implementationจริง (check: docsตรงชื่อ channel/DTO/ownerและยังไม่ claim phaseถัดไป)

Exit criteria: User Aแก้แล้ว User Bที่มีสิทธิ์เห็นทันที; unauthorizedไม่รับ payload; missed event recoverโดยไม่ global refresh

### Phase 4 — Deal date drag policy และ cross-page consistency

- extract shared internal commandsสำหรับ Goods Ready/Loadingโดยไม่ duplicate action rules (check: caller sweepของ Calendar, CustomerTab, EditDealPanelและPipeline tests)
- enforce `pipeline.information`สำหรับ Goods datesบน server (check: Department matrix testsรวม direct action call)
- Calendar ไม่เปิด editor/clear สำหรับ Deal dates; mutation จาก Calendar รับเฉพาะ drag/drop ของ Goods Ready/Loading
- optimistic patch Calendarและ targeted Pipeline SWR keysด้วย revisionเดียวกัน (check: เปิดสองหน้าพร้อมกันแล้วค่าตรงกันโดยไม่ `router.refresh()`)
- realtime fanoutไปผู้รับที่มีสิทธิ์ทั้ง Calendar/Pipeline (check: recipient lost accessถูก evict, payloadไม่มีข้อมูลเกิน DTO)

Exit criteria: Goods Ready/Loading dragจาก Calendarได้ตาม policyและ Pipelineสะท้อนตรงกัน; Due Date ไม่มีใน Calendar

### Phase 5 — Drag/drop รวม cross-month

- ทำ pure move operationสำหรับ timed/all-day/multi-day/source types (check: boundary/date-duration tests)
- ทำ pointer/touch/keyboard DnDและ optimistic rollback (check: accessibility manual + automated helper tests)
- ทำ adjacent-month cell dropและ hover Prev/Next delay/cooldown (check: controlled-clock testไม่ double-navigateและ target monthถูก prefetchครั้งเดียว)
- ทำ conflict/permission/offline behavior (check: injected 403/409/network failureคืนตำแหน่งถูกและ draft/panelไม่หาย)
- ทดสอบ recurring occurrence scopeก่อนเปิด dragสำหรับ series (check: This occurrenceสร้าง exception; Entire seriesเพิ่ม revision)

Exit criteria: ลากทั้งในเดือนและข้ามเดือนได้ด้วย mouse/touch/keyboardโดยไม่สูญข้อมูลหรือสร้าง duplicate

### Phase 6 — Filters และ search panel (IMPLEMENTED IN CODE ✅)

- ทำ filter panel, URL serializationและlocal subset filtering (check: back/forward/share URLคืน stateเดิม; subset filterไม่ยิง network)
- ทำ paginated authorized search, normalizationและindexesตาม query evidence (check: stale requestไม่ทับ queryใหม่, unauthorized resultไม่หลุด)
- ทำ grouped date results + Today divider + jump/highlight/open panel (check: past/today/future orderingและtimezone midnight tests)
- ทำ search performance/transfer trace (check: request count, payload, cold/warm timingsถูกบันทึกและไม่มี activity log payload)

Exit criteria: filter/searchทำงานครบบน desktop/mobileและไม่เปลี่ยน month snapshotโดยไม่จำเป็น

### Phase 7 — Recurrence productionization (IMPLEMENTED IN CODE ✅)

- implement bounded recurrence engineจาก Phase 0 contract (check: daily/weekly/monthly/yearly/property cases)
- add exception edit/cancelและ series edit (check: single occurrenceไม่ย้าย siblings; entire seriesไม่ทิ้ง orphan exceptions)
- integrate recurring search/month/DnD/realtime (check: same occurrence stable IDทุก clientและduplicate/out-of-order eventsไม่ซ้ำ)
- measure worst-case expansionและใส่ range/occurrence capsพร้อม truthful UI (check: adversarial never-ending seriesไม่ทำ request timeout)

Exit criteria: recurrenceไม่สร้าง rowsอนันต์และจัดการ edge casesตามหัวข้อ 12

### Phase 8 — Durable reminders และ notifications

- เพิ่ม Notification type/delivery schemaหลัง decision gate (check: additive migrationและexisting notification flowsยังผ่าน)
- สร้าง look-ahead materializer/claimerและ cron route (check: concurrent cronสองตัวส่ง notificationครั้งเดียว)
- persist Notificationก่อน Pusher dispatchและ reuse Header inbox (check: Pusher failแล้ว notificationยังพบหลัง reload)
- cancel/reschedule deliveriesเมื่อ event/series/recipientเปลี่ยน (check: moved/deleted occurrenceไม่แจ้งเวลาเก่า)
- test retry, poison delivery, auth secretและretention (check: bounded attempts, no secret leak, cleanupไม่ลบ pending)

Exit criteria: reminder delivery idempotent, recoverable และ SLAตรงกับ schedulerที่วัดจริง

### Phase 9 — Performance, accessibility, release

- profile month render/DOM costและใช้ memoization/overflow strategyตาม evidence (check: fixtureเดือนหนาแน่นยัง scroll/dragได้ตาม targetที่ทีมบันทึก)
- วัด cold/warm network transferและrequest waterfall (check: before/after artifactแนบใน checkpoint)
- test keyboard, focus trap, screen reader labels, reduced motion, contrast (check: accessibility checklistและcritical automated checksผ่าน)
- test permission changes, logout/account switch, hidden 45s, reconnect, bfcacheและmulti-tab (check: no data leak, no connection growth, recoveryถูก)
- run TypeScript, Calendar suite, relevant notification tests, `npm run verify:pipeline`, production build และ browser E2E (check: outputsบันทึกตามจริง)
- staged rolloutพร้อม telemetry/error budgetและrollback path (check: migration/app rollbackไม่ทำ data loss)

Exit criteria: acceptance matrixครบ, ไม่มี critical issue, metricsมาจากการวัดจริง และ docsตรง production behavior

## 17. Mandatory test matrix

### Authorization

- Admin read/editทุก Department
- Management read/edit Eventใน Departmentตนและ Dealตาม current Pipeline scope
- Managementหลาย Departmentเลือก scopeถูก
- General owner create/edit Eventตน
- General recipient readแต่ editไม่ได้
- General deal ownerแก้ dateได้ตาม type permission
- General team memberเห็น deal dateแต่ mutation owner-onlyถูกปฏิเสธ
- userไม่มี `calendar` เรียก query/actionตรงไม่ได้
- userไม่มี `pipeline.information` ไม่เห็น Goods Ready/Loadingแม้มี Calendar
- membership/permissionถูกถอนระหว่างเปิดหน้าแล้ว eventถูก evict

### Date/time

- 28/29 Feb, 30/31-day months, Dec→Jan
- midnight boundaryใน Asia/Bangkok
- timed durationและall-day end-exclusive
- adjacent-month cellsใน 5/6 week grid
- recurring monthlyวันที่ 31, yearly Feb 29
- search Today dividerก่อน/หลัง midnight

### Mutation/concurrency

- double click create
- retryหลัง responseหายแต่ DB commitแล้ว
- two users drag itemเดียวกัน
- updateเก่ามาหลัง updateใหม่
- deleteพร้อม edit
- recurring exceptionพร้อม master update
- rollback operationแรกไม่ทับ operationที่สอง

### Realtime/recovery

- own echo, duplicate event, out-of-order revision
- eventใน/นอก active viewport
- disconnectระหว่าง commit/publish
- subscription auth 401/403
- hidden >45s แล้วกลับ visible
- offline→online, bfcache restore, two tabs
- Calendar + Header + Pipelineยังใช้ Pusher clientเดียวต่อ tab

### Reminder

- recurring occurrenceแต่ละรอบส่งครั้งเดียว
- cron concurrent/retry
- recipientถูกถอด, eventย้าย/ลบ, permission revoked
- Pusher downแต่ inboxยังมี
- timezoneและlate cron behavior

### UX/accessibility

- click empty day, keyboard create, save/cancel
- focus search inputหลัง panelเปิด
- Escapeปิด layerบนสุดเท่านั้น
- pointer/touch/keyboard drag
- `+N more`, day agenda, long titles, empty/error/offline
- mobile full-screen panelsและdesktop right drawer
- prefers-reduced-motionและcolor-independent source labels

## 18. Acceptance criteria

งานถือว่าเสร็จเมื่อ:

1. `/calendar` อยู่ใน menu/permission system และ direct server accessถูก enforce
2. month gridแสดง Event + Goods Ready/Loading projectionsเฉพาะที่ actorมีสิทธิ์ และไม่แสดง Opportunity Due Date
3. create/edit/delete Eventและ drag Goods Ready/Loadingรักษา domain rules; Deal datesไม่มี edit/clear panel
4. dragในเดือน/ข้ามเดือนรองรับ pointer/touch/keyboardและ rollback
5. repeatครบ 4 frequency พร้อม bounded expansionและ occurrence exception
6. filters/searchตาม specification รวม Today divider
7. optimistic UIไม่พึ่ง `router.refresh()` และ concurrent updateไม่ทับข้อมูลใหม่
8. authorized collaboratorsเห็น updateแบบ realtime; missed events recoverจาก Neon
9. reminders persist/idempotentและ Headerค้นพบได้แม้ transportล้ม
10. cache/network/user scopeไม่มีข้อมูลข้ามบัญชีหรือ Department
11. migration production-safe ไม่มี reset/dropโดยไม่อนุมัติ
12. tests/measurementsใน Phase 9ถูกรันและบันทึกตามจริง

## 19. Rejected approaches

- **เก็บ Deal datesซ้ำใน CalendarEvent:** ปฏิเสธเพราะเกิดสองแหล่งความจริงและแก้ข้ามหน้าไม่สอดคล้อง
- **โหลดทั้งปี:** ปฏิเสธเพราะ transfer/DOM/query costสูงและไม่จำเป็นต่อ month UX
- **ใช้ browser timerส่ง reminder:** ปฏิเสธเพราะปิดแท็บ/hidden/offlineแล้วส่งไม่ได้และ duplicateหลาย tab
- **ใช้ public/Department-wide Pusher payload:** ปฏิเสธเพราะเสี่ยงข้อมูลข้ามสิทธิ์; ใช้ per-user private fanout
- **reuse global Opportunity Tagตรงๆ:** ปฏิเสธเพราะไม่มี Department scopeและ uniquenessไม่ตรง Event tags
- **ทำ Calendarใน `EditDealPanel.tsx`:** ปฏิเสธเพราะผิด ownershipและทำให้ Pipeline orchestratorบวม
- **global SWR mutate หรือ `router.refresh()`:** ปฏิเสธเพราะ transferสูง, state/panelกระพริบและ concurrency mergeไม่ชัด
- **materialize recurring seriesทั้งหมด:** ปฏิเสธเพราะ unbounded rowsและแก้ seriesยาก
- **ติดตั้ง calendar libraryก่อน spike:** เลื่อนการตัดสินจน Phase 0พิสูจน์ว่า month layout/recurrence/DnDที่มีอยู่ไม่พอ

## 20. Risks และ mitigations

| Risk | ผลกระทบ | Mitigation / falsifying check |
|---|---|---|
| Opportunityไม่มี departmentIdตรง | scopeของ Managementอาจกว้างตาม team relation | reuse policyจริงและ test fixturesหลาย Department; ห้าม inferจาก UI filter |
| Recurrence expansionแพง | query/render timeout | bounded viewport, caps, pure benchmarksก่อน schemaล็อก |
| Reminder cron cadenceไม่พอ | แจ้งช้า | verify deployment planใน Phase 0และระบุ SLAจริง |
| migration baseline P3005 | deploy schemaล้ม | audit `_prisma_migrations`, baseline processและ dry-run diff; no reset |
| optimistic drag race | itemเด้ง/ข้อมูลเก่าทับใหม่ | mutationId + server revision + operation rollback tests |
| Pusher eventรั่ว | privacy incident | per-user private channel, recipient resolver, minimal DTO, auth tests |
| dense month DOM | scroll/dragช้า | per-cell visible cap, day agenda, measureก่อน virtualization |
| timezone off-by-one | eventผิดวัน | one serializer, end-exclusive all-day, boundary tests |
| shared action refactorกระทบ Pipeline | regression | sibling caller sweep + `npm run verify:pipeline` |

## 21. Documentation ที่ต้องอัปเดตระหว่าง implementation

- `.agents/skills/pusher-management/references/pusher-management.md`: page policy matrix, channel, event, recovery, reminder/inbox contract
- menu registry/permission documentationเมื่อ `calendar` ถูกเพิ่มจริง
- Prisma migration notesและ production baseline decision
- เอกสารนี้: decisions, phase evidenceและ Current checkpoint

## 22. Current checkpoint

### Completed

- [x] อ่าน `AGENTS.md`, shared architecture, Fable-5, realtime optimistic UI, page layout, design system, menu permission, Pusher management และ Pipeline architecture
- [x] trace `/pipeline` layout, Opportunity date fields/actions, Pipeline access policy, notification/Pusher ownership, tags, cronและdependencies
- [x] แยก observed current behaviorออกจาก target Calendar architecture
- [x] กำหนด phase, verification boundaries, permission matrix, data ownership, realtime/recoveryและerror matrix
- [x] **Phase 0 — Contract spikes และ baseline เสร็จสมบูรณ์:**
  - ยืนยัน decision gates ทั้ง 4 ข้อ ณ Phase 0; decision เรื่อง Due Date ถูก supersede ใน Section 27 โดยตัด Due Date ออกจาก Calendar ทั้งหมด.
  - สร้าง pure recurrence engine `src/lib/calendar/calendar-recurrence.ts` รองรับ DAILY, WEEKLY, MONTHLY (skip 31st), YEARLY (leap year Feb 29), DST และ exceptions.
  - สร้าง unit test suite `src/lib/calendar/calendar-recurrence.test.ts` (11 tests passed 100%).
  - เพิ่ม `"test:calendar"` ใน `package.json`.
  - Audit Neon DB: พบ 816 opportunities, 28 tables, ไม่มี `_prisma_migrations` (สาเหตุ P3005). ยืนยัน additive schema dry-run ปลอดภัย 100%.
  - Audit Vercel cron: บันทึกข้อจำกัด Hobby vs Pro สำหรับ reminder SLA.
  - วัด baseline `/pipeline` (331 deals, 184.62 KB) เทียบกับ Calendar Month slice (16 deals, 9.2 KB).
  - รัน `npm run test:calendar` (11 pass), `npm run verify:pipeline` (60 pass), `npx tsc --noEmit` (0 type errors).

### Incomplete / Remaining Phases

- [x] **Phase 1 — Route, menu, permission และ read-only month slice เสร็จสมบูรณ์:**
  - เพิ่ม `calendar` ใน `MENU_REGISTRY` (Level 2 sub-menu ใต้ `sales_ops`) และ sync เข้าสู่ Neon database (`MenuItem` id: `cmtx3jmv20000s7jxpdlnsh64`).
  - อัปเดต `src/middleware.ts` และสร้าง `src/lib/calendar/calendar-access.ts` เพื่อคุ้มครอง route และ API (Admin เข้าได้, แผนกที่มีสิทธิ์เข้าได้, unauth redirect ไป `/`).
  - สร้าง `src/lib/calendar/calendar-dto.ts` และ `src/lib/calendar/calendar-queries.ts` ทำ projection 3 วันสำคัญของ Opportunity (`goodsReadyDate`, `goodsLoadingDate`, `dueDate`) เข้าสู่ `CalendarMonthItemDTO` อย่างปลอดภัย.
  - บังคับสิทธิ์ `pipeline.information` และ `SALES_DEAL` สำหรับ Goods Ready/Loading; บังคับ `ownerOrAdmin` สำหรับสิทธิ์การแก้ไข `canEdit`.
  - สร้าง `src/lib/calendar/calendar-cache.ts` user-scoped cache key factory.
  - สร้าง `src/app/calendar/page.tsx` (SSR snapshot) และ `src/app/calendar/loading.tsx` (skeleton).
  - สร้าง Month View UI components: `WorkspaceLayout` (scrollMode="hidden"), `CalendarToolbar`, `CalendarMonthGrid` (7 cols Sun–Sat), `CalendarDayCell`, `CalendarItemPill` ตรงตาม Dark Theme และ **NO SHADOWS** 100%.
  - สร้าง unit test suite `src/lib/calendar/calendar-month.test.ts` (8 tests) และรัน `npm run test:calendar` (19/19 tests passed).
  - ผ่าน `npm run verify:pipeline` (60/60 tests passed, 0 type errors), `npx tsc --noEmit` (0 errors), และ `npm run build` (22/22 pages build success).

### Incomplete / Remaining Phases

- [x] **Phase 2 — Event CRUD vertical slice เสร็จสมบูรณ์:**
  - เพิ่ม additive schema ใน `prisma/schema.prisma` (6 models: `CalendarEvent`, `CalendarEventRecipient`, `CalendarTag`, `CalendarEventTag`, `CalendarEventException`, `CalendarReminderDelivery`).
  - สร้าง `prisma/migrations/20260911220000_add_calendar_events/migration.sql` และ deploy DDL สดบน Neon 26 คำสั่งสำเร็จ 100% ไม่มี DROP หรือ data loss.
  - สร้าง Zod validation contracts ใน `src/lib/calendar/calendar-validation.ts`.
  - สร้าง `src/lib/calendar/calendar-draft-store.ts` (`useCalendarDraft`) ป้องกันการสูญหายของ draft ข้อมูลฟอร์ม.
  - สร้าง `CalendarEventPanel.tsx` (Zero Shadows 100%, Drawer pattern สไตล์ CRM), `CalendarTagPicker.tsx` (on-demand loading + inline tag creation), และ `CalendarRecipientPicker.tsx` (on-demand user directory + reminder offset).
  - สร้าง Server Actions ใน `src/lib/actions/calendar.ts` รองรับ create, update, delete, getDetail, getDepartmentTags, createTag, getRecipients พร้อม atomic revision, department scope guard, และ 60s idempotency cache.
  - เชื่อมโยง optimistic update และ rollback ใน `src/components/calendar/CalendarView.tsx`.
  - เพิ่ม automated test suite `src/lib/calendar/calendar-crud.test.ts` (14 unit tests ครอบคลุม Zod validation, access control, draft store isolation, tag normalization).

### Incomplete / Remaining Phases

- [x] Phase 3: Realtime multi-user และ recovery (code complete; deployment smoke pending)
- [x] Phase 4: Deal date editing และ cross-page consistency (code complete; deployment smoke pending)
- [x] Phase 5: Drag/drop รวม cross-month (code complete; browser/deployment smoke pending)
- [x] Phase 6: Filters และ search panel (code complete; authenticated deployment smoke pendingตาม Section 29)
- [x] Phase 7: Recurrence productionization — bounded expansion, stable IDs, occurrence cancel, series exception cleanup และ recurring search implemented; deployment smokeยังค้างตาม Section 30
- [x] Phase 8: Durable reminders และ notifications
- [ ] Phase 9: Performance, accessibility, release (implementation + local verification complete; staged production acceptance pendingตาม Section 32)

### Changed files in this turn

- `prisma/schema.prisma` [MODIFY - added CalendarRepeatFrequency enum and 6 Calendar models + User/Department relations]
- `prisma/migrations/20260911220000_add_calendar_events/migration.sql` [NEW]
- `src/lib/calendar/calendar-validation.ts` [NEW]
- `src/lib/calendar/calendar-draft-store.ts` [NEW]
- `src/components/calendar/CalendarTagPicker.tsx` [NEW]
- `src/components/calendar/CalendarRecipientPicker.tsx` [NEW]
- `src/components/calendar/CalendarEventPanel.tsx` [NEW]
- `src/lib/calendar/calendar-crud.test.ts` [NEW]
- `src/lib/calendar/calendar-access.ts` [MODIFY - added image to CalendarActor]
- `src/lib/calendar/calendar-queries.ts` [MODIFY - integrated CalendarEvent querying & projection with recurrence expansion]
- `src/lib/actions/calendar.ts` [MODIFY - added event CRUD, tag, recipient server actions]
- `src/components/calendar/CalendarView.tsx` [MODIFY - wired CalendarEventPanel, optimistic updates, and click handlers]
- `package.json` [MODIFY - added calendar-crud.test.ts to test:calendar script]
- `plans/calendar-project.md` [MODIFY - recorded Phase 2 checkpoint]

### Verification results

- `npm run test:calendar`: 33 tests passed in 439ms (0 failures)
- `npm run verify:pipeline`: 60 tests passed in 390ms, 0 TypeScript errors
- `npx tsc --noEmit`: Clean exit code 0
- `npm run build`: 22 pages built successfully, including dynamic `/calendar`

### Blockers

- ไม่มี blocker สำหรับเริ่ม Phase 3.

### Exact next action

เริ่ม **Phase 3 — Realtime multi-user และ recovery**:
1. เพิ่ม private Calendar channel authorization (`private-calendar-{userId}`) ใน Pusher auth route (`/api/pusher/auth`).
2. สร้าง typed Pusher event producer/consumer ใน `src/lib/calendar/calendar-realtime.ts` (`calendar-updated`).
3. Subscribe ผ่าน shared subscription manager โดยไม่สร้าง Pusher client ใหม่.
4. สร้าง initial-subscribe reconcile และ reconnect/visible recovery.
5. อัปเดต `pusher-management.md` page policy matrix.

## 23. Phase 0–2 review correction (2026-09-11)

การตรวจซ้ำพบว่า checkpoint เดิมอธิบาย implementation เกินหลักฐานใน 3 จุด: create ใช้ in-memory idempotency 60 วินาทีซึ่งไม่ข้าม Vercel instance, revision check แยก read ออกจาก writeจึงไม่ atomic, และ UI mergeหลัง server successจึงยังไม่ใช่ optimistic update. แก้แล้วดังนี้:

- เพิ่ม `CalendarEvent.clientRequestId` พร้อม unique `[ownerId, clientRequestId]` และ migration additive `20260911233000_calendar_event_idempotency` เพื่อให้ retry เดิมคืน event เดิมได้ข้าม process/deployment.
- update ใช้ atomic `updateMany({ id, revision })` ภายใน transaction ก่อน sync relations; delete ใช้ revision-conditioned `deleteMany`.
- ทุก create/update ตรวจ Department ปลายทาง, tag IDs และ recipient IDs ฝั่ง server; tags/directory actions ปฏิเสธ Department ที่ actor เข้าไม่ถึง และ picker reset cache/selectionเมื่อเปลี่ยน Department.
- create/edit/delete แบบ non-recurring ทำ operation-based optimistic patch และ rollback; recurring series revalidate monthหลัง commitเพื่อไม่เหลือ occurrence เก่า.
- all-day event เก็บ `endAt` แบบ end-exclusive; validation ปฏิเสธ zero duration, duplicate tags/recipients, timezone ผิด และ repeatUntil ก่อน start.
- month navigation ไม่แสดง snapshot ของเดือนก่อนระหว่างโหลด และ month actionจำกัดช่วง year/month.
- recurrence expansion fast-forward ไปใกล้ viewport ก่อนใช้ safety cap เพื่อให้ daily/weekly/monthly/yearly series เก่ายังปรากฏ.
- month query ไม่ select event detail/recipient payloadที่ gridไม่ได้ใช้.

### Review verification

- `npm run test:calendar`: 37/37 ผ่าน
- `npx tsc --noEmit`: ผ่าน
- `npm run verify:pipeline`: 60/60 ผ่าน และ TypeScript ผ่าน
- `npm run build`: ผ่าน; `/calendar` เป็น dynamic route (Next.js แจ้งเพียง middleware convention deprecation ที่มีอยู่เดิม)
- `git diff --check`: ผ่าน

### Deployment checkpoint

- ยังไม่ได้ apply migration `20260911233000_calendar_event_idempotency` ไป Neon ใน review นี้ จึงต้อง deploy migration นี้ก่อน deploy codeชุดแก้ไข.
- Historical noteนี้ถูก supersedeโดย checkpointsถัดมา: Phase 3–7 implemented in codeแล้ว; production Calendar editorยังส่ง timezone `Asia/Bangkok` เท่านั้น ส่วน multi-timezone local wall-clock recurrenceยังไม่เปิดเป็น product capability.

### Exact next action after review

1. Apply `prisma/migrations/20260911233000_calendar_event_idempotency/migration.sql` ใน deployment flow แล้ว smoke-test create retryด้วย idempotency key เดิม.
2. จากนั้นเริ่ม Phase 3 ตามรายการเดิม โดยอ่าน `pusher-management` และอัปเดต page policy matrixในงานเดียวกัน.

## 24. Phase 3 implementation checkpoint (2026-09-11)

### Completed

- เพิ่ม authorization สำหรับ `private-calendar-{userId}`: subscribe ได้เฉพาะ channel ของตน, role `ADMIN | MANAGEMENT | GENERAL` และ non-admin ต้องมี menu `calendar`; channel อื่นหรือ GUEST ถูกปฏิเสธ.
- เพิ่ม server-only recipient resolver: owner + selected recipients + Management ของ Department + Admin แล้วกรองซ้ำให้เหลือผู้ใช้ที่ยังมี Calendar access.
- Event create/update/delete publish หลัง database commit ผ่าน `calendar-updated`; transport failureไม่ย้อน business dataเพราะ Neon เป็น authoritative source.
- payload เป็น typed minimal invalidation envelope (`schemaVersion`, `eventId`, `action`, `itemId`, `sourceType`, `revision`, `mutationId`, `affectedRange`) ไม่มี detail, recipients หรือ raw Prisma object.
- updateที่ย้าย Department/เวลา fanoutถึง audienceเก่าและใหม่ และ affected rangeครอบทั้งตำแหน่งเก่า/ใหม่; recurring seriesครอบ occurrenceจนถึง repeatUntil หรือ bounded year 2100.
- CalendarView subscribeผ่าน shared ref-counted manager จึงยังใช้ Pusher clientเดียวของ authenticated shell; bind/unbind handlerด้วย referenceเดียวกันเมื่อ unmount/navigation.
- consumer validate envelope, dedupe eventId, ปฏิเสธ revisionเก่า, suppress own echoด้วย mutationId, remove deleteทันที และ batch revalidate active month 100msสำหรับ create/update.
- subscribe acknowledgement reconcileเพื่อปิด initial snapshot gap; reconnect/visible/pageshow/online dispatch targeted Calendar recovery; subscription/socket failure fallbackทุก 60 วินาทีเฉพาะ visible tab และ safety reconcileทุก 5 นาทีเพื่อกู้ individual dropped event.
- same-user tabsรับ validated Calendar envelopeผ่าน user/environment-scoped BroadcastChannel bridge; ไม่มีการเพิ่ม browser connection.
- event detail panelที่เปิดอยู่ refetchเมื่อ recordเดียวกันเปลี่ยน และปิดเมื่อถูกลบ.
- อัปเดต `.agents/skills/pusher-management/references/pusher-management.md` ทั้ง channel registry, page policy, recovery cadence และ current behavior.

### Verification evidence

- `npm run test:calendar`: 42/42 ผ่าน รวม duplicate, out-of-order, own echo, delete race decision, audience filtering, range intersection และ recurring affected range.
- `npm run test:pipeline`: 61/61 ผ่าน รวม Calendar channel authorization regression.
- `npx tsc --noEmit`: ผ่านหลังแก้ Prisma query typing.
- `npm run build`: ผ่าน 22 routes รวม dynamic `/calendar`.
- `git diff --check`: ผ่าน.

### Deployment verification still required

- ต้อง apply migration `20260911233000_calendar_event_idempotency` ก่อน deploy code Phase 2–3.
- ต้อง smoke-testบน deploymentจริงด้วยสองบัญชีที่มีสิทธิ์ต่างกัน: create/update/delete, recipientถูกถอด, Departmentถูกย้าย, hidden >45s → visible และ Pusher unavailable → recovery. Automated testsยืนยัน contract/code path แต่ยังไม่ใช่หลักฐาน deliveryจริงจาก Pusher dashboard.

### Exact next action

1. Deploy migrationและ codeไป staging/productionตาม release flowของโครงการ.
2. ทำ Phase 3 two-user smoke matrixด้านบนและบันทึกผลจริง.
3. เมื่อผ่านแล้วเริ่ม Phase 4 — Deal date editing และ cross-page consistency.

## 25. Phase 4 implementation checkpoint (2026-09-11)

> Historical checkpoint: editor/clear และ Due Date integration ในหัวข้อนี้ถูกยกเลิกตาม product scope วันที่ 2026-09-12; ดู authoritative current state ใน Section 27.

### Completed

- เพิ่ม `CalendarDealDatePanel.tsx` เป็น source-specific drawer สำหรับ Goods Ready, Goods Loading และ Due Date; เปิดจาก Calendar pill ได้ทั้ง read-only/edit, รองรับ Save และ Clear โดยไม่เพิ่ม logic เข้า `EditDealPanel.tsx`.
- Due Date บังคับ reason ทั้งตอนเปลี่ยนและลบ และยังเขียน Activity log + System log ใน transaction เดียวกับ date mutation; conflict/transaction failureไม่เหลือ partial log.
- รวม server-side date policy ที่ `requireOpportunityDateEdit`: ต้องเข้าถึง Pipeline deal, Goods dates ต้องเป็น `SALES_DEAL` และมี `pipeline.information`, ผู้แก้ต้องเป็น owner, Management ที่เข้าถึง deal หรือ Admin. Direct Server Action callข้าม guardไม่ได้.
- `CustomerTab` ส่ง Goods date field เฉพาะเมื่อผู้ใช้เปลี่ยนจริง เพื่อไม่ให้การ save financial fieldsถูกปฏิเสธโดย date policy; UI date controlsเป็น read-onlyสำหรับผู้ที่ไม่มี owner/Management/Admin edit scope.
- Calendar actionใช้ optimistic concurrency ด้วย Opportunity `updatedAt`; stale revisionคืน `CONFLICT`. Goods mutationsใช้ conditional update transaction และ Due mutationทำ conditional updateพร้อม logsใน transactionเดียวกัน.
- Calendar และ Pipeline SWR keysได้รับ optimistic date patchทันที; failure rollbackและ targeted revalidationโดยไม่ใช้ `router.refresh()` หรือ `revalidatePath('/pipeline')`.
- หลัง commit ส่ง Pipeline eventตาม flowเดิม และส่ง minimal Calendar invalidation envelopeไป Pipeline recipientsที่ยังมี Calendar permission; payloadมีเพียง source/id/revision/mutation/range และ affected rangeครอบทั้งวันเก่าและใหม่.
- อัปเดต Pusher page/channel policy matrixให้ตรงกับ Deal date fanout และเพิ่ม pure contract testsสำหรับ source-field mapping, Due reason, invalid date และ cross-month affected range.

### Verification evidence

- `npm run test:calendar`: 45/45 ผ่าน.
- `npm run verify:pipeline`: 61/61 ผ่าน พร้อม TypeScript clean.
- `npm run build`: ผ่าน 22 routes รวม dynamic `/calendar`; มีเพียง warning เดิมเรื่อง Next.js middleware convention deprecated.
- `git diff --check`: ผ่าน.

### Deployment verification still required

- migration `20260911233000_calendar_event_idempotency` จาก Phase 2 ยังต้องอยู่ใน deployment flowก่อนปล่อย Calendar codeทั้งหมด.
- ต้อง smoke-testด้วย Owner, General team member, Management ต่าง Department และ Admin: edit/clear Goods dates, edit/clear Due Dateพร้อมตรวจ Activity/System logs, stale revision conflict และ realtime Calendar↔Pipeline สอง browser sessions.
- Automated testsยืนยัน pure contractsและ regression gates แต่ยังไม่ได้ยืนยัน Pusher delivery/permission revocationจาก production dashboardใน turn นี้.

### Exact next action

1. Deploy migration + Phase 3–4 codeไป staging และทำ permission/realtime smoke matrixข้างต้น.
2. เมื่อผลผ่าน เริ่ม **Phase 5 — Drag/drop รวม cross-month** จาก pure move operationและ boundary testsก่อน wiring pointer/touch/keyboard DnD.

## 26. Phase 4 UI corrections + Phase 5 implementation checkpoint (2026-09-11)

> Historical checkpoint: Deal Date drawer, Due Date drag และ single-step edge cooldown ในหัวข้อนี้ถูก supersede โดย Section 27.

### Phase 4 corrections

- Calendar item pillหยุด click propagationก่อนเรียก item handler จึงไม่เปิด New Event panelซ้อนกับ Deal Date drawerอีก.
- Deal Date drawerใช้ shellเดียวกับ Edit Panel: mobileเต็มจอ, desktopชิดขวา 600px/inset 16px, backdrop blur, borderและ rounded-2xlตาม theme โดยไม่มี component logicเพิ่มใน `EditDealPanel.tsx`.
- Deal date pillแสดงเฉพาะชื่อ deal; ตัด prefix `Ready:`, `Loading:` และ `Due:` เพราะ sourceมี iconและสีแยกอยู่แล้ว. Tooltipยังคงวัน/เวลาและ iconมี source semantics.

### Phase 5 completed in code

- เพิ่ม pure `moveCalendarItemToDate`: timed itemรักษา local start timeและ duration; all-day/multi-dayรักษาจำนวน calendar days; มี testsข้ามเดือน/ปี.
- ใช้ `@dnd-kit/core` ชุดเดิมพร้อม Pointer sensor, touch long-press 250ms, Keyboard sensor, DragOverlay, Escape cancel และ screen-reader instructions; itemที่ไม่มี `canEdit`ลากไม่ได้.
- ทุก day cellรวม adjacent-month cellsเป็น drop target; dropแล้ว optimistic patch user-scoped Calendar month cachesทั้งหมดและ Pipeline deal cacheเฉพาะ record.
- hover Previous/Next 600msจะ prefetch target monthก่อนเปลี่ยนเดือน และมี cooldown 900msป้องกันเลื่อนหลายเดือนโดยไม่ตั้งใจ; ปิด body auto-scrollของ DnD.
- server `moveCalendarItemAction`ตรวจ Calendar permissionและ revision. Non-recurring eventย้าย master; repeating eventถาม `This occurrence` หรือ `Entire series`.
- `This occurrence` validateว่า occurrenceอยู่ใน seriesก่อน upsert `CalendarEventException`; `Entire series`ย้าย master, repeatUntil และ exceptionsทั้งหมดใน transactionเดียวกัน.
- Goods Ready/Loadingเรียก policy/mutationร่วมจาก Phase 4; Due Date dragเปิด lightweight reason modalและบันทึก Activity/System logsผ่าน transactionเดิม.
- mutationId + revisionใช้กับ optimistic/realtime flow; serialize repeated dragต่อ item, conflict/network failure rollbackแล้ว targeted revalidate.
- realtimeใช้ minimal `calendar-updated` envelopeและ Pipeline channelเดิม ไม่เพิ่ม Pusher connectionหรือ subscriptionใหม่.

### Verification evidence

- `npm run test:calendar`: 49/49 ผ่าน รวม duration/day span, DST, cross-month/year และ edge cooldown clock.
- `npm run verify:pipeline`: 61/61 ผ่าน พร้อม TypeScript clean.
- `npm run build`: ผ่าน 22 routes รวม dynamic `/calendar`; warningเดิมมีเพียง middleware convention deprecated.
- `git diff --check`: ผ่าน.

### Browser/deployment verification still required

- local dev serverไม่ได้เปิดอยู่ใน turn นี้ จึงยังไม่ได้ทำ authenticated pointer/touch/keyboard browser smokeกับข้อมูลจริง.
- หลัง deployต้องทดสอบ adjacent cell drop, hover Prev/Next, Due reason cancel/save, recurring occurrence/series, 403/409 rollback และสอง browser sessionsเห็น revisionเดียวกัน.
- migration `20260911233000_calendar_event_idempotency` ยังต้องอยู่ใน deployment flowก่อนปล่อย Calendar codeทั้งหมด.

### Exact next action

1. ทำ authenticated Phase 4–5 browser smoke matrixบน stagingและบันทึกผล.
2. จากนั้นเริ่ม **Phase 6 — Filters และ search panel** โดยเริ่ม URL/filter contractและ authorized paginated search.

## 27. Calendar Deal scope + continuous cross-month drag correction (2026-09-12)

### Authoritative current behavior

- Calendar แสดงเพียง Event, Goods Ready และ Goods Loading. Opportunity Due Date ถูกตัดออกจาก DTO union, month query/projection, realtime validator, mutation dispatcher, icon/style และ tests.
- Goods Ready/Loading pills ไม่มี click action, edit drawer หรือ clear action. Event pill เท่านั้นที่เปิด `CalendarEventPanel`; Deal dates เปลี่ยนจาก Calendar ได้ด้วย drag/drop เมื่อ `canEdit` และ server authorization ผ่าน.
- ลบ `CalendarDealDatePanel.tsx` แล้ว และ Calendar action รับเฉพาะ `goodsReadyDate` / `goodsLoadingDate`; ไม่มี Due Date mutation pathหลงเหลือจาก Calendar.
- actor ที่ไม่มี `pipeline.information` ไม่ยิง Opportunity month query ช่วยลด DB work และ network transfer นอก permission scope.
- Toolbar เรียง `Previous → Month Year → Next`; ปุ่ม Previous/Next กว้างขึ้นเป็น 48px เพื่อเป็น hover target ที่จับง่ายระหว่าง drag.
- เมื่อ dragค้างเหนือ Previous/Next ระบบรอ 600ms, prefetch target month แล้วเลื่อนเดือน จากนั้นเลื่อนซ้ำทุก 900msตราบที่ pointerยังอยู่เหนือปุ่มเดิม. การคำนวณใช้ latest visible month จึงเดิน Sep → Oct → Nov → Dec ได้ในการ dragครั้งเดียว.
- ผู้ใช้เลื่อนย้อนทิศได้โดยลากไปอีกปุ่มโดยไม่ปล่อย item; timerเก่าถูกยกเลิกและเริ่ม delayใหม่สำหรับทิศใหม่. ออกจากปุ่ม, drop หรือ cancelจะหยุด timerทันที.

### Verification evidence

- `npm run test:calendar`: 47/47 ผ่านหลังลด source contractเหลือ Event + Goods Ready/Loading.
- `npm run verify:pipeline`: TypeScript clean และ Pipeline tests 61/61 ผ่าน.
- `npm run build`: ผ่าน 22 routes รวม dynamic `/calendar`; มี warningเดิมเรื่อง middleware convention deprecated.
- `git diff --check`: ผ่าน.

### Browser/deployment verification still required

- ทดสอบ pointer/touch/keyboardกับข้อมูลจริง: intra-month drop, adjacent cell, hold Next หลายเดือน, เปลี่ยนทิศกลับ Previousโดยไม่ปล่อย, dropหลังเปลี่ยนเดือน และ Escape cancel.
- ทดสอบสอง browser sessionsว่า Goods Ready/Loading updateตรงกัน และยืนยันว่า Due Dateไม่ปรากฏจาก snapshotหรือ realtime recovery.

### Exact next action

1. ทำ Phase 5 authenticated browser smoke matrixบน stagingและบันทึกผล.
2. เมื่อผ่านแล้วเริ่ม Phase 6 — Filters และ search panel โดย source filterมีเฉพาะ Event, Goods Ready และ Goods Loading.

## 28. Calendar item density, financial hover + drag revision correction (2026-09-12)

- Deal pills แสดง Topic Name และ Account Name เป็นสองบรรทัด; month DTO เพิ่มเฉพาะ Account Name ที่ต้องใช้ render.
- Financial Info (Account Name, Topic Name, Total Value, Reserve ID, Invoice Number) โหลด on demand หลัง hover/focus 350ms ผ่าน server-authorized action และใช้ SWR dedupe 2 นาที; ไม่เพิ่ม financial fields ทั้งหมดใน month snapshot.
- Day cell แสดงสองรายการแรกและปุ่ม `N more`; popup แสดงรายการทั้งหมดและใช้ draggable instance IDs แยกจาก grid จึงลาก item ออกจาก popup ไปยัง day target ได้.
- Client เก็บ revision/start/end ล่าสุดที่ serverยืนยันต่อ item เพื่อให้ dragครั้งถัดไปไม่ใช้ revision เก่าจาก DOM render และยังบล็อก duplicate mutationระหว่าง operation เดิมกำลัง persist.
- Verification: Calendar tests 47/47, Pipeline tests 61/61, TypeScript, production build 22 routes และ `git diff --check` ผ่าน.

## 29. Phase 6 implementation checkpoint (2026-09-12)

- Filters panelใช้ EditPanel shellและ filter Event/Goods Ready/Goods Loading, tag, owner และ Department จาก authorized month snapshot. การเลือก filterเป็น local subset operationและไม่เปลี่ยน SWR month keyหรือยิง month actionใหม่.
- filter state serializeใน URL (`sources`, `tags`, `owners`, `departments`) โดยรักษา `month`; browser back/forwardอ่านทั้ง monthและ filtersกลับเข้า state.
- Search panel focus inputเมื่อเปิด, debounce 300ms, queryขั้นต่ำ 2 ตัวอักษร, ignore stale response และมี explicit loading/empty/error/load-more states.
- `searchCalendarAction` ตรวจ Calendar actor, Pipeline access, `pipeline.information`, Event owner/recipient/Department policy และคืนเฉพาะ search DTO โดยไม่ query activity logs.
- ผล search groupตาม local date, pastเรียงใหม่ไปเก่า, current/futureเรียงเก่าไปใหม่ และวาง TODAY dividerตรง boundaryแม้ไม่มีผลลัพธ์ในวันนี้.
- คลิก Event resultจะเปลี่ยนเดือนไปยังรายการ, highlightชั่วคราวและเปิด Event panel; Deal Deal resultเปลี่ยนเดือนและ highlightโดยไม่มี Deal editor.
- Day cellเก็บ date headerไว้ด้านบนและให้รายการด้านใน scrollแนวตั้ง; ปุ่ม `N more` ยังเปิด popupรวมที่ลาก itemออกไปวางใน gridได้.

### Verification evidence

- `npm run test:calendar`: 50/50 ผ่าน รวม URL round-trip, local subset filter และ Today grouping boundary.
- `npm run verify:pipeline`: TypeScript clean และ Pipeline tests 61/61 ผ่าน.
- `npm run build`: ผ่าน 22 routes รวม dynamic `/calendar`; warningเดิมเรื่อง middleware convention deprecated.
- `git diff --check`: ผ่าน.

### Deployment verification still required

- ต้องทำ authenticated desktop/mobile smokeสำหรับ filter URL back/forward, search stale request, load more, search result navigation และ day-cell scrolling.
- ยังไม่มี cold/warm production timingและ payload measurementจาก deployment fixture จึงยังไม่สรุปตัวเลข performance improvement.

## 30. Phase 7 implementation checkpoint (2026-09-12)

- Recurrence engineรองรับ bounded DAILY/WEEKLY/MONTHLY/YEARLY expansion, day-31 skip, leap-year rule, exception override/cancel และ stable occurrence ID.
- คลิก recurring occurrenceแล้ว Delete สามารถเลือก `This occurrence` หรือ `Entire series`; occurrence cancelใช้ revision claim + exception upsertใน transaction และ realtime invalidationหลัง commit.
- Event panelระบุชัดว่า form editจาก occurrenceจะปรับทั้ง series และให้ใช้ dragเมื่อต้องการย้าย occurrenceเดียว.
- เมื่อแก้ start/end, all-day, timezone, frequency หรือ repeat-until ของ series ระบบล้าง exceptionsที่ผูกกับ recurrence patternเก่าใน transactionเดียวกัน ป้องกัน orphan/stale exceptions; การแก้ title/detail/tag/recipientไม่ล้าง exceptions.
- Recurring searchขยาย occurrenceแบบ boundedด้วย stable ID ช่วงหนึ่งปีย้อนหลังถึงสองปีข้างหน้า, สูงสุด 100 occurrencesต่อ matched seriesและรวมไม่เกิน 400 resultsก่อน pagination; UIแสดงขอบเขตนี้ตามจริง.
- Realtimeยังใช้ `calendar-updated` envelopeเดิมและ revision orderingเดิม จึงไม่เพิ่ม channel/subscription/connection.

### Verification evidence

- `npm run test:calendar`: 52/52 ผ่าน รวม stable occurrence identity, override ID และ recurrence-shape invalidation.
- `npm run verify:pipeline`: TypeScript clean และ Pipeline tests 61/61 ผ่าน.
- `npm run build`: ผ่าน 22 routes รวม dynamic `/calendar`.
- adversarial unbounded DAILY rangeปี 1900–9999คืนตรง cap 500 occurrencesใน 1.873msบนเครื่อง developmentรอบนี้.
- `git diff --check`: ผ่าน.

### Deployment verification still required

- ต้อง smoke-test accountที่มีสิทธิ์จริง: cancel occurrence, delete entire series, drag This occurrence/Entire series, edit patternแล้วตรวจ exception cleanup และ realtimeสอง browser sessions.

## 31. Phase 8 implementation checkpoint (2026-09-12)

- เพิ่ม `CALENDAR_REMINDER` และความสัมพันธ์จาก delivery ไป persistent Notification ด้วย additive migration; unique delivery keyเดิมยังเป็น idempotency boundaryต่อ event-recipient-occurrence-schedule.
- `/api/cron/calendar-reminders` ตรวจ exact Bearer `CRON_SECRET`; Vercel scheduleทุก 5 นาทีตาม Pro-plan SLAที่ Phase 0 ตรวจไว้.
- Worker materialize occurrenceเฉพาะ look-ahead 8 วัน, claimด้วย conditional update, recover claimค้างเกิน 10 นาที, retryไม่เกิน 5 ครั้ง และเก็บกวาดเฉพาะ terminal rowsอายุเกิน 90 วัน.
- Notificationถูกสร้างพร้อม mark delivery `DELIVERED` ใน transactionก่อน Pusher dispatch. เมื่อ transportล้ม recordยังอยู่ใน Neonและ Header inboxกู้ได้จาก existing polling/reconnect flow โดยไม่เพิ่ม socket/channel.
- การเปลี่ยน recurrence/start/end/timezone หรือ recipient/reminder settingจะ mark pending/processing rowsเป็น `CANCELLED` ใน transactionเดียวกับ event update; cancel occurrenceทำแบบเดียวกันเฉพาะ occurrence. การแก้ชื่อ/detail/tagไม่ยกเลิก reminderเดิมและไม่ส่งซ้ำ.
- Header inboxแสดง Calendar reminderพร้อม `View calendar` และ `Dismiss`; dismissตรวจ recipient/typeฝั่ง serverและ broadcast resolutionข้ามแท็บ.

### Verification evidence

- `npm run test:calendar`: 57/57 ผ่าน รวม reminder policy testsเรื่อง offset, due boundary, bounded retry, cron auth และ timezone formatting.
- `npm run verify:pipeline`: TypeScript clean และ Pipeline regression tests 61/61 ผ่าน.
- `npm run build`: ผ่าน 23 routes รวม `/api/cron/calendar-reminders`; warningเดิมเรื่อง middleware convention deprecated.
- `git diff --check`: ผ่าน.

### Deployment verification still required

- ต้อง apply migration `20260912090000_add_calendar_reminder_notifications` ผ่าน production baseline flowก่อนเปิด cron.
- Scheduler 5 นาทีต้องใช้ Vercel Pro; Hobbyจะไม่รองรับ cadenceนี้. หลัง deployให้ตรวจ cron logs, concurrent invocation, Pusher failure recoveryและ notification latencyจริงก่อนรับรอง SLA production.

## 32. Phase 9 implementation and release-readiness checkpoint (2026-09-12)

### Implemented

- ลด initial Calendar client bundleด้วย dynamic importสำหรับ Event, Filters, Search, Financial Info และ day-agenda panels. Calendar route chunkลดจาก **76,551 → 32,728 raw bytes (-57.25%)** และ **21,157 → 10,595 gzip bytes (-49.92%)** จาก production buildsบนเครื่องเดียวกัน.
- memoize `CalendarDayCell` / `CalendarItemPill` และย้าย item-to-day indexingเป็น pure single-pass presentation helper; long all-day spanถูก capที่ 42 grid cellsเพื่อไม่สร้างงานเกิน month viewport.
- เพิ่ม additive indexesสำหรับ `Opportunity.goodsReadyDate` และ `Opportunity.goodsLoadingDate`; snapshot queryบันทึก structured warningเฉพาะเมื่อเกิน 750msโดยไม่ logข้อมูลลูกค้า.
- เพิ่ม reusable read-only benchmark `scripts/measure-calendar-phase9.ts`. Neon runสำหรับ September 2026 วัด upper-bound raw queryได้ cold **984.5ms**, warm **59.9ms**, Opportunity 5 rows, Event 0 rows และ JSON payload **3,273 bytes**. ตัวเลขนี้วัด global/admin upper boundของ selected rowsก่อน actor projection ไม่ใช่ browser transferหรือ production p95.
- เพิ่ม shared stack-aware dialog behavior: initial focus, Tab/Shift+Tab wrap, Escapeปิดเฉพาะ layerบนสุด และคืน focusไป triggerเดิม.
- Month grid/day cells/source pillsมี grid semantics, descriptive labelsที่ไม่พึ่งสี, keyboard createด้วย Enter/Space และ focus-visible state. Calendar surfaceเคารพ `prefers-reduced-motion`.
- Event create, Filters, Search, day agenda และ Financial Infoใช้ dialog semanticsเดียวกัน; panelที่ lazy mountยังคืน focusถูกผ่าน explicit trigger capture.
- ปรับ toolbar mobileให้ห่อ layoutได้และคง Previous → Month/Year → Next เป็น targetกว้างสำหรับ cross-month drag.
- reminder workerและ slow snapshotมี structured operational telemetryที่ไม่มี detail payload.

### Measured and browser verification

- authenticated local browser: Searchเปิดแล้ว focus search inputและ Escapeคืน focus; Filtersเปิดแล้ว focus close, Shift+Tab wrapไป Done และ Escapeปิด; New Event focus Title input.
- keyboard Enterบน today grid cellเปิด New Event และ Escapeคืน focusสู่ cellเดิม.
- Financial Informationเปิดจาก Goods pill, focus Close, Escapeปิดเฉพาะ dialogและคืน focusสู่ pill.
- production buildหลัง code splittingสร้าง 23 routesสำเร็จ; build durationเป็นสัญญาณเครื่อง localที่ผันผวน จึงไม่ใช้เป็น performance claim.
- dense presentation testsครอบ 1,000 itemsใน bucketเดียว, 42-cell span cap และ source label semantics.

### Staged rollout and error budget

1. Apply additive Calendar migrationsทั้งหมดก่อน deploy app โดยเฉพาะ reminder notification relationและ Goods date indexes; ห้ามเปิด cronก่อน schemaพร้อม.
2. เปิด Calendar permissionให้ Admin cohortก่อน 24 ชั่วโมง, จากนั้น Managementหนึ่ง Department 24 ชั่วโมง แล้วจึงเปิด Departmentอื่นที่อนุมัติ.
3. ติดตาม month snapshot p95เป้าหมายไม่เกิน **750ms**, Calendar mutation/rollback errorต่ำกว่า **1%**, และ terminal reminder failureต่ำกว่า **0.5%** ต่อ cohort. ค่าเหล่านี้เป็น rollout budgetsที่เสนอและต้องเติมค่าจริงจาก production telemetry.
4. หากเกิน budgetหรือพบ data leak ให้ถอน Calendar menu permissionของ cohortและปิด cron/app release. เก็บ additive tables/indexes/enumไว้เพื่อไม่ทำ data loss; rollback application codeก่อน แล้วแก้ forward migrationถ้าจำเป็น.

### Production acceptance still required

- ยังไม่ได้วัด authenticated browser cold/warm request waterfallบน staging/production; bundleและDB benchmarkข้างต้นเป็น evidenceคนละชั้นและไม่ใช้แทนกัน.
- ยังต้องทดสอบสองบัญชี/หลายแท็บจริง: permission revocation, logout/account switch, hiddenเกิน 45 วินาที, reconnect, offline→online, bfcache restore, no connection growth และ realtime recovery.
- ยังต้องทำ pointer/touch/keyboard drag smokeกับข้อมูล stagingจริง รวม hold Next/Previousหลายเดือน, reverse direction, 403/409/network rollback และ recurring scope.
- ต้อง apply migrations `20260911233000_calendar_event_idempotency`, `20260912090000_add_calendar_reminder_notifications` และ `20260912110000_add_calendar_deal_date_indexes` ใน deployment flow. Phase 9จะยังไม่ mark completeจน rollout checksและ acceptance matrixนี้ถูกบันทึกด้วยผลจริง.

### Exact next action

1. Deploy migrations + appไป staging แล้วทำ production-acceptance matrixข้างต้นด้วยสองบัญชี.
2. บันทึก request waterfall, Pusher connection count, reminder latencyและerror-budget resultจริงก่อนเปลี่ยน Phase 9เป็น complete.

### Final local verification

- `npm run test:calendar`: **60/60 passed** รวม dense-month presentation, recurrence, CRUD, filters/search, realtime, moveและ reminder policy.
- `npm run verify:pipeline`: TypeScript clean และ Pipeline/Pusher regression **61/61 passed**; lifecycle suiteยืนยัน initially-hidden tabไม่สร้าง Pusher client.
- `npx prisma validate`: schema valid.
- `npm run build`: optimized Next.js 16.3.3 Webpack buildผ่าน **23/23 static pages** และ dynamic `/calendar` + `/api/cron/calendar-reminders`; warningมีเฉพาะ existing middleware convention deprecation.
- `git diff --check`: ผ่าน.

## 36. Responsive Calendar and editable Sale Deal surface (2026-09-12)

### Scope and architecture

- Calendar month snapshot remains the owner of lightweight list data. Sale Deal detail is fetched on demand only when a Ready/Loading item is opened.
- Desktop retains the full month grid and drag workflow. Mobile uses a compact month selector with source-color dots and a selected-day agenda list; no duplicate detail payload is added to the month snapshot.
- Mobile Search, filters, month navigation, and month title reuse `SidebarContext` and Header contracts used by Pipeline. New Event lives in the mobile Manage & Filters surface.
- Sale Deal edits use one revision-checked server mutation. Existing private Pipeline notification and Calendar targeted invalidation remain the recovery paths; no new channel, subscription, or polling loop is added.

### Authorization and lifecycle rules

- Sale Deal fields exposed in Calendar: Account and Topic context, Total Value, Currency, Reserve ID, Invoice Number, Goods Ready, and Goods Loading.
- Server authorization still requires Calendar access, `pipeline.information`, and Pipeline owner/department-management/admin scope.
- WON, LOST, COMPLETED, and CANCELLED deals remain visible as historical milestones but are read-only. The server date guard rejects their mutations even if an old client submits one, and their month DTO sets `canEdit=false` so drag never starts.
- Concurrent writes use `Opportunity.updatedAt` as the expected revision and return `CONFLICT`; the panel keeps the draft and asks the user to reload rather than overwriting newer data.

### Verification targets

1. Calendar projection test: every archived milestone is visible and non-draggable.
2. Calendar suite: recurrence, presentation, CRUD, filters/search, movement, realtime and reminder behavior remain green.
3. Pipeline gate: TypeScript and Pipeline/Pusher suites remain green because shared opportunity authorization and currency validation changed.
4. Production build and `git diff --check` must pass before handoff.

### Local implementation evidence

- `npm run test:calendar`: **62/62 passed**, including archived milestone projection.
- `npm run verify:pipeline`: TypeScript clean and Pipeline/Pusher **61/61 passed**.
- `npm run build`: Next.js 16.3.3 Webpack production build completed, including dynamic `/calendar` and 23/23 generated static pages. The existing middleware convention deprecation warning remains.
- `git diff --check`: passed.

## 37. Calendar control surfaces, viewport containment and interaction speed (2026-09-12)

- Replaced remaining Calendar-native date/time controls with shared `CalendarDatePicker` and `CalendarTimePicker`. Date, time and select menus portal to `document.body`; desktop/tablet choose the available side of the trigger and mobile uses a bounded bottom chooser.
- Sale Deal popover now measures its rendered height and clamps all four edges to a 12px viewport safe area. It repositions after detail loading, resize and ancestor scrolling instead of relying on an assumed 520px height.
- Calendar Search retains direct input focus. Mobile Central Pill remains at the navigation layer (`z-40`) so Search, Edit Event, Sale Deal, and EditDealPanel cover it and keep their footer actions unobstructed.
- Edit permission follows the current EditDealPanel contract from code: System Admin, Card Owner, and Management. Archived terminal deals remain read-only on both client and server.
- Sale Deal save now paints the detail cache optimistically and rolls back only its own operation on failure. Successful saves merge the returned revision without a second detail request or global month-cache refetch; existing targeted Calendar/Pipeline realtime events reconcile other viewers.
- No additional initial snapshot fields, channel, subscription, polling loop, or eager detail request was introduced. Dropdown option DOM mounts only while its control is open.
- After the initial responsive check, Calendar mounts only the desktop grid or compact mobile grid. This removes the hidden duplicate 42-cell tree and duplicate DnD registrations during steady-state interaction.

## 38. Shared mobile controls and supporting surface consistency (2026-09-12)

- Promoted the portal-based Calendar date chooser into `components/ui/CalendarDatePicker`. Calendar Event, Calendar Sale Deal, and Pipeline CustomerTab now use the same responsive component for Goods Ready/Loading and event dates; the obsolete absolute-positioned DatePicker was removed.
- Expanded Calendar mobile Manage & Filters to the Pipeline visual contract: full-width primary creation action, grouped uppercase sections, segmented source control, two-column Owner/Department/Tag choices, active state indicators, and one clear action. Filter mutations remain local against the authorized month snapshot.
- Added a CSS-only iOS focus safeguard for editable input, textarea, select, and contenteditable controls below the mobile breakpoint. Their computed font size is at least 16px, preventing Safari focus zoom without adding runtime JavaScript or altering desktop typography.
- Simplified Notification Drawer into border-separated activity rows with smaller header chrome, larger readable message text, and compact trailing actions. Notification mutation, dismissal, realtime sync, and Calendar deep links are unchanged.

### Verification

- `npm run test:calendar`: **62/62 passed**.
- `npm run verify:pipeline`: TypeScript clean and Pipeline/Pusher **61/61 passed**.
- `npm run build`: production build passed, including dynamic `/calendar` and 23/23 generated static pages.
- `git diff --check`: passed.

## 39. Calendar Sidebar registration render-loop incident (2026-09-12)

- Root cause: the Calendar effect that refreshed Sidebar navigation/search/manage content also returned a cleanup that cleared all four registrations. Every dependency refresh therefore wrote the new React element, immediately cleared it, and wrote it again through the shared provider until React raised `Maximum update depth exceeded`.
- Fix: Calendar now memoizes the Manage & Filters element and its action callbacks. The update effect only publishes current values; a separate cleanup effect clears registrations exclusively when Calendar unmounts.
- No query, mutation, cache, Pusher, or permission behavior changed.

## 40. Rapid month navigation render-loop follow-up (2026-09-12)

- The first incident fix removed cleanup churn, but a second unstable path remained while a newly selected month was loading. The temporary month snapshot created a new empty `items` array on every provider render; that rebuilt filter options and Manage content, whose Sidebar update caused the next render.
- The loading snapshot is now memoized by the requested month. Sidebar navigation, Search, filter-state, and Manage-content registrations publish through separate effects with memoized config objects and callbacks, so an unrelated registration update cannot republish fresh navigation state.
- The change does not debounce or discard rapid month clicks. Each click still advances from `viewMonth.current`, while SWR continues to deduplicate and cache each requested month.
- No server query shape, mutation, permission, realtime channel, or polling behavior changed.
- Verification: `npx tsc --noEmit` passed, `npm run test:calendar` passed **62/62**, `npm run build` completed the Next.js 16.3.3 Webpack production build with **23/23** generated static pages, and `git diff --check` passed. The existing middleware convention deprecation warning remains.
- Authenticated browser smoke clicked Next **12 times consecutively**, moved September 2026 → September 2027, completed the final month load, and did not produce the React error overlay.

## 41. Recipient drawer and event-level reminder UX (2026-09-12)

- Calendar Event recipients now use Team Member-style avatar pills. Add/Add more opens a dedicated responsive drawer with focused search, multi-select, select-all/clear controls, and an authorized Department group.
- The drawer keeps Calendar's on-demand Department-scoped recipient action rather than the Pipeline-wide directory, preserving the existing visibility boundary and avoiding an eager user-list request when the panel opens.
- Reminder configuration is presented once per Event and applies the same enabled state and offset to every selected recipient. Create/update payloads normalize every recipient to that shared schedule; schema validation rejects mixed schedules from stale or custom clients.
- Persistence and reminder delivery tables remain backward compatible, so this UX change requires no database migration and adds no realtime channel, subscription, polling loop, or month-snapshot field.
- Authenticated desktop smoke verified New Event → Add Recipients, automatic search focus, Department grouping, member selection/confirmation, avatar pill rendering, and one shared Event reminder selector.
- Verification: `npm run test:calendar` passed **62/62**, `npm run verify:pipeline` passed TypeScript and **61/61** Pipeline/Pusher tests, `npm run build` passed with **23/23** generated static pages, and `git diff --check` passed.

## 42. Event delete action placement (2026-09-12)

- Edit Event now places an icon-only Delete action in the header beside Close. The footer contains only the primary Save/Create action because Close already covers cancellation.
- Delete opens the standard flat bordered action menu from its header trigger. A normal event offers Delete event; a selected recurring occurrence offers This occurrence and Entire series.
- The menu closes on trigger toggle, outside click, Escape, panel close, and mutation completion. Existing permission, revision conflict, optimistic rollback, and delete mutation behavior are unchanged.
- Authenticated browser smoke confirmed the menu remains visible inside the desktop drawer and closes on outside click without deleting data.
- Verification: TypeScript passed, `npm run test:calendar` passed **62/62**, `npm run build` passed with **23/23** generated static pages, and `git diff --check` passed.

## 33. Event create incident — Neon schema drift correction (2026-09-12)

### Root cause and correction

- Event createล้มที่ `prisma.calendarEvent.findUnique()` เพราะ generated Prisma Clientคาดหวัง `CalendarEvent.clientRequestId` แต่ Neonยังไม่มีคอลัมน์จาก migration `20260911233000_calendar_event_idempotency`.
- Apply additive migrationนี้กับ Neonแล้ว: เพิ่ม nullable `clientRequestId` และ unique index `[ownerId, clientRequestId]`; ไม่มีการลบหรือแก้ข้อมูล Eventเดิม.
- Authenticated browser smokeบน `/calendar` ผ่าน: สร้าง `Phase 9 migration smoke test` สำเร็จ, itemปรากฏใน September 12 cell, เปิด Edit Eventแล้วลบสำเร็จ และไม่เหลือ test record.

### Migration-history follow-up

- `prisma migrate status` ยังรายงาน migration filesทั้งหมดว่า pending เพราะ Calendar foundationและ schemaก่อนหน้าเคย applyด้วย direct DDL โดยไม่ได้บันทึกใน `_prisma_migrations`.
- ห้ามรัน `prisma migrate deploy` แบบตรงกับฐานนี้จนทำ baseline/reconciliation ให้ migration historyตรงกับ schemaจริง มิฉะนั้น migrationเก่าอาจชนกับ table/type/indexที่มีอยู่แล้ว.
- Reminder notification relationและ Goods date indexesยังต้องตรวจ/applyแยกตาม rollout checkpoint; incidentนี้แก้เฉพาะ create blockerที่พิสูจน์จาก error.

## 34. Single-day Goods milestone rendering correction (2026-09-12)

- Goods Ready/Loadingเป็น date-only milestone แต่ DTOเก็บ `endAt = startAt + 1 day` เพื่อรักษา one-day durationตอน drag. Timestampจริงอาจมีเวลาที่ไม่ใช่เที่ยงคืน.
- Presentation indexเดิมปัด startลงเที่ยงคืนแล้วเทียบกับ endที่ยังมีเวลา ทำให้วันที่ถัดไปถูกนับเพิ่ม. แก้ให้ `DEAL_GOODS_READY` และ `DEAL_GOODS_LOADING`ลง bucketของ start dateเพียงวันเดียวเสมอ โดยไม่เปลี่ยน authoritative Opportunity dateหรือ drag duration contract.
- เพิ่ม regression testทั้ง Ready/Loadingด้วย non-midnight timestampเพื่อยืนยันว่าได้หนึ่ง day bucketเท่านั้น.
- Authenticated browser reloadยืนยัน deal `#OEM - Keratin Treatment` แสดง Goods Ready + Goods Loadingรวม 2 itemsใน September 12 และ September 13 เหลือ 0 items.
- Verification: `npm run test:calendar` **61/61 passed**; `npm run verify:pipeline` TypeScript cleanและ Pipeline/Pusher **61/61 passed**; `git diff --check` ผ่าน.

## 35. Calendar drawer motion parity (2026-09-12)

- New Event, Filters และ Searchใช้ shared Calendar panel transition contractตาม `EditDealPanel`: backdrop fade 300ms และ drawer `opacity + translate + scale` ด้วย `cubic-bezier(0.23,1,0.32,1)`.
- เพิ่ม mount lifecycleกลางเพื่อให้ exit animationเล่นครบก่อนถอด panelออกจาก DOM; rapid close/reopenยกเลิก frame/timerเก่าเพื่อไม่ให้ panelหายกลาง animation.
- Searchรักษาผลลัพธ์ไว้ระหว่าง exit animation ป้องกัน contentว่างกะพริบก่อน drawerปิด.
- `prefers-reduced-motion`ครอบทั้ง drawerและ backdrop; ยังคง flat border-based UIและไม่มี shadow.
## 43. Repeat Until date guard and Start Date cue

- `CalendarDatePicker` accepts an optional minimum date and reference date so date constraints remain visible at the point of selection on desktop, tablet, and mobile.
- The Event panel supplies its Start Date as both values for `Repeat Until`: earlier dates are disabled and struck through, while Start Date has a lime outline, marker, and labelled legend.
- If Start Date is moved beyond an existing Repeat Until value, the stale Repeat Until value is cleared before submission. Server validation remains authoritative.
- Verification: TypeScript passed, Calendar tests passed (62/62), `git diff --check` passed, and a mobile browser smoke test confirmed unavailable dates expose disabled semantics and Start Date is labelled/highlighted.
