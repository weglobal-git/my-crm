# สถาปัตยกรรมระบบ AI ปัจจุบันของ CRM (Current Real AI Architecture)

## 1. บทนำและแนวคิดหลัก (Core Philosophy)
ระบบ AI ใน CRM ถูกปรับปรุงให้เป็น **"One-Click On-Demand Deal Summary"** ที่เน้นความเรียบง่าย รวดเร็ว และตอบโจทย์ทีมขายจริง:
- **ไร้ Background Worker / ไร้ Outbox Queue:** ไม่มีการบันทึกซ้ำซ้อนหรือดักจับ Event ทุกครั้งที่ผู้ใช้พิมพ์โน้ต
- **ประหยัด Token และงบประมาณ:** AI จะทำงานเฉพาะเมื่อผู้ใช้คลิกปุ่ม `✨ Summarize Deal` ในการ์ดดีลเท่านั้น
- **Admin ควบคุม Prompt ได้แบบเรียลไทม์:** ผู้ดูแลระบบ (ADMIN) สามารถปรับแต่งทั้ง System Prompt (กฎ/บทบาท), Task Prompt (หัวข้อการวิเคราะห์), และ Custom Instruction ได้โดยตรงจากหน้าจอ `EditDealPanel` โดยไม่ต้องแก้ไขโค้ดหลังบ้าน

---

## 2. องค์ประกอบของระบบ (System Components)

### 2.1 Backend Actions & AI Engine
1. **[src/lib/actions/deal-summary.ts](file:///Users/light/my-crm/src/lib/actions/deal-summary.ts):**
   - `generateDealSummary(dealId)`: ดึงข้อมูลดีล + 30 กิจกรรมล่าสุด ส่งไปให้ Gemini วิเคราะห์ตาม JSON Schema
   - `getLatestDealSummary(dealId)`: ดึงผลวิเคราะห์ล่าสุดมาแสดงทันทีที่เปิดการ์ดดีล
   - `getDealSummaryPromptConfig()`: ดึงการตั้งค่า Prompt ปัจจุบัน
   - `saveDealSummaryPromptConfig(data)`: บันทึก System Prompt, Task Prompt, และ Custom Prompt
   - `resetDealSummaryPromptConfig()`: คืนค่า Prompt เป็นค่าเริ่มต้นมาตรฐานระบบ
2. **[src/lib/ai/gateway.ts](file:///Users/light/my-crm/src/lib/ai/gateway.ts) & [src/lib/ai/adapters/gemini.ts](file:///Users/light/my-crm/src/lib/ai/adapters/gemini.ts):**
   - เชื่อมต่อไปยัง Google Gemini ผ่าน API Key ที่เก็บใน `.env` (`GEMINI_API_KEY`)
   - เรียกใช้โมเดลหลัก `gemini-2.5-flash` และ Fallback อัตโนมัติไปยัง `gemini-1.5-flash`
   - บังคับ Structured JSON Output ตาม Schema 4 มิติ:
     - `overview` (ภาพรวมสถานะ 2-4 บรรทัด)
     - `keyHighlights` (ข้อตกลง ตัวเลข หรือประเด็นสำคัญล่าสุด)
     - `blockers` (ปัญหา อุปสรรค หรือสิ่งที่กำลังรอคอย)
     - `nextSteps` (สิ่งที่เซลล์หรือทีมควรดำเนินการต่อไป)

### 2.2 Frontend UI
1. **[src/components/pipeline/EditDealPanel.tsx](file:///Users/light/my-crm/src/components/pipeline/EditDealPanel.tsx):**
   - **แท็บ AI Summary:** แสดงผลลัพธ์การวิเคราะห์แบบ 4 มิติ พร้อมปุ่ม `✨ Summarize Deal`, `Copy`, `Update Summary`
   - **แท็บย่อย Prompt Settings (Admin Only):** อยู่ภายในหน้าต่าง `EditDealPanel` โดยตรง สไตล์เข้ากับแอป ไม่ใช้ Popup Modal ลอยบังหน้าจอ
2. **[src/components/system/SystemGeneralClient.tsx](file:///Users/light/my-crm/src/components/system/SystemGeneralClient.tsx):**
   - รวมศูนย์การมอนิเตอร์ไว้ที่แท็บ `Dashboard` เดียว พร้อมระบบ **Lazy Load** และ Server In-Memory Cache เพื่อความรวดเร็วสูงสุด

---

## 3. โครงสร้าง Prompt 3 ระดับที่ Admin ปรับแต่งได้

| ระดับ | ชื่อส่วน | หน้าที่ | ค่าเริ่มต้น (Default) |
| :--- | :--- | :--- | :--- |
| **1** | **System Instruction (Rules & Persona)** | กำหนดบทบาท AI กฎเกณฑ์ และข้อห้าม (เช่น ห้ามแต่งเติมข้อมูล, ตอบภาษาไทย) | ผู้ช่วยวิเคราะห์และสรุปสถานะการขาย ตรงไปตรงมา อิงตามข้อเท็จจริง |
| **2** | **Task Instruction (Analysis Topics)** | สั่งงาน AI ว่าต้องการให้วิเคราะห์ข้อมูลและสรุปหัวข้ออะไรบ้าง | สรุป 4 มิติ: ภาพรวม (Overview), ประเด็นสำคัญ (Highlights), อุปสรรค (Blockers), ขั้นตอนถัดไป (Next Steps) |
| **3** | **Additional Custom Instructions** | คำสั่งพิเศษเพิ่มเติมจาก Admin ตามความต้องการเฉพาะกิจ | เช่น ให้เน้นยอดค้างชำระ หรือสรุปสั้นกระชับเป็นพิเศษ |

---

## 4. สถานะฐานข้อมูล (Database Baseline)
- โค้ดในเครื่องใช้ฐานข้อมูลโมเดลพื้นฐานของ CRM ที่เสถียร
- การตั้งค่า Prompt ถูกจัดเก็บบันทึกประวัติผ่าน `prisma.aIConfigAuditLog` อย่างปลอดภัย
- พร้อมสลับกลับไปใช้ Neon Branch `main` ได้อย่างสมบูรณ์แบบ
