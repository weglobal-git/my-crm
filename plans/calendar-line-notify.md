# Department LINE Morning Digest Plan

> **สถานะ:** แผนงานก่อนเริ่มพัฒนา  
> **ปรับปรุงล่าสุด:** 2026-09-14  
> **เป้าหมาย:** ส่งสรุป Calendar Event และรายงานยอดขายที่เกี่ยวข้องเข้ากลุ่ม LINE ของแต่ละแผนกไม่เกินวันละ 1 ครั้ง โดยใช้ LINE Official Account แพ็กเกจ Free และไม่เสียค่าใช้จ่าย  
> **เทคโนโลยี:** LINE Messaging API — บริการ LINE Notify เดิมยุติให้บริการแล้วเมื่อ 31 มีนาคม 2025

---

## 1. ข้อตกลงของ V1

ระบบรุ่นแรกจะทำเฉพาะ **Department Morning Digest** ดังนี้:

- ส่งเข้า LINE Group ของแผนกเท่านั้น
- ส่งไม่เกิน 1 API request ต่อแผนกต่อวัน
- แผนกทั่วไปได้รับเฉพาะ Calendar Event ที่เจ้าของ Event เปิด `Include in LINE morning digest`
- แผนกที่ได้รับ permission `pipeline.information` (ชื่อใน UI: `Sale Deal`) ได้รับ Sales Summary เพิ่มใน digest เดียวกัน
- ถ้าวันนั้นไม่มีทั้ง Event ที่เปิดไว้และข้อมูล Sales Summary ที่เข้าเงื่อนไข จะไม่ส่งข้อความ
- ไม่ส่ง Event ทันทีตามเวลาเตือน และไม่ส่งแยกทีละ Event
- ไม่ส่ง Goods Ready Date หรือ Goods Loading Date
- ไม่ส่ง Deal assignment, Deal won/lost แบบ realtime, mention หรือ notification ประเภทอื่น
- ไม่ส่ง LINE แบบรายบุคคล และยังไม่ทำการเชื่อมบัญชี LINE กับ User

สิ่งที่อยู่นอกขอบเขตนี้ต้องออกแบบและประเมินโควต้าใหม่ก่อนเพิ่มในอนาคต

---

## 2. Recipients, Department และ LINE มีหน้าที่ต่างกัน

ห้ามใช้ Recipients เป็นตัวกำหนดผู้รับ LINE Group เพราะสมาชิกทุกคนในกลุ่มจะอ่านข้อความได้

| ข้อมูล | หน้าที่ |
| --- | --- |
| `CalendarEvent.departmentId` | ระบุว่า Event เป็นของแผนกใด และเลือก LINE Group ปลายทาง |
| `CalendarEventRecipient` | ระบุผู้ที่เห็น Event และรับ in-app reminder ภายใน CRM |
| `includeInLineDigest` | อนุญาตให้นำ Event ไปเผยแพร่แก่สมาชิกทุกคนใน LINE Group ของแผนก |

### กติกา Event

- UI เลือก Recipients ยังคงอยู่ตามเดิม ไม่เปลี่ยนเป็นตัวเลือก Department
- Department ของ Event ยังคงเป็นปลายทางของ LINE Group
- เพิ่ม checkbox ระดับ Event ชื่อ `Include in LINE morning digest`
- ค่าเริ่มต้นเป็น `false` เพื่อป้องกันข้อมูลส่วนตัวหลุดเข้ากลุ่ม
- เมื่อเปิด checkbox ต้องแสดงคำเตือนว่า สมาชิกทุกคนใน LINE Group ของแผนกจะเห็น Event นี้ แม้ไม่ได้อยู่ใน Recipients
- การปิด in-app reminder ของ Recipient ต้องไม่เปลี่ยนสถานะ LINE digest ของ Event
- ก่อนส่ง ระบบต้องตรวจซ้ำว่า Event ยังอยู่ในแผนกเดิม ยังไม่ถูกยกเลิก และยังเปิด `includeInLineDigest`

---

## 3. โควต้าและเงื่อนไขใช้ฟรี 100%

LINE OA แพ็กเกจ Free มีโควต้า **300 ข้อความต่อเดือน** และซื้อข้อความเพิ่มไม่ได้

LINE คิดโควต้าตามจำนวนผู้ได้รับข้อความ ไม่ใช่จำนวนครั้งที่เรียก API:

```text
โควต้าที่ใช้ต่อเดือน
= ผลรวมของ (จำนวนสมาชิกในแต่ละกลุ่ม × จำนวนวันที่กลุ่มนั้นได้รับ Digest)
```

| รูปแบบใช้งาน | โควต้าประมาณการ 30 วัน |
| --- | ---: |
| 1 กลุ่ม × 5 คน × 30 วัน | 150 |
| 2 กลุ่ม × 5 คน × 30 วัน | 300 |
| 1 กลุ่ม × 10 คน × 30 วัน | 300 |
| 1 กลุ่ม × 20 คน × 30 วัน | 600 — ใช้ Free ไม่ได้ |

### Budget policy

- ตั้ง soft budget ของ CRM ที่ **250 ข้อความต่อเดือน** เพื่อเหลือ buffer 50 ข้อความ
- ก่อนส่งต้องตรวจโควต้าจริงจาก LINE Messaging API:
  - `GET /v2/bot/message/quota`
  - `GET /v2/bot/message/quota/consumption`
- Local quota ledger ใช้สำหรับ reservation, audit และป้องกัน worker ชนกัน แต่ไม่ใช่ source of truth เพียงตัวเดียว เพราะข้อความจาก LINE OA Manager ใช้โควต้าเดียวกัน
- ถ้าการส่งครั้งถัดไปอาจเกิน soft budget หรือโควต้าจริง ให้บันทึก `SKIPPED_QUOTA` และไม่ส่ง
- จำนวนสมาชิกกลุ่มอาจเปลี่ยนได้ จึงต้องติดตามค่าที่ใช้ประเมินและแจ้งผู้ดูแลเมื่อแผน Free เริ่มไม่เพียงพอ
- เป้าหมาย “ฟรี 100%” รับประกันได้ต่อเมื่อผลรวมจำนวนผู้รับจริงยังไม่เกินโควต้า ไม่สามารถรับประกันจากกฎวันละหนึ่งครั้งเพียงอย่างเดียว

ข้อความหนึ่ง request สามารถมีได้สูงสุด 5 message objects โดยจำนวน objects ไม่เพิ่มโควต้า ส่วน Flex carousel รองรับสูงสุด 12 bubbles และ payload สูงสุด 50 KB

---

## 4. สถาปัตยกรรมที่ต้องใช้

LINE digest ต้องแยกจาก in-app notification โดยเด็ดขาด:

```text
In-app reminder (ระบบเดิม)
Calendar Event → Recipients → CalendarReminderDelivery → Notification → Pusher รายบุคคล

LINE Morning Digest (ระบบใหม่)
Department → Event ที่ opt-in + Sales Summary ตาม permission
           → Digest builder → LineDigestDelivery → LINE Group
```

### ข้อห้าม

- ห้ามเพิ่ม LINE push ลงใน `src/lib/notification-dispatcher.ts`
- ห้ามเรียก LINE จาก `runCalendarReminderWorker`
- ห้าม reuse `CalendarReminderDelivery` เป็นตัวกันส่งซ้ำของ LINE digest
- ห้ามใช้ Deal members หรือ Pipeline recipient resolver เป็นผู้รับ LINE
- ห้าม mark digest เป็น `SENT` ก่อน LINE API ตอบรับสำเร็จ

### โมดูลที่เสนอ

```text
src/lib/line/line-client.ts              เรียก LINE API และอ่าน quota
src/lib/line/line-webhook.ts             ตรวจ signature และประมวลผล webhook
src/lib/line/line-group-binding.ts       ผูก/ยกเลิกกลุ่มกับ Department
src/lib/line/calendar-digest-query.ts    อ่าน Event ที่ opt-in ของวันและแผนก
src/lib/line/sales-digest-query.ts       อ่านยอดขายตามกติกาและ permission ของแผนก
src/lib/line/department-digest-template.ts สร้าง Flex Message รวม Event และ Sales Summary
src/lib/line/calendar-digest-worker.ts   claim, reserve quota, send และบันทึกผล
src/app/api/line/webhook/route.ts         LINE webhook endpoint
src/app/api/cron/line-digest/route.ts     cron endpoint แยกจาก reminder เดิม
```

---

## 5. การผูก LINE Group กับ Department

V1 ไม่ต้องเพิ่ม `lineUserId` หรือ pairing UI ใน User Profile

1. เปิด `Allow bot to join group chats` ใน LINE Developers Console
2. เชิญ LINE OA เข้ากลุ่มของแผนก
3. ผู้ดูแลที่มีสิทธิ์สร้าง group binding code แบบสุ่ม ใช้ครั้งเดียว และมีวันหมดอายุ
4. ผู้ดูแลส่ง code ใน LINE Group
5. webhook ตรวจ signature, code และสิทธิ์ แล้วบันทึก `groupId` ให้ Department
6. บอทตอบยืนยันด้วย reply message

ข้อกำหนดด้านความปลอดภัย:

- ตรวจ `x-line-signature` จาก raw request body ทุกครั้ง
- dedupe webhook ด้วย `webhookEventId` เพราะ LINE อาจ redeliver
- group binding code ต้องเก็บแบบ hash, มีอายุสั้น และใช้ได้ครั้งเดียว
- `lineGroupId` ต้อง unique เพื่อป้องกันผูกกลุ่มเดียวกับหลาย Department โดยไม่ตั้งใจ
- เมื่อบอทออกหรือถูกนำออกจากกลุ่ม ให้ disable binding และแจ้งผู้ดูแลใน CRM
- ห้ามบันทึก channel token หรือ secret ลงฐานข้อมูลและ log

---

## 6. โครงสร้างข้อมูลที่เสนอ

ชื่อและชนิดจริงให้ยืนยันอีกครั้งตอน implement กับ Prisma schema ปัจจุบัน

```prisma
model Department {
  // existing fields...
  lineGroupId        String? @unique
  lineDigestEnabled  Boolean @default(false)
  lineDigestTime     String  @default("08:30")
  lineDigestTimezone String  @default("Asia/Bangkok")
}

model CalendarEvent {
  // existing fields...
  includeInLineDigest Boolean @default(false)
}

model LineDigestDelivery {
  id                  String   @id @default(cuid())
  departmentId        String
  digestDate          String   // business date: YYYY-MM-DD
  destinationGroupId  String
  status              String   @default("PENDING")
  attempts            Int      @default(0)
  estimatedRecipients Int?
  reservedQuota       Int?
  payloadHash         String?
  lineRequestId       String?
  sentAt              DateTime?
  lastError           String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@unique([departmentId, digestDate, destinationGroupId])
  @@index([status, digestDate])
}

model LineWebhookReceipt {
  webhookEventId String   @id
  processedAt    DateTime @default(now())
}
```

Local quota/reservation อาจเก็บในตารางแยก แต่ต้องรองรับ atomic reservation เมื่อ cron หลาย instance ทำงานพร้อมกัน

---

## 7. กติกาการสร้างและส่ง Morning Digest

- ใช้ business date และเวลา `Asia/Bangkok` เป็นค่าเริ่มต้น
- query เฉพาะ Event ของ Department นั้น ซึ่งเกิดในวันดังกล่าวและ `includeInLineDigest = true`
- ตรวจ `DepartmentMenuPermission.visible = true` สำหรับ menu key `pipeline.information`; ถ้ามีจึงเพิ่ม Sales Summary
- permission ใช้กำหนดว่าแผนกมีสิทธิ์รับส่วน Sales หรือไม่ แต่ไม่ใช้แทนกติกาว่า Deal ใดเป็นของแผนกนั้น
- Sales Summary ต้องอ่านจาก server-side query เฉพาะฟิลด์ที่จำเป็น และไม่ใช้ Deal members เป็นผู้รับ
- เคารพ recurring-event exceptions, cancellation และเวลาที่ override
- snapshot เนื้อหาหลัง claim delivery เพื่อให้ retry ใช้ payload เดิม
- ถ้าไม่มีทั้ง Event และ Sales Summary ที่เข้าเงื่อนไข ให้บันทึก `SKIPPED_EMPTY` โดยไม่เรียก LINE API
- ถ้ามีรายการมากเกินขนาดการ์ด ให้แสดงรายการตามเวลาสูงสุดที่กำหนด แล้วต่อท้าย `และอีก N รายการ` พร้อมปุ่มเปิด Calendar
- ห้ามแบ่งเป็นข้อความที่สองในวันเดียวกัน
- Event ที่ถูกเพิ่มหรือแก้ไขหลังส่ง digest แล้วจะเห็นใน CRM แต่ไม่ส่ง LINE เพิ่มในวันนั้น
- ลิงก์กลับ CRM ต้องผ่าน authentication และ server authorization ตามปกติ

```text
PENDING → PROCESSING → SENT
                     ↘ FAILED (retry แบบจำกัด)
PENDING → SKIPPED_EMPTY | SKIPPED_QUOTA | SKIPPED_DISABLED
```

กรณี network timeout หลังส่ง ต้องถือเป็น unknown outcome และตรวจสอบก่อน retry เพื่อหลีกเลี่ยงข้อความซ้ำ

---

## 8. รูปแบบข้อความ

หนึ่ง Flex Message ประกอบด้วย:

- Header: `MORNING CALENDAR — <Department>`
- วันที่และ timezone
- รายการ Event เรียงตามเวลา
- เวลาเริ่ม–สิ้นสุด หรือ `All day`
- ชื่อ Event และผู้จัด
- สำหรับแผนก Sale Deal: Sales Summary ตามสูตรธุรกิจที่อนุมัติแล้ว
- ข้อความ `และอีก N รายการ` เมื่อมีรายการเกินเพดาน
- ปุ่ม `เปิด Calendar ใน CRM`

ไม่แสดง Goods Ready หรือ Goods Loading ใน V1 และไม่ส่งรายละเอียด Deal รายใบที่เกินขอบเขตของ Sales Summary

---

## 9. แผนดำเนินงานแบบ Vertical Slice

### Phase 1 — ยืนยันความเป็นไปได้ของ Free plan

- [ ] บันทึกจำนวน Department ที่จะเปิดใช้และจำนวนสมาชิกแต่ละ LINE Group
- [ ] คำนวณ worst case และยืนยันว่าไม่เกิน soft budget 250 ข้อความต่อเดือน
- [ ] สร้าง LINE OA, Messaging API channel, token และ secret
- [ ] ทดลองเชิญ bot เข้ากลุ่มทดสอบและตรวจว่าได้รับ `groupId`

**Exit criteria:** มีตัวเลขโควต้าจริงและส่งข้อความทดสอบเข้ากลุ่มได้ โดยยังไม่เชื่อมกับข้อมูล production

### Phase 2 — Group binding และความปลอดภัย

- [ ] เพิ่ม Department LINE settings และ migration
- [ ] สร้าง webhook พร้อม signature validation และ webhook dedupe
- [ ] สร้าง one-time group binding flow พร้อม server-side permission check
- [ ] รองรับ unbind และ bot leave event

**Exit criteria:** ผูก/ยกเลิกกลุ่มได้, spoofed webhook ถูกปฏิเสธ และ redelivery ไม่ประมวลผลซ้ำ

### Phase 3 — Event opt-in, Sales Summary และ Digest preview

- [ ] เพิ่ม `includeInLineDigest` ใน Calendar Event
- [ ] เพิ่ม checkbox ที่แยกจาก Recipients/reminder settings พร้อมคำเตือนเรื่องการเปิดเผยข้อมูล
- [ ] สร้าง query และ Flex template พร้อม preview โดยยังไม่ส่งจริง
- [ ] สร้าง Sales Summary query สำหรับ Department ที่มี `pipeline.information`
- [ ] ยืนยันสูตรยอดขาย, วันที่ตัดยอด, currency และกติกาการผูก Deal กับ Department ก่อนเปิดส่งจริง
- [ ] ครอบคลุม recurring exceptions, cancelled Event, empty day และ overflow

**Exit criteria:** preview ตรงกับ Event ที่ opt-in, แสดง Sales Summary เฉพาะ Department ที่มีสิทธิ์ และไม่มี Goods Ready/Loading ปะปน

### Phase 4 — Delivery worker และ quota guard

- [ ] สร้าง `LineDigestDelivery` และ atomic daily claim
- [ ] เชื่อม LINE quota/consumption API และ local reservation
- [ ] สร้าง cron endpoint ที่มี secret authentication
- [ ] ส่งจริงหลัง LINE ตอบสำเร็จจึง mark `SENT`
- [ ] จำกัด retry และเก็บ error/request ID สำหรับ audit

**Exit criteria:** cron ซ้ำหรือ worker พร้อมกันไม่ทำให้แผนกเดียวได้รับเกินวันละหนึ่งครั้ง และระบบหยุดก่อนเกิน budget

### Phase 5 — End-to-end verification

- [ ] ทดสอบกลุ่มจริงทั้ง LINE Mobile และ Desktop
- [ ] ทดสอบหลาย Department, timezone boundary และต้น/สิ้นเดือน
- [ ] ทดสอบสมาชิกกลุ่มเปลี่ยนและ quota ใกล้เต็ม
- [ ] ทดสอบ Event ถูกย้ายแผนก/ปิด opt-in/ยกเลิกก่อนส่ง
- [ ] ยืนยันว่า in-app reminder เดิมยังทำงานและไม่เรียก LINE

**Exit criteria:** ผ่าน test matrix, delivery audit ถูกต้อง และบันทึกยอดโควต้าที่ใช้จริง

---

## 10. สิ่งที่แก้จากแผนเดิม

- ตัด LINE 1-on-1 และ User account linking ออกจาก V1
- ตัด Goods Ready/Loading และ Pipeline realtime notifications ออกจาก V1 แต่คง Sales Summary สำหรับ Department ที่มีสิทธิ์ Sale Deal
- เปลี่ยนจาก realtime Event reminder เป็น Morning Digest วันละหนึ่งครั้ง
- แยก Event-level LINE opt-in ออกจาก Recipient reminder
- แยก LINE worker ออกจาก `notification-dispatcher` และ Calendar reminder worker เดิม
- เพิ่ม group binding flow แทน user pairing flow
- เปลี่ยน quota guard ให้ใช้ LINE quota API ร่วมกับ atomic local reservation
- เพิ่ม delivery ledger ที่ unique ต่อ Department + business date + destination group
- เพิ่ม webhook signature validation, redelivery dedupe และ leave/unbind handling
- แก้ความเข้าใจเรื่อง message objects, Flex bubbles และการคิดโควต้าตามจำนวนผู้รับ

---

## 11. ประเด็นที่ต้องยืนยันก่อนเริ่มพัฒนา

1. มีกี่ Department ที่จะเปิดใช้ และแต่ละกลุ่มมีสมาชิกประมาณกี่คน
2. ส่งทุกวันหรือเฉพาะวันทำงาน
3. เวลา digest ของทุกแผนกใช้ 08:30 Asia/Bangkok เหมือนกันหรือไม่
4. จำนวน Event สูงสุดที่ต้องแสดงก่อนใช้ `และอีก N รายการ`
5. ใครมีสิทธิ์ผูกกลุ่ม, เปิด/ปิด digest และเปิด Event opt-in
6. Sales Summary หมายถึงยอดใด: WON วันนี้, ยอดสะสมเดือน, หรือทั้งสองอย่าง
7. ใช้วันใดเป็นวันตัดยอด และจัดการหลาย currency อย่างไร
8. Deal ใดถือเป็นของ Department เมื่อ owner อยู่หลายแผนก

ห้ามเริ่ม implementation จนกว่าจะยืนยันข้อ 1 และคำนวณแล้วว่า Free plan เพียงพอ ส่วน Sales Summary ห้ามเปิดส่งจริงจนกว่าจะยืนยันข้อ 6–8
