# Problem Cases: Performance & Latency Knowledge Base

คลังบันทึกกรณีศึกษาปัญหาประสิทธิภาพ (Performance Bottlenecks), คอขวดความเร็ว, และแนวทางแก้ไขที่ผ่านการพิสูจน์แล้ว (Verified Fixes) สำหรับระบบ CRM

โฟลเดอร์นี้จัดทำขึ้นเพื่อให้ **AI Agents ทุกตัว** สามารถเข้ามาศึกษา, อ้างอิง, และรวบรวมปัญหาที่พบในโค้ดเบสจริง เพื่อหลีกเลี่ยงข้อผิดพลาดซ้ำเดิม และเลือกใช้สถาปัตยกรรมที่ถูกต้องตั้งแต่แรก

---

## 📌 สารบัญกรณีศึกษา (Case Studies Index)

| รหัสกรณีศึกษา | หัวข้อ / ส่วนประกอบที่พบปัญหา | สาเหตุคอขวดที่แท้จริง (Root Cause) | เทคนิคการแก้ปัญหาที่นำมาใช้ | สถานะ |
|---|---|---|---|:---:|
| [CASE-001](case-001-contact-edit-panel-waterfall.md) | **Contact / EditAccountPanel & PersonTable**<br>คลิกปุ่ม Edit Account หรือคลิกเลือกบุคคลในตารางแล้วเปิด Panel ช้ามาก | • มี `await loadEditAccountPanel()` บล็อกการเปิด Modal<br>• มี Data Waterfall: Panel ยิง Server Action ซ้ำซ้อนทั้งที่แม่มีข้อมูลอยู่แล้ว<br>• ขาด Hover Intent บนแถวตาราง<br>• ก้อน JS Chunk บวมจากการ Static Import แท็บ AI (57KB) | • นำเทคนิค **Hover-to-Preload** จาก `KanbanCard` มาใช้<br>• **Direct Object Passing** ส่ง `accountOverview` เข้า Panel ทันที (0ms)<br>• **Dynamic Code Splitting** แยกโหลดแท็บที่ยังไม่ได้ใช้ | ✅ บันทึกแล้ว |
| [CASE-002](case-002-ssr-db-write-and-prefetch-flooding.md) | **System Permissions & Sidebar Link Prefetching**<br>เปิดหน้า `/system/permissions` โคตรช้า และเปิดหน้าแรกแล้วเครื่องอืด | • `syncMenuRegistry` เขียน DB 30-50 ครั้งทุกครั้งที่เรนเดอร์หน้าเว็บ<br>• Sidebar ตั้ง `prefetch={true}` ยิง Query หน้าหนักๆ 7 หน้าพร้อมกันจน Neon Pool ตัน<br>• มี `window.location.reload()` ขวาง Client-side navigation | • ถอดคำสั่งเขียน DB ออกจากวงจรเรนเดอร์หน้าเว็บ และทำปุ่มกด Sync แยก<br>• ปรับ Sidebar เป็น `prefetch={false}`<br>• ถอด hard reload ออกทั้งหมด | ✅ บันทึกแล้ว |
| [CASE-003](case-003-company-card-click-and-tear-down.md) | **Contact / CompanyCard Click Latency**<br>คลิกการ์ดบริษัทเพื่อดูข้อมูลฝั่งขวาแล้วรู้สึกช้า หน้าจอกะพริบวูบ | • UI Tear-down: บังคับล้างข้อมูล `contacts=[]` ทิ้งทันทีที่คลิก<br>• 4 Sequential DB Waterfall: รัน Company ➔ GroupBys ➔ Users ➔ AI Config แยกทีละรอบ<br>• SWR Fetcher ไม่ซิงก์กันระหว่าง `preload` กับ `useSWR` | • **Non-destructive Smooth Transition** คงตารางเดิมไว้ ไม่กะพริบวูบ<br>• **Canonical Shared SWR Fetcher** ให้ Cache Deduplication ทำงาน 100%<br>• **Phase 1 DB Query Parallelization** รันพร้อมกัน ลด DB Wall Time ลง 32.7% | ✅ บันทึกแล้ว |

---

## 🛠️ แนวทางสำหรับ Agent ในการเพิ่ม Problem Case ใหม่

เมื่อพบหรือแก้ปัญหา Performance ใหม่ในระบบ ให้สร้างไฟล์ตามรูปแบบ:
`case-<NUMBER>-<SHORT-NAME>.md` โดยคัดลอกโครงสร้างจาก [TEMPLATE.md](TEMPLATE.md)

### ข้อพึงระวังสำหรับ Agent:
1. **ห้ามคาดเดาโดยไม่มีหลักฐาน (No Unverified Speculation)**: ต้องระบุพฤติกรรมจริง ตัวเลข หรือลำดับ Call Stack ที่เป็นสาเหตุ
2. **แยกแยะระหว่าง Frontend, Network และ Database**:
   - ช้าเพราะ JS Chunk ขนาดใหญ่?
   - ช้าเพราะ Network Round-trip (Waterfall)?
   - ช้าเพราะ Database Scan / Connection Pool?
   - ช้าเพราะ React Re-render Loop?
3. **ต้องระบุ Before vs After ชัดเจน**: แสดงให้เห็นว่าโค้ดเดิมเขียนอย่างไร และแนวทางที่ถูกต้องแก้ด้วยวิธีใด
