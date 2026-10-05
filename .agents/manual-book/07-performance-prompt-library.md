# Prompt Library สำหรับ Performance Skills

แทนค่าข้อความในวงเล็บเหลี่ยมก่อนใช้งาน หากไม่มีข้อมูลบางข้อสามารถลบข้อนั้นออกได้

## 1. `$performance`

### ใช้เมื่อ

หน้าเว็บช้า โหลดช้า interaction หน่วง หรืออยากทำ performance audit โดยยังไม่ทราบ bottleneck ที่แน่นอน

### Prompt: วิเคราะห์และแก้ไข

```text
ใช้ $performance ตรวจและปรับความเร็วของ [route/page]

อาการ: [อธิบายอาการ]
ขั้นตอนทำซ้ำ: [ขั้นตอน]
environment: [local production/staging/production]
ข้อมูลที่มี: [metric หรือไม่มี]

ขอให้:
1. วัด baseline ก่อนแก้
2. หา bottleneck จากหลักฐาน ไม่ปรับแบบเดา
3. แก้เฉพาะจุดที่มีผลสูง
4. รักษา permissions และพฤติกรรมเดิม
5. วัดซ้ำด้วยเงื่อนไขเดิมและรายงาน before/after
```

### Prompt: วิเคราะห์อย่างเดียว

```text
ใช้ $performance วิเคราะห์ [route/page] โดยยังไม่แก้โค้ด
แยก measured findings ออกจาก hypotheses และจัดลำดับสิ่งที่ควรแก้ตาม impact พร้อมวิธีพิสูจน์แต่ละข้อ
```

## 2. `$core-web-vitals`

### ใช้เมื่อ

มีปัญหา LCP, INP, CLS, layout shift หรือมีข้อมูล Page Experience/CrUX แล้ว

### Prompt

```text
ใช้ $performance และ $core-web-vitals ตรวจ [LCP/INP/CLS] ของ [route/page]

ค่าที่พบ: [metric และแหล่งข้อมูล เช่น CrUX/trace/RUM]
อุปกรณ์และ network: [รายละเอียด]
journey ที่ทดสอบ: [รายละเอียด]

ขอให้ระบุ metric phase หรือ element ที่เป็นต้นเหตุ ตรวจเฉพาะ code path ที่เกี่ยวข้อง แก้ไข และวัดซ้ำภายใต้เงื่อนไขเดิม ห้ามสรุปว่า field metric ดีขึ้นจาก local test เพียงอย่างเดียว
```

## 3. `$trace-performance-bottleneck`

### ใช้เมื่อ

action, API, Server Action หรือ database query ช้าแบบเฉพาะจุด อาการไม่สม่ำเสมอ หรือ `$performance` ยังแยก layer ไม่ได้

### Prompt: Focused trace

```text
ใช้ $trace-performance-bottleneck แบบ Focused trace กับ action [ชื่อ action]

เริ่มจับเวลาเมื่อ: [start signal]
ถือว่าเสร็จเมื่อ: [completion signal]
ขั้นตอนทำซ้ำ: [ขั้นตอน]
อาการ: [รายละเอียด]

หา dominant latency ระหว่าง browser, network, server และ database จาก representative samples แล้วแก้เฉพาะ root cause ตรวจ permissions และรายงาน before/after
```

### Prompt: Deep trace

```text
ใช้ $trace-performance-bottleneck แบบ Deep trace กับ [journey/action]
อาการเกิดไม่สม่ำเสมอ: [รายละเอียด]

ทำ correlated instrumentation เท่าที่จำเป็น เก็บ baseline ที่เหมาะกับ variance พิสูจน์ root cause ก่อนแก้ วัดซ้ำด้วยชุดเงื่อนไขเดิม และลบ temporary probes ทั้งหมดก่อนจบงาน
```

## 4. `$vercel-react-best-practices`

### ใช้เมื่อ

เขียนหรือ review React/Next.js, data fetching, rendering, waterfalls, bundle หรือ re-render โดยมีขอบเขตชัดเจน

### Prompt: Review

```text
ใช้ $vercel-react-best-practices review [ไฟล์/component/route]

โฟกัส: [waterfall/bundle/server rendering/client fetching/re-render]
ปัญหาที่ต้องแก้: [รายละเอียด]

ใช้เฉพาะ rules ที่เกี่ยวข้องกับ code path นี้ จัดลำดับตาม impact และอย่าทำ repo-wide refactor หากไม่จำเป็น ต้องยึด Next.js docs ของ version ที่ติดตั้งและ $crm-feature-architecture
```

### Prompt: ใช้ร่วมกับการแก้ performance

```text
ใช้ $performance หา bottleneck ของ [page] ก่อน เมื่อพบว่าอยู่ใน React/Next.js implementation ให้ใช้ $vercel-react-best-practices เฉพาะหมวดที่เกี่ยวข้อง จากนั้นแก้และวัดผลซ้ำ
```

## 5. `$vercel-optimize`

### ใช้เมื่อ

ต้องการตรวจ production usage, Vercel bill, Function Invocations, Build Minutes, Fast Data Transfer, caching หรือ slow/expensive routes จาก Vercel metrics

### Prompt

```text
ใช้ $vercel-optimize audit โปรเจกต์ Vercel [ชื่อโปรเจกต์]
scope/team: [team หรือ personal account]

เป้าหมาย: [ลดค่าใช้จ่าย/หา slow routes/เพิ่ม cache hit/ลด invocations]
ช่วงที่สนใจ: [ช่วงเวลา]

เก็บ production signals ก่อนตรวจโค้ด วิเคราะห์เฉพาะ candidates ที่มี metric รองรับ จัดลำดับคำแนะนำตาม impact และอ้างอิงไฟล์จริงกับ framework version ห้าม fallback เป็น code-only audit โดยไม่แจ้งก่อน
```

ไม่ควรเรียก skill นี้สำหรับ local page ที่ช้าทั่วไปหรือ React refactor ที่ไม่มี Vercel metrics

## 6. `$web-quality-audit`

### ใช้เมื่อ

ต้องการ audit หลายหมวดพร้อมกัน ไม่ใช่ performance เพียงอย่างเดียว

### Prompt

```text
ใช้ $web-quality-audit ตรวจ [URL/routes]

ขอบเขต:
- device: [mobile/desktop/both]
- access: [public/authenticated]
- journeys: [รายการ]
- categories: Performance, Accessibility, SEO, Best Practices และ Agentic Browsing

เก็บ runtime evidence ก่อนค้นโค้ด แยก measured findings ออกจาก source hypotheses จัดระดับ severity และเสนอ priority จาก user impact จากนั้นตรวจซ้ำเฉพาะส่วนที่แก้
```

## 7. `$crm-feature-architecture`

### ใช้เมื่อ

เปลี่ยน page/feature ของ CRM โดยเฉพาะ data ownership, loading, DTO, cache, mutation, optimistic UI หรือ realtime recovery

### Prompt

```text
ใช้ $crm-feature-architecture ตรวจการเปลี่ยนแปลงของ [feature/page]

เป้าหมาย: [สิ่งที่ต้องการเปลี่ยน]
พฤติกรรมที่ต้องรักษา: [permissions/draft/cache/realtime/interaction]

ก่อนแก้ให้ trace entry point, UI owner, cache owner, server operation, authorization และ callers ของ shared code เลือก data/loading boundary ที่ลดงานโดยไม่ย้าย SSR ไป CSR เพียงเพื่อลด HTML และใช้ verification ตาม risk จริง
```

## 8. `$pipeline-deal-panel-architecture`

### ใช้เมื่อ

งานเกี่ยวข้องกับ `/pipeline`, KanbanBoard, EditDealPanel หรือ Deal Drawer Tabs ต้องเรียก skill นี้เสมอ

### Prompt

```text
ใช้ $crm-feature-architecture และ $pipeline-deal-panel-architecture แก้ [feature] ใน Pipeline

เป้าหมาย: [รายละเอียด]
ปัญหาด้าน performance: [รายละเอียด]

รักษา EditDealPanel ให้เป็น orchestrator, unmount inactive heavy tabs, เก็บ drafts ตาม architecture, โหลด heavy data on demand และใช้ mutation/cache owner ที่กำหนดไว้ เมื่อแก้เสร็จให้รัน npm run verify:pipeline
```

## 9. `$crm-realtime-optimistic-ui` และ `$pusher-management`

### ใช้เมื่อ

ข้อมูลไม่สด, ไม่อัปเดต, ต้อง refresh, optimistic state ไม่ reconcile หรือมีปัญหา subscription/polling/reconnect

### Prompt

```text
ใช้ $crm-realtime-optimistic-ui, $pusher-management และ $crm-feature-architecture ตรวจ [page/action]

อาการ: [ไม่อัปเดต/ต้อง refresh/stale หลัง mutation/reconnect แล้วข้อมูลผิด]
ผู้ใช้หรือ clients ที่เกี่ยวข้อง: [รายละเอียด]

ตรวจ mutation response, optimistic update, cache merge, event subscription, dedup/order และ missed-event recovery แก้โดยไม่พึ่ง Pusher เป็น confirmation ช่องทางเดียว และรักษา authorization ของข้อมูล
```

## ตัวอย่าง Prompt รวมที่แนะนำ

### หน้า Pipeline โหลดและลากการ์ดช้า

```text
ใช้ $performance, $crm-feature-architecture และ $pipeline-deal-panel-architecture ตรวจหน้า /pipeline

อาการ:
- initial load ช้า
- ตอนลากการ์ดมีอาการกระตุก

วัด initial load และ drag interaction แยกกัน หา bottleneck จาก trace/network/render evidence ใช้ $vercel-react-best-practices เฉพาะเมื่อหลักฐานชี้ไปที่ React/Next.js แก้แบบ scoped รักษา permissions, draft และ optimistic behavior แล้วรัน npm run verify:pipeline พร้อมรายงาน before/after
```

### ตรวจช้าโดยไม่อนุญาตให้แก้

```text
ใช้ $performance วิเคราะห์ [page/action] เท่านั้น ห้ามแก้ไฟล์ ห้ามเปลี่ยน database หรือ deployment settings

รายงาน measured evidence, root-cause candidates, confidence, expected impact และคำสั่งหรือ scenario สำหรับยืนยันแต่ละข้อ
```

### ให้ Agent แก้จนจบ

```text
ใช้ $performance แก้ปัญหา [page/action] ให้จบภายในขอบเขตนี้

เริ่มจาก baseline เลือก specialist เฉพาะที่จำเป็น ปฏิบัติตาม CRM/domain architecture แก้ root cause ตรวจ behavior และ permissions วัดซ้ำภายใต้เงื่อนไขเดิม และสรุป files changed, checks, before/after กับสิ่งที่ยังไม่ได้พิสูจน์
```
