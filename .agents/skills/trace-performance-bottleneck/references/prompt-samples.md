Prompt พร้อมใช้: วิเคราะห์การโหลดหน้า pipeline
ใช้ $trace-performance-bottleneck

โปรเจกต์: /Users/light/my-crm
Target: http://localhost:3003/pipeline?tab=workspace

Action ที่ต้องวิเคราะห์รอบนี้:
Cold navigation และ warm navigation เข้า Pipeline workspace

Completion signal:
หน้า Kanban แสดงการ์ดครบ, interaction พร้อมใช้งาน และ Pusher private channel เชื่อมต่อแล้ว

ให้ทำงานดังนี้:

1. ใช้ production build สำหรับ benchmark ห้ามใช้ตัวเลขจาก Next.js dev/HMR เป็นผลสรุป
2. วัด cold load และ warm load แยกกัน
3. warm-up ก่อน แล้ววัดอย่างน้อย 5 ครั้ง รายงาน p50 และ p95
4. วัด encoded Network Transfer และจำนวน request จริง
5. แจกแจงสิ่งที่โหลด:
   - HTML
   - RSC payload
   - JavaScript chunks
   - CSS
   - fonts/images/favicon
   - authentication/session
   - Server Actions
   - Pusher auth และ WebSocket
   - prefetch requests
6. วัด Browser:
   - click/navigation → first response
   - DOM content
   - hydration
   - React render/commit
   - LCP
   - INP หรือเวลาจน interaction พร้อมใช้งาน
7. Trace backend ของ initial Pipeline:
   - authentication และ permission
   - getPipelineOpportunities
   - Prisma ทุก query
   - connection/pool wait
   - Neon query execution
   - serialization
   - external API/Pusher
8. ใช้ traceId เดียวเชื่อม Browser → Server Action → Prisma/Neon → Pusher
9. ใส่ temporary instrumentation ได้ แต่ต้องใช้ prefix [PERF-TRACE]
10. ห้ามแก้ performance ก่อนมี baseline และ causal evidence
11. ระบุ trace coverage หากต่ำกว่า 90% ให้รายงาน INCOMPLETE TRACE
12. เมื่อพบ candidate bottleneck ให้ทำ controlled experiment เพื่อยืนยันว่าเป็นสาเหตุจริง
13. จากนั้นจึงแก้ code เฉพาะคอขวดนั้น
14. รัน benchmark แบบเดิมอีกครั้งและรายงาน before/after
15. ลบ instrumentation, proxy, trace ที่มีข้อมูลละเอียด และ test data เมื่อเสร็จ
16. ห้าม commit จนกว่าฉันจะตรวจผล

รายงานผลตาม mandatory report ของ Skill แบบ timing tree พร้อม:

- p50/p95
- bytes/request count
- bottleneck
- causal experiment
- before/after
- DB/client consistency
- remaining uncertainty

---

Prompt รอบต่อไป: เปิด EditDealPanel
ใช้ $trace-performance-bottleneck

วิเคราะห์ Action: เปิด EditDealPanel จากการคลิกการ์ดใน
http://localhost:3003/pipeline?tab=workspace

Start:
pointer click handler เริ่มทำงาน

Completion signals:

1. Panel shell มองเห็น
2. Activity list แสดงข้อมูล
3. textarea พร้อมพิมพ์
4. Pusher listener ของ deal พร้อมรับ event

แยกวัด:

- event handler
- React state update
- dynamic import/chunk download
- panel render/commit
- getOpportunityActivityLogs
- auth/permission queries
- Prisma/Neon
- SWR reconciliation
- Pusher subscribe
- images/avatars
- encoded transfer bytes

วัด cold panel open และ warm panel open อย่างน้อยอย่างละ 5 ครั้ง
รายงาน p50/p95 และห้ามสรุปจากการวัดครั้งเดียว
จากนั้นยืนยัน bottleneck ด้วย controlled experiment ก่อนแก้ code

---

Prompt สำหรับ Mutation
ใช้ $trace-performance-bottleneck

วิเคราะห์ Action: Reply Activity ใน EditDealPanel

Milestones:

- click → optimistic reply painted
- click → database commit confirmed
- click → Pusher delivered
- click → user คนที่สองเห็น reply

วัด Client, Network, Server Action, Auth, Prisma read/write,
Neon execution, notification creation, Pusher และ React reconciliation

ทดสอบ success, rollback และ duplicate-event race
วัดอย่างน้อย 5 ครั้งและรายงาน p50/p95, bytes และ trace coverage
ห้ามแก้ก่อนพิสูจน์ bottleneck
