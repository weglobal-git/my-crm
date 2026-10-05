# คู่มือเรียกใช้ Skills สำหรับตรวจและปรับความเร็ว CRM

คู่มือนี้ครอบคลุม skills ที่เกี่ยวข้องกับ performance โดยตรง รวมถึง architecture guardrails ที่ต้องใช้ร่วมกันเมื่อแก้โค้ด CRM

## วิธีเรียก Skill

เรียกได้ 2 แบบ:

1. **บอกเป้าหมายตามธรรมชาติ** — Agent จะเลือก skill จากลักษณะงาน เช่น “ช่วยตรวจว่าหน้า Pipeline โหลดช้าตรงไหน”
2. **ระบุชื่อโดยตรง** — ใช้ `$ชื่อ-skill` เมื่ออยากควบคุม workflow เช่น `$performance ตรวจหน้า /pipeline`

การระบุชื่อ skill ไม่ได้หมายความว่าต้องสั่งหลายตัวพร้อมกันเสมอ ให้เริ่มจากตัวหลักหนึ่งตัว แล้วเพิ่ม specialist เมื่อโจทย์หรือหลักฐานต้องใช้

## เลือก Skill อย่างรวดเร็ว

| สถานการณ์ | Skill หลัก | Skill ที่ใช้ร่วมเมื่อจำเป็น |
|---|---|---|
| หน้าโหลดช้า ยังไม่รู้สาเหตุ | `$performance` | `$vercel-react-best-practices`, domain skill |
| LCP, INP หรือ CLS มีปัญหา | `$performance` + `$core-web-vitals` | `$vercel-react-best-practices` |
| action/API/query ช้า หรืออาการเกิดไม่สม่ำเสมอ | `$trace-performance-bottleneck` | `$crm-feature-architecture` |
| ต้องการตรวจ React/Next.js implementation | `$vercel-react-best-practices` | `$crm-feature-architecture` |
| ค่าใช้จ่ายหรือ production metrics บน Vercel | `$vercel-optimize` | `$vercel-react-best-practices` |
| ตรวจทั้ง Performance, Accessibility, SEO และ Best Practices | `$web-quality-audit` | specialist ของหมวดที่พบปัญหา |
| เปลี่ยน data loading, cache, mutation หรือ component ownership ของ CRM | `$crm-feature-architecture` | performance/domain skill ที่ตรงงาน |
| งานเกี่ยวกับ Pipeline หรือ EditDealPanel | `$pipeline-deal-panel-architecture` | `$crm-feature-architecture` และ performance skill ที่ตรงงาน |
| UI ไม่อัปเดต ต้อง refresh หรือไม่ realtime | `$crm-realtime-optimistic-ui` | `$pusher-management`, `$crm-feature-architecture` |

## Decision flow

```text
เริ่มจากคำถาม: ต้องการแก้เฉพาะความเร็วหรือ audit ทั้งเว็บไซต์?
|
+-- Audit หลายหมวด ----------------------> web-quality-audit
|
+-- ความเร็วทั่วไป -----------------------> performance
|   |
|   +-- ระบุ LCP / INP / CLS ------------> core-web-vitals
|   +-- ต้องแก้ React / Next.js ----------> vercel-react-best-practices
|   +-- หา bottleneck ไม่เจอ/อาการแกว่ง ---> trace-performance-bottleneck
|   +-- ต้องใช้ Vercel production metrics -> vercel-optimize
|
+-- ทุกครั้งที่เปลี่ยน CRM architecture ---> crm-feature-architecture
    |
    +-- ถ้าเป็น Pipeline ------------------> pipeline-deal-panel-architecture
```

## หลักการสั่งงานให้ได้ผลดี

Prompt ที่ดีควรระบุ:

- หน้า, route, component หรือ action ที่มีปัญหา
- อาการที่เห็น เช่น initial load ช้า, click แล้วค้าง, layout กระโดด หรือ API ช้า
- environment เช่น local production build, staging หรือ production
- วิธีทำให้อาการเกิดซ้ำ
- metric ที่มีอยู่ เช่น LCP, INP, request duration, payload หรือ query time
- ขอบเขตการเปลี่ยน เช่น “วิเคราะห์อย่างเดียว” หรือ “แก้และวัดผลให้เสร็จ”
- พฤติกรรมที่ห้ามเสีย เช่น permissions, masking, drag-and-drop หรือ draft state

หลีกเลี่ยงคำสั่งกว้างอย่าง “ทำให้เร็วที่สุด” โดยไม่บอกหน้าหรือ journey เพราะ Agent จะต้องใช้เวลาค้นหาขอบเขตมากขึ้น

## Skill precedence สำหรับ CRM

เมื่อคำแนะนำขัดกัน ให้ใช้ลำดับนี้:

1. Business rules, permissions และ domain-specific skills
2. `$crm-feature-architecture`
3. `$pipeline-deal-panel-architecture` หรือ domain architecture ที่เกี่ยวข้อง
4. Performance measurement skills
5. Generic React/Next.js best practices

ตัวอย่าง: ห้ามย้ายข้อมูลจาก SSR ไป CSR เพียงเพื่อลด HTML หากยังไม่ได้เปรียบเทียบ total transfer, first usable content, authorization และผลต่อ interaction ถัดไป

## Prompt สำเร็จรูป

Prompt สำหรับแต่ละ skill อยู่ใน [prompt-library.md](prompt-library.md)
