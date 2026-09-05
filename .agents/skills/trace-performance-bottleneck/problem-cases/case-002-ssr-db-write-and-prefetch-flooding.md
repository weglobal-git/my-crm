# [CASE-002] System Permissions: การเขียน Database ในวงจร SSR Render และการ Prefetch ถล่ม Serverless DB

**วันที่บันทึก**: 2026-09-05  
**ไฟล์ที่เกี่ยวข้อง**:
- `src/app/system/permissions/page.tsx`
- `src/lib/actions/permission.ts`
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/Header.tsx`

---

## 1. อาการของปัญหา (Symptom & User Impact)
- **เปิดหน้า `/system/permissions` ช้ามาก**: หน่วงนาน 2-5 วินาทีกว่าจะเริ่มแสดงผล
- **เมื่อเปิดหน้าแรกของเว็บ เครื่องหน่วงผิดปกติ**: มี Request ยิงไป Neon DB หลายสิบสายพร้อมกัน
- **ปัญหา Cross-user refresh บน Localhost**: เวลาคนหนึ่งรีเฟรชหน้าเว็บ อีกแท็บหนึ่งถูกบังคับรีเฟรชตาม

---

## 2. การวิเคราะห์หาสาเหตุที่แท้จริง (Root Cause Analysis)

### คอขวดที่ 1: การรันคำสั่งเขียน Database (Write Mutation) ใน Server Component Render
ใน `src/app/system/permissions/page.tsx` เดิมมีคำสั่ง:
```tsx
export default async function PermissionsPage() {
  await syncMenuRegistry(false); // ❌ สั่ง Upsert DB 30-50 ครั้งทุกครั้งที่เปิดหน้านี้!
  const matrix = await getPermissionMatrix();
  ...
}
```
- ทุกครั้งที่มีใครเปิดหน้านี้ ระบบจะรัน Loop ตรวจและ Upsert ตาราง `MenuItem` และ `DepartmentMenuPermission` ทีละแถวแบบ Sequential รวมกัน 30-50 round trips
- ทำให้เกิดภาระกับ Neon Serverless Database มหาศาล และทำให้หน้าเว็บเปิดช้าอย่างรุนแรง

### คอขวดที่ 2: Next.js `<Sidebar>` ตั้ง `prefetch={true}` บนทุกลิงก์
ใน `Sidebar.tsx`:
```tsx
<Link href={menu.href} prefetch={true}>
```
- ทันทีที่ผู้ใช้เปิดเว็บเข้ามาที่หน้าแรก ตัวเบราว์เซอร์จะแอบยิง Request ล่วงหน้าไปโหลด Dynamic Server Components ทั้ง 7 หน้าพร้อมกัน (`/contact`, `/pipeline`, `/product`, `/system/general`, `/system/permissions`, `/system/structure`)
- แต่ละหน้าไปรัน Prisma Query หนักๆ พร้อมกัน จน Connection Pool ของ Neon DB ชนเพดาน

### คอขวดที่ 3: `window.location.reload()` และ Fast Refresh HMR
- มีการใช้ `window.location.reload()` หรือ `window.location.href = ...` บังคับรีเฟรชหน้าต่างทั้งบาน
- บน Dev Server (`next dev`) เวลาเกิด Unrecoverable Server Compilation ตัว Webpack HMR จะส่งสัญญาณ Broadcast `{ action: "reloadPage" }` ไปยังทุกแท็บที่ต่อ WebSocket อยู่ ทำให้ User อื่นถูกรีเฟรชตาม

---

## 3. สถาปัตยกรรมและเทคนิคที่ใช้แก้ไข (Solution Architecture)

1. **ถอด Sync Mutation ออกจาก Render Cycle**:
   - หน้า `/system/permissions` ให้ทำเฉพาะ Read-only Query เท่านั้น
   - ย้าย `syncMenuRegistry` ไปไว้ในปุ่มเฉพาะ "Sync Registry" บน Header Toolbar ให้ Admin กดเมื่อต้องการอัปเดตเมนูใหม่
2. **ปิด Speculative Prefetch บน Sidebar**:
   - เปลี่ยนลิงก์ทั้งหมดเป็น `prefetch={false}` โหลดเมื่อผู้ใช้คลิกเข้าไปจริงๆ เท่านั้น
3. **กำจัด Hard Page Reload**:
   - เปลี่ยนจากการใช้ `window.location.reload()` มาใช้ Optimistic State Update ร่วมกับ `router.refresh()` ของ Next.js

---

## 4. ผลการวัดประสิทธิภาพ (Benchmark Results)

| ตัวชี้วัด | ก่อนแก้ (Before) | หลังแก้ (After) | ผลลัพธ์ |
|---|---|---|---|
| **Database Operations ต่อการเปิดหน้า** | 30 - 50 DB Writes | 0 Writes (Read 1 ครั้ง) | **ลด DB Write 100%** |
| **Initial Mount Request Flood** | 7+ Pages Concurrent Prefetch | 0 Speculative Page Prefetch | ป้องกัน Connection Pool ล่ม |
| **Permissions Page Load Time** | 2,500ms - 4,000ms | < 300ms | **เร็วขึ้นเกือบ 10 เท่า** |

---

## 5. ข้อแนะนำสำหรับ Agent เพื่อป้องกันปัญหาซ้ำ
1. **ห้ามรันคำสั่ง DB Mutation (Create/Update/Delete/Upsert) ใน Server Component (Page.tsx)**: Server Component ต้องเป็น Read-Only เสมอ หากต้องการ Sync หรือ Migration ให้ทำผ่าน Script, API Cron หรือปุ่ม Action แยกต่างหาก
2. **ระวัง `prefetch={true}` บน Navigation Bar**: ลิงก์ที่นำไปสู่หน้า Dynamic หรือหน้าที่มี Query หนักๆ ควรตั้ง `prefetch={false}` เสมอ เพื่อไม่ให้แย่ง Bandwidth และ Connection Pool ของหน้าปัจจุบัน
