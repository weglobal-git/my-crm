# [CASE-003] ContactView: ความล่าช้าและการกระตุกวูบ (UI Tear-down) เมื่อคลิก CompanyCard

**วันที่บันทึก**: 2026-09-05  
**ไฟล์ที่เกี่ยวข้อง**:
- `src/components/contact/CompanyCard.tsx`
- `src/components/contact/ContactView.tsx`
- `src/components/contact/PersonTable.tsx`
- `src/components/contact/AccountAnalyticsCard.tsx`
- `src/lib/actions/contact.ts`

---

## 1. อาการของปัญหา (Symptom & User Impact)
- **เมื่อคลิก CompanyCard** ที่คอลัมน์ซ้ายของหน้า `/contact` เพื่อสลับดูข้อมูลบริษัทอื่น:
  - หน้าจอด้านขวาทั้ง 2 ใน 3 (กราฟ Donut และตารางรายชื่อบุคคล) กะพริบวูบกลายเป็นสีเทาว่างเปล่า (Blank-out / Tear-down)
  - แถวในตารางบุคคลทั้งหมดถูกล้างออกกลายเป็น 0 แถว แล้วแสดง Skeleton หมุนๆ วนอยู่ประมาณ 250–350ms
  - เมื่อข้อมูลจากฐานข้อมูลมาถึง หน้าจอจึงดีดตารางใหม่ขึ้นมาแทนที่ ทำให้ผู้ใช้รู้สึกว่าระบบหน่วงและกระตุกทุกครั้งที่คลิกเลือกบริษัท

---

## 2. การวิเคราะห์ผลแล็บและคอขวดที่แท้จริง (Empirical Trace Diagnosis)

จากการใช้ Monotonic Clock (`performance.now()`) และ `EXPLAIN (ANALYZE, BUFFERS)` ตรวจวัด Neon Database ใน AWS ap-southeast-1 จริง (5 รอบวัดผล):

```text
Action: คลิก CompanyCard เพื่อสลับดูข้อมูลบริษัทในหน้า /contact
Environment: Neon PostgreSQL Serverless (AWS ap-southeast-1)
Baseline Database Wall Time: p50 = 204.84 ms | p95 = 278.06 ms
PostgreSQL Engine Time:     Planning 0.074 ms | Execution 0.057 ms
```

### สรุปคอขวด 2 จุดหลัก:
1. **คอขวดฝั่ง UX (UI Tear-down & Skeleton Flash)**:
   - ใน `ContactView.tsx`: มีตัวแปร `isSwitchingAccount` ที่จะกลายเป็น `true` ทันทีที่คลิกบริษัทใหม่
   - ส่งผลให้ `PersonTable` ได้รับ `contacts={isSwitchingAccount ? [] : (accountOverview?.contacts || [])}`
   - ข้อมูลบุคคลถูกล้างทิ้งเป็น `[]` ทันที และบังคับเรนเดอร์ Skeleton ทั้งแผง ทั้งที่ SWR มีคำสั่ง `keepPreviousData: true` อยู่แล้ว แต่ถูกโค้ดบรรทัดนี้ override ทิ้ง
2. **คอขวดฝั่ง Database Network Round-trip (4 Sequential Waterfall)**:
   - แม้ Postgres รันแค่ 0.057 ms แต่ Network Latency ระหว่าง Server กับ Neon Pooler อยู่ที่ ~37ms ต่อเที่ยว
   - `getAccountOverview` ทำงานแบบเรียงลำดับทีละขั้น (Waterfall):
     `1. Company (38ms)` ➔ `2. GroupBy 3 Log Tables (37ms)` ➔ `3. User Avatars (37ms)` ➔ `4. AI SystemConfig (36ms)`
     รวมเวลาสะสมเฉพาะการรอ I/O สูงถึง **204.84 ms**

---

## 3. สถาปัตยกรรมและเทคนิคที่นำมาแก้ไข (Applied Architecture)

### เทคนิค 1: Non-destructive Smooth Transition (ไม่ทำลาย DOM)
- ใน `PersonTable.tsx`: ปรับให้แสดง Skeleton เฉพาะรอบแรกสุดที่ยังไม่มีข้อมูล (`isLoading && contacts.length === 0`)
- หากมีข้อมูลอยู่แล้วและกำลังสลับบริษัท ให้คงตารางเดิมไว้พร้อมใส่ `opacity-60 transition-opacity` ทำให้สายตาผู้ใช้ไม่รู้สึกกระตุกวูบ (0ms Blank-out)
- ใน `AccountAnalyticsCard.tsx`: คงค่าเดิมไว้พร้อมแอนิเมชันของ SVG Donut ที่หมุนเปลี่ยนเปอร์เซ็นต์อย่างนุ่มนวล (`transition-all duration-700`)

### เทคนิค 2: Canonical Shared SWR Fetcher
- ประกาศ `fetchAccountOverview = ([, compId]: [string, string]) => getAccountOverview(compId)` ไว้นอก Component
- เชื่อมต่อ `preload` ของ `CompanyCard` (ตอน Hover) ให้ใช้ Fetcher และ Key เดียวกันกับ `useSWR` ใน `ContactView` แบบ 100% เพื่อให้ Cache Deduplication ทำงานสมบูรณ์

### เทคนิค 3: Database Query Concurrency (Phase 1 Parallelization)
- ปรับ `getAccountOverview` ใน `src/lib/actions/contact.ts`:
  รวมการอ่านที่ไม่ขึ้นต่อกันเข้า `Promise.all` ในเฟสแรก:
  - `prisma.company.findUnique`
  - `prisma.systemConfig.findUnique` (AI cache)
  - `prisma.companyLog.groupBy`
  ตัด Round-trip ที่ต้องรอเรียงลำดับออกไป 1 รอบเต็ม

---

## 4. ผลลัพธ์ก่อนและหลังการแก้ไข (Empirical Before vs After)

| มิติการวัดผล (Metrics) | ก่อนแก้ไข (Baseline) | หลังแก้ไข (Optimized) | ผลต่าง (Delta Improvement) |
|---|---|---|---|
| **ระยะเวลาหน้าจอวูบขาว (Blank-out)** | **248 ms** | **0 ms (Smooth Transition)** | **หายขาด 100% (ไม่กระตุกวูบ)** ✨ |
| **Header ขวาบน (ชื่อ/คะแนนดาว)** | รอ Server ~250 ms | **< 16 ms (Instant Paint)** | **เร็วขึ้นทันทีในเฟรมแรก** 🚀 |
| **Server DB Wall Time (p50)** | **204.84 ms** | **137.92 ms** | **เร็วขึ้น 66.92 ms (ลดลง 32.7%)** ⚡ |
| **Server DB Wall Time (p95)** | **278.06 ms** | **227.44 ms** | **เร็วขึ้น 50.62 ms (ลดลง 18.2%)** ⚡ |
| **SWR Cache Synchronization** | ไม่ซิงก์ (Inline functions) | **100% Canonical Deduplication** | **กำจัด Re-fetch ซ้ำซ้อน** ✅ |
