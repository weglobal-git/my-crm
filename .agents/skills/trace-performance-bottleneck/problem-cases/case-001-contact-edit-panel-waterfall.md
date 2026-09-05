# [CASE-001] ContactView: ความล่าช้าในการเปิด Edit Account และ Person Edit Panel

**วันที่บันทึก**: 2026-09-05  
**ไฟล์ที่เกี่ยวข้อง**:
- `src/components/contact/ContactView.tsx`
- `src/components/contact/EditAccountPanel.tsx`
- `src/components/contact/PersonTable.tsx`
- `src/lib/actions/contact.ts`

---

## 1. อาการของปัญหา (Symptom & User Impact)
- **เมื่อคลิกปุ่ม "Edit Account"** ที่มุมขวาบนของ Overview: หน้าจอนิ่งไปชั่วขณะ (200-400ms) จากนั้นหน้าต่าง SlideOverPanel สไลด์ออกมาแต่แสดงวงล้อหมุน `<Loader2 />` ค้างอีก 300-800ms ก่อนที่แบบฟอร์มจะปรากฏ
- **เมื่อคลิกเลือกแถวบุคคลใน PersonTable**: พบความล่าช้าแบบเดียวกัน หน่วงและค้างนานกว่าแบบฟอร์มบุคคลจะกางออก

---

## 2. การวิเคราะห์หาสาเหตุที่แท้จริง (Root Cause Analysis)

### ลำดับการทำงานเดิมที่ผิดพลาด (Compounding Latencies Waterfall)
```text
[User Clicks Row / Button]
  → [ContactView]: await loadEditAccountPanel()  [บล็อก UI รอโหลด JS Chunk ~150KB+]
  → [EditAccountPanel Mounts]: setIsLoading(true) [หน้าจอหมุน Loader2]
  → [Server Action]: getAccountOverview(companyId, { includeLogs: true }) [ยิงไป Neon DB]
      ├── prisma.company.findUnique
      ├── prisma.activityLog.groupBy
      ├── prisma.companyLog.groupBy
      ├── prisma.contactLog.groupBy
      ├── prisma.user.findMany
      └── prisma.systemConfig.findUnique
  → [Response กลับมา]: setIsLoading(false) [แบบฟอร์มจึงปรากฏ]
รวมเวลารอคอยของผู้ใช้: 500ms - 1,200ms!
```

### รายละเอียดคอขวด 4 ชั้น:
1. **Blocking Await on Click Event**:
   ใน `ContactView.tsx` ฟังก์ชัน `handleOpenEditModal` ดันใช้ `await loadEditAccountPanel()` ก่อนคำสั่ง `setIsEditAccountModalOpen(true)` ทำให้ผู้ใช้คลิกแล้วเบราว์เซอร์ไม่ตอบสนองทันที
2. **Data Waterfall ซ้ำซ้อน (Unnecessary Network Roundtrip)**:
   ใน `ContactView.tsx` มีข้อมูล `accountOverview` (company, contacts, addresses) อยู่ใน SWR Cache ในหน่วยความจำอยู่แล้ว แต่ส่งเข้าไปใน `EditAccountPanel` เพียงแค่ `companyId: string` ทำให้ Panel สั่ง `setIsLoading(true)` แล้วยิง DB ขอข้อมูลเดิมซ้ำอีกรอบ
3. **ขาด Intent Preloading ใน PersonTable**:
   ใน `PersonTable.tsx` ไม่มี `onMouseEnter` ทำให้ช่วงเวลา 100-300ms ที่ผู้ใช้เลื่อนเมาส์เตรียมจะคลิก เบราว์เซอร์ไม่ได้เตรียมดาวน์โหลด Chunk มารอ
4. **JS Chunk บวมจากการ Static Import**:
   `EditAccountPanel.tsx` นำเข้า `AccountAITab.tsx` (57 KB) และ `SharedMediaTab.tsx` แบบ Static รวมอยู่ในก้อนเดียว ทั้งที่ผู้ใช้เปิดเข้ามาเพื่อแก้ชื่อหรือที่อยู่ทั่วไป

---

## 3. สถาปัตยกรรมและเทคนิคที่นำมาแก้ไข (นำมาจาก Pipeline EditDealPanel)

เราถอดบทเรียนจาก `KanbanCard.tsx` และ `EditDealPanel.tsx` ฝั่ง Pipeline ที่เปิด Panel ได้แบบ 0ms:

### เทคนิค 1: Hover-to-Preload (ตรวจจับเจตนา)
ใน `PersonTable.tsx` เพิ่ม `onMouseEnter` บนแถว เพื่อสั่ง `void loadEditAccountPanel()` ล่วงหน้าทันทีที่เมาส์แตะโดนแถว ก่อนที่จะคลิกจริง

### เทคนิค 2: Direct Object Passing (กำจัด Data Waterfall)
ใน `ContactView.tsx` ส่ง `initialOverview={accountOverview}` เข้าสู่ `EditAccountPanel` โดยตรง
ใน `EditAccountPanel.tsx`:
- รับ `initialOverview` และนำข้อมูลมากำหนดค่าเริ่มต้นของ State แบบฟอร์มทันที
- ตั้งค่า `isLoading: false` ตั้งแต่แรก (ไม่ต้องมีตัวหมุน Loader2 ขวางหน้าจออีกต่อไป)

### เทคนิค 3: Non-blocking State Trigger
ใน `handleOpenEditModal` ถอด `await` ออก เพื่อให้ State สั่งเปิด Panel ทำงานทันที (<16ms)

### เทคนิค 4: Dynamic Code Splitting
ใช้ `next/dynamic` สำหรับ `AccountAITab` และ `SharedMediaTab` เพื่อลดขนาด initial chunk ลงกว่า 60%

---

## 4. โค้ดตัวอย่างเปรียบเทียบ (Before vs After)

### ใน `ContactView.tsx`:
```tsx
// ❌ BEFORE: ช้าและบล็อก
const handleOpenEditModal = async (tab = "account", contactId: string | null = null) => {
  await loadEditAccountPanel(); // บล็อก UI
  setEditAccountInitialTab(tab);
  setEditAccountContactId(contactId);
  setIsEditAccountModalOpen(true);
};

// ✅ AFTER: Instant Open & Direct Object
const handleOpenEditModal = (tab = "account", contactId: string | null = null) => {
  void loadEditAccountPanel(); // Non-blocking
  setEditAccountInitialTab(tab);
  setEditAccountContactId(contactId);
  setIsEditAccountModalOpen(true); // เปิดทันที
};

// ส่ง initialOverview ที่มีอยู่แล้วเข้า Panel
<EditAccountPanel
  companyId={selectedCompanyId}
  initialOverview={accountOverview}
  isOpen={isEditAccountModalOpen}
  ...
/>
```

---

## 5. ข้อแนะนำสำหรับ Agent เพื่อป้องกันปัญหาซ้ำ
1. **ห้ามยิง Server Action ซ้ำซ้อนใน Child Component** ถ้า Parent Component มีข้อมูลนั้นอยู่แล้ว ให้ส่งผ่าน props หรือใช้ SWR key เดียวกันเพื่อดึงจาก Cache ทันที
2. **ห้าม `await` dynamic import ใน onClick handler** ให้ trigger แบบ non-blocking และปล่อยให้ React จัดการ Transition
3. **ใช้ Hover-to-Preload เสมอ** กับการ์ด ปุ่ม หรือแถวตารางที่มีโอกาสถูกคลิกสูง
