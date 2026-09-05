# [CASE-XXX] ชื่อปัญหา / ชื่อฟีเจอร์ที่พบความล่าช้า

**วันที่บันทึก**: YYYY-MM-DD  
**ผู้บันทึก**: [Agent Name / Persona]  
**ไฟล์ที่เกี่ยวข้อง**:
- `path/to/ComponentA.tsx`
- `path/to/serverAction.ts`

---

## 1. อาการของปัญหา (Symptom & User Impact)
- **พฤติกรรมที่ผู้ใช้เจอ**: (เช่น คลิกปุ่มแล้วหน้าจอนิ่งไป 1-2 วินาที, หน้าเว็บกระพริบขาว, โหลดหน้าเว็บครั้งแรกช้ามาก)
- **จุดที่เกิดปัญหา (URL / Component)**: `http://localhost:3003/...`

---

## 2. การวิเคราะห์หาสาเหตุที่แท้จริง (Root Cause Analysis)

### ลำดับการทำงานเดิมที่ผิดพลาด (Sequence / Waterfall)
```text
[User Action] 
  → [Client Event]: ...
  → [Network Request 1]: ...
  → [Network Request 2]: ... (Waterfall)
  → [Database]: ...
```

### รายละเอียดคอขวด (Bottlenecks Breakdown):
1. **Frontend / Bundle**: (เช่น ก้อนไฟล์ใหญ่เกินไป, ขาดการ Preload, โดนบล็อกด้วย await)
2. **Network / Round trips**: (เช่น ยิง API ซ้ำซ้อน, Data Waterfall)
3. **Database / Server**: (เช่น N+1 Query, เขียน DB ในวงจรเรนเดอร์, Query หนักเกินความจำเป็น)

---

## 3. สถาปัตยกรรมและเทคนิคที่ใช้แก้ไข (Solution Architecture)

### หลักการที่นำมาแก้:
- [ ] Hover-to-Preload Intent
- [ ] Direct Object Passing / SWR Memory Cache
- [ ] Lean Prisma Select Columns
- [ ] Dynamic Code Splitting (`next/dynamic`)
- [ ] Optimistic UI Updates

### Before vs After Code Diff:

#### โค้ดเดิม (Before - Slow):
```tsx
// โค้ดที่มีปัญหา
```

#### โค้ดใหม่ (After - Fast):
```tsx
// โค้ดที่ได้รับการปรับปรุง
```

---

## 4. ผลการวัดประสิทธิภาพ (Benchmark Results)

| ตัวชี้วัด | ก่อนแก้ (Before) | หลังแก้ (After) | ผลลัพธ์ / การปรับปรุง |
|---|---|---|---|
| **Latency / TTFB** | ... ms | ... ms | ลดลง ...% |
| **Network Requests** | ... requests | ... requests | ตัด Request ซ้ำซ้อนออก ... |
| **Bundle Chunk Size** | ... KB | ... KB | ลดขนาดลง ...% |
| **User Experience (UX)** | ต้องรอตัวหมุน | แสดงผลทันที 0ms | ไม่กระพริบ |

---

## 5. ข้อแนะนำสำหรับ Agent อื่นๆ เพื่อป้องกันปัญหาซ้ำ (Key Takeaways)
- สิ่งที่ **"ต้องทำ" (Do)**: ...
- สิ่งที่ **"ห้ามทำ" (Don't)**: ...
