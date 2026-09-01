---
name: pipeline-won-lost-workflow
description: Business rules and UI workflow for marking Pipeline opportunities as WON or LOST, depending on department menu permissions.
---

# ระบบ Pipeline Won/Lost Workflow (Drag-to-Zone)

## 1. การลากลง Action Zone (Drag and Drop)
เมื่อผู้ใช้ลากการ์ดใน Kanban Board จะมีโซนพิเศษปรากฏขึ้นที่ด้านล่างของหน้าจอ:
- **WON Zone (สีเขียว)** สำหรับงานที่สำเร็จ
- **LOST Zone (สีแดง)** สำหรับงานที่ไม่สำเร็จ

## 2. เงื่อนไขและ Business Logic แบบ Dynamic (อิงตาม Card Type)
เพื่อให้ระบบยืดหยุ่นและรองรับงานที่ไม่ได้เกี่ยวข้องกับลูกค้าโดยตรง เราจะแบ่งประเภทของการ์ด (Opportunity Type) ออกเป็นประเภทต่างๆ เช่น `SALES_DEAL` และ `INTERNAL_TASK` กติกาการปิดงานจะอิงจากประเภทของการ์ดใบนั้นๆ เป็นหลัก

### 2.1 กรณีลากลง WON (สีเขียว)
- **เงื่อนไข (Card Type: Sales Deal):** หากการ์ดถูกกำหนดประเภทเป็นงานขาย
  - ระบบจะเด้งหน้าต่าง Modal บังคับให้ระบุข้อมูลสำคัญให้ครบถ้วนก่อนปิดงาน ได้แก่:
    1. **Total Value** และ **Currency** (ยอดขายและสกุลเงิน)
    2. **Goods Loading Date** (วันที่โหลดสินค้า)
    3. **Invoice Number** (เลขที่ใบแจ้งหนี้)
  - ต้องกรอกข้อมูลทั้งหมดนี้ให้ครบถ้วนก่อนจึงจะกด ยืนยันปิดงาน (Won) ได้
- **เงื่อนไข (Card Type: Internal Task หรืออื่นๆ):** หากการ์ดไม่ใช่การขาย
  - ระบบจะอนุญาตให้จบงานได้เลยโดยไม่จำเป็นต้องกรอก "Goods Loading Date"
  - อาจจะมีเพียง Modal ถามยืนยันสั้นๆ ว่า "คุณต้องการปิดงานนี้ใช่หรือไม่?"

### 2.2 กรณีลากลง LOST (สีแดง)
- **เงื่อนไข (ทุกประเภท):** 
  - เมื่อผู้ใช้ลากการ์ดลง LOST ระบบจะเด้งหน้าต่าง Modal บังคับให้กรอก **"Loss Reason"** เสมอ 
  - (ยกเว้นในอนาคตถ้าตกลงกันว่า Internal Task ถ้ายกเลิกไม่ต้องมีเหตุผล ก็สามารถขยาย Logic ตรงนี้ได้)

## 3. การสร้างการ์ดและการผูกกับลูกค้า (Card Creation & Linking)
ในกระบวนการสร้างการ์ด (Create Card) จะมีการเพิ่มขั้นตอนดังนี้:
1. **เลือกประเภท (Type Selection):** ในหน้าต่าง Create Opportunity จะมี Dropdown ให้เลือกประเภทของการ์ด เช่น `Sales Deal` หรือ `Internal Task` 
2. **การผูกลูกค้า (Customer Linking):** 
   - หากเลือกประเภทเป็น `Sales Deal` ระบบอาจจะแนะนำ (หรือบังคับ) ให้ค้นหาและผูกลูกค้าทันทีตั้งแต่ตอนสร้าง
   - หากเลือก `Internal Task` ข้อมูลลูกค้าจะเป็นตัวเลือกเสริม (Optional) หรือซ่อนฟิลด์ลูกค้าไปเลย
3. **การผูกหลังจากสร้างเสร็จ:** ผู้ใช้ยังสามารถเข้าไปที่หน้า Edit Card -> แท็บ **Customer Information** เพื่อเลือกผูกลูกค้าได้ตลอดเวลา (ผ่าน Search Dropdown ของลูกค้าที่มีอยู่ในระบบ)

## 4. สัญลักษณ์บนการ์ด (Visual Indicators)
เพื่อให้สามารถมองเห็นภาพรวมของบอร์ดได้อย่างรวดเร็ว (Glanceable) จะมีการทำสัญลักษณ์บนการ์ด Kanban:
- **Badge/Icon มุมการ์ด:** แสดง Icon ตาม `OpportunityType` (เช่น ไอคอน 💰 สำหรับ Sales Deal, ไอคอน 🛠️ สำหรับ Internal Task)
- **Tag สี (Color Coding):** อาจจะใช้แถบสีเล็กๆ ด้านข้างการ์ด หรือพื้นหลังของ Badge เพื่อแยกความแตกต่าง (เช่น เขียว=Sales, เทา=Internal)
- **Customer Label:** ถ้าการ์ดใบไหนมีการผูกกับลูกค้าแล้ว ให้แสดงชื่อหรือโลโก้บริษัทของลูกค้าเล็กๆ ไว้บนการ์ดด้วย เพื่อให้รู้ว่าการ์ดนี้เป็นของลูกค้าคนไหนโดยไม่ต้องกดเข้าไปดู

## 5. สิ่งที่ต้องทำเพิ่มในระดับ Database (Schema Update)
จะต้องมีการเพิ่มฟิลด์ลงใน Prisma Schema ของ Model `Opportunity` เช่น:
```prisma
enum OpportunityType {
  SALES_DEAL
  INTERNAL_TASK
  PARTNERSHIP
}

model Opportunity {
  // ... existing fields ...
  type  OpportunityType  @default(SALES_DEAL)
}
```

## 6. การแสดงผลเมื่อเสร็จสิ้น
เมื่อกดยืนยันการจบงาน (Won/Lost):
1. สถานะของการ์ดในฐานข้อมูลจะถูกอัปเดต (`status: WON` หรือ `LOST`)
2. การ์ดจะถูกย้ายออกจาก Kanban Board ปัจจุบันทันที (เพื่อให้บอร์ดสะอาดและพร้อมสำหรับงานใหม่เสมอ)
3. การ์ดใบนั้นจะไปปรากฏอยู่ในแท็บ/หน้าสรุปผล **Completed Projects** 
4. (Optional) เพิ่ม Gamification เช่น การแสดงอนิเมชั่นพลุเมื่อจบงานแบบ WON

## ข้อควรระวังสำหรับ Developer (Implementation Notes)
- **UI (Create/Edit Card):** จะต้องเพิ่ม Dropdown ให้ผู้ใช้สามารถระบุหรือเปลี่ยน `OpportunityType` ได้ และต้องแสดง Visual Indicators บนตัว `KanbanCard`
- **Client-Side:** ให้ดึงค่า `type` ของการ์ดมาประเมินเงื่อนไขตอนลากการ์ดลงโซน เพื่อแสดง Modal ที่ถูกต้อง (เช็ค Field `value`, `currency`, `goodsLoadingDate`, `invoiceNumber`)
- **Server-Side (`opportunity.ts`):** ดักจับที่ Backend ด้วยว่าหากเป็น `type === 'SALES_DEAL'` และกดปิดงานเป็น WON จะต้องมีค่าเหล่านี้ส่งมาเสมอ (Value, Currency, Loading Date, Invoice)
