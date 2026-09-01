# Pipeline performance case study

กรณีศึกษานี้บันทึกผลตรวจจริงเมื่อวันที่ 1 กันยายน 2026 ในโปรเจกต์ `/Users/light/my-crm` ครอบคลุมสอง action:

1. นำทางเข้า `/pipeline?tab=workspace` จน Kanban พร้อมใช้งานและ Pusher เชื่อมต่อ
2. คลิกการ์ดเพื่อเปิด `EditDealPanel` จน shell, Activity, textarea และ Pusher listener พร้อม

ตัวเลขมาจาก local production build และ dataset ณ เวลาที่ทดสอบ ใช้เป็นบทเรียนด้านวิธีวิเคราะห์และ causal evidence ไม่ใช่ performance budget ถาวรของทุก environment

## บทสรุปรวม

คอขวดไม่ใช่ “React ช้า” หรือ “Neon query ช้า” แบบกว้าง ๆ แต่เป็นหลาย boundary ที่สะสมกัน:

- Initial Pipeline ใช้ Prisma relation loading แบบหลาย SQL round trips เรียงกัน แม้ SQL execution ใน Neon เร็วมาก
- Authentication และ permission ถูกเรียกซ้ำหรือต่ออนุกรมในบาง path
- Initial JavaScript และ speculative prefetch โหลดสิ่งที่ยังไม่จำเป็น
- Cold EditDealPanel มี dynamic import/Suspense retry delay ประมาณ 300 ms แม้ chunk รับเสร็จภายในประมาณ 4 ms
- Warm EditDealPanel มี timeout focus ที่บังคับรอ 100 ms โดยไม่มี causal need
- Activity Server Action ทำ permission query และ opportunity-access query ต่ออนุกรม ทั้งที่เป็น read-only และอิสระจากกันหลัง session ถูกตรวจแล้ว

หลักสำคัญคือแยก `SQL execution`, `Prisma wall time`, `network round trip`, `React scheduling`, `intent prefetch` และ `encoded transfer` ออกจากกัน ห้ามใช้ชื่อชั้นเทคโนโลยีเป็นคำตอบแทนการวัด boundary

## Prompt 1 — Initial Pipeline navigation

### Action contract

```text
Action: cold/warm navigation เข้า /pipeline?tab=workspace
Start: click/navigation เริ่ม
Complete: Kanban แสดงการ์ดครบ, interaction พร้อม และ private Pusher channel เชื่อมต่อ
Environment: local production build; ห้ามใช้ Next.js dev/HMR สรุปผล
```

### คอขวดที่พบ

#### 1. Prisma relation loading สร้าง 8 SQL round trips เรียงกัน

`getPipelineOpportunities` โหลด Opportunity พร้อม company, owner, team members, tags และ latest activity ผ่าน Prisma relation loading แบบ query strategy จึงเกิด SQL แยกประมาณ 8 ชุดต่อ request

หลักฐาน:

- Prisma wall time ประมาณ 261 ms
- Neon SQL execution แต่ละ query ประมาณ 1–3 ms
- Controlled experiment ใช้ `relationLoadStrategy: 'join'` ทำให้เหลือ 1 SQL และ Prisma wall timeประมาณ 46 ms
- เปรียบเทียบผล query strategy และ join strategy โดยใช้ deterministic ordering ของ latest activity (`createdAt DESC`, `id DESC`) เพื่อกันผลต่างเมื่อ timestamp เท่ากัน

ข้อสรุป: คอขวดคือจำนวน database network round trips ไม่ใช่ scan หรือ SQL execution

สิ่งที่แก้:

- เปิด Prisma `relationJoins` preview feature
- Production query ใช้ `relationLoadStrategy: 'join'`
- เพิ่ม deterministic order ให้ latest Activity
- ย้าย select/query logic ไป server-only helper กลาง เพื่อให้ Page และ Server Action ใช้ shape เดียวกัน

ข้อผิดพลาดที่ต้องจำ: การเพิ่ม `relationLoadStrategy` โดยไม่ regenerate Prisma Client ทำให้ dev process เก่าขึ้น `Unknown argument relationLoadStrategy` ได้ ต้อง `prisma generate` และ restart process ที่ถือ client เก่า ห้ามสรุปว่า feature ใช้ไม่ได้จาก stale dev runtime

#### 2. Authentication/permission ถูกทำซ้ำ

Page เคยตรวจ actor แล้ว path ด้านข้อมูลตรวจซ้ำ ทำให้เสีย session/auth และ permission round trip เพิ่ม

สิ่งที่แก้:

- Server Component เรียก `requirePipelineActor()` หนึ่งครั้ง
- ส่ง trusted actor เข้า server-only `getPipelineOpportunitiesForActor()`
- Public Server Action สำหรับ client ยังคง re-authenticate เสมอ แล้วจึงเรียก helper เดียวกัน

Security invariant: ห้ามรับ actor/role/department จาก client เพื่อประหยัด auth การ reuse actor ทำได้เฉพาะภายใน server call chain ที่เชื่อถือได้

#### 3. Initial JavaScript และ speculative prefetch มากเกินไป

สิ่งที่พบ:

- EditDealPanel ถูก idle preload แม้ผู้ใช้ยังไม่แสดง intent
- Navigation links prefetch route ที่ไม่เกี่ยวกับ action ปัจจุบัน
- สิ่งเหล่านี้เพิ่ม initial request/transfer และแย่ง bandwidth กับ Pipeline

สิ่งที่แก้:

- ยกเลิก idle preload ของ EditDealPanel
- preload Panel และ Activity เฉพาะ pointer-enter/focus intent ของการ์ด
- ปิด prefetch บน Header/Sidebar links ที่ไม่จำเป็นสำหรับ completion signal
- defer dynamic Panel chunk จนมี intent หรือ click

### Before/after

```text
Cold page transfer: 484.7 KB / 30 requests → 427.4 KB / 24 requests
JavaScript:         420.7 KB              → 365.7 KB
Warm RSC p50:       295.9 ms              → 196.7 ms
Warm RSC p95:       371.3 ms              → 251.5 ms
Cold document p50:  338.3 ms              → 214.0 ms
```

Cold document p95 มี noise จึงไม่ใช้เป็นหลักฐาน causal เดี่ยว ต้องเก็บ sample เพิ่มหากต้องการตั้ง SLO จาก p95

```text
Initial Pipeline
├─ Auth/permission
├─ Opportunity relation data
│  └─ dominant cost เดิม: 8 sequential DB round trips
├─ RSC serialization/transfer
├─ Initial JavaScript/CSS
├─ hydration/render
└─ Pusher auth/WebSocket readiness
```

อย่ารวมเวลาของ spans ที่ overlap และอย่าลบ browser timestamp กับ server timestamp คนละ clock ใช้ traceId เชื่อมเหตุการณ์แทน

## Prompt 2 — Open EditDealPanel

### Action contract

```text
Action: คลิกการ์ดเพื่อเปิด EditDealPanel
Start: card click handler เริ่ม
Complete เมื่อครบทุกข้อ:
  1. Panel shell มองเห็น
  2. Activity 10 รายการแรก render
  3. textarea พร้อมพิมพ์
  4. deal Pusher handler bind กับ private channel แล้ว
```

Cold หมายถึง Panel chunks และ Activity cache ยังไม่มี และไม่มี hover/focus prefetch ส่วน warm หมายถึง intent preload เสร็จก่อน click

### Baseline ที่ถูกต้อง

การวัด cold ชุดแรกถูก invalidate เพราะ browser cache ทำให้บาง chunk มี duration/transfer เป็นศูนย์ แม้ชื่อ test จะเรียก cold จากนั้นจึงใช้ production benchmark flag ชั่วคราวปิด static cache และปิด intent prefetch เฉพาะ test path พร้อมตรวจว่า warm-up สร้าง trace สำเร็จก่อนนับ 5 samples

```text
True cold baseline: p50 433.7 ms | p95 770.4 ms
Warm baseline:      p50 113.3 ms | p95 124.5 ms
```

### คอขวดและ controlled experiments

#### 1. Dynamic import/Suspense retry delay ประมาณ 300 ms

หลักฐาน true-cold:

- EditDealPanel chunk เริ่มโหลดช้าประมาณ 300 ms หลัง click ใน path เดิม
- ตัวไฟล์ที่ต้องรับจาก network ใช้เวลาเพียงประมาณ 3–10 ms
- การเรียก `loadEditDealPanel()` พร้อมกับ `setState` ทำให้ request เริ่มที่ 0 ms แต่ Panel ยัง mount หลังประมาณ 300 ms — hypothesis นี้ไม่ลด total และถูกยกเลิก
- การ `await loadEditDealPanel()` ให้ promise resolve ก่อน `setActivePanelDeal` ทำให้ first committed effect อยู่ราว 18–23 ms และ shell visible ราว 29–38 ms

ข้อสรุป: bottleneck คือ React/Next dynamic suspension scheduling ไม่ใช่ download bandwidth

Fix ที่เก็บไว้:

```ts
const handleOpenPanel = useCallback(async (deal, tab) => {
  await loadEditDealPanel();
  setActivePanelDeal({ deal, tab });
  setPanelOpen(true);
}, [closingTimeout]);
```

Intent preload ยังคงทำงานบน desktop; click path นี้ทำให้ touch/direct cold click ไม่เจอ 300 ms retry delay

#### 2. textarea focus timeout 100 ms

Warm path มี Activity และ chunk อยู่ใน cache แล้ว แต่ completion ถูกค้ำไว้ที่ประมาณ 113 ms เพราะ effect ใช้ `setTimeout(..., 100)` ก่อน focus

Controlled experiment ลบ timeout แล้ว focus ref หลัง commit โดยตรง:

```text
Warm p50: 113.3 ms → 22.0 ms
Warm p95: 124.5 ms → 22.9 ms
```

ไม่มี failure ใน production build หรือ dev interaction test จึงยืนยันว่า timeout ไม่ได้ป้องกัน race ที่จำเป็น

#### 3. Permission และ opportunity-access queries ต่ออนุกรม

Baseline Activity Server Action:

```text
Auth session                 ~36–40 ms
Prisma permission            ~36–42 ms
Prisma opportunity access    ~38–40 ms
Prisma activity logs         ~38–43 ms
```

หลัง auth session ได้ actor แล้ว permission และ opportunity-access เป็น read-only checks ที่อิสระต่อกัน จึงรันด้วย `Promise.all` แต่ยัง await และ require ทั้งคู่ก่อนคืนข้อมูล

```text
Server Action p50: 158.7 ms → 114.0 ms
Server Action p95: 257.1 ms → 185.7 ms
```

Security invariant: parallelization เปลี่ยน scheduling เท่านั้น ไม่ตัด permission, ownership, department visibility หรือ failure behavior ออก

#### 4. Neon ไม่ใช่คอขวดของ Activity SQL

`EXPLAIN (ANALYZE, BUFFERS)` ของ Activity query สำหรับ dataset เดียวกันรายงาน:

```text
Planning time:  0.118 ms
Execution time: 0.070 ms
Index scan: ActivityLog_opportunityId_type_idx
Buffers: 5 shared hits, 0 reads
```

Prisma activity wall timeยังอยู่ประมาณ 38 ms ดังนั้นเวลาส่วนใหญ่คือ connection/pool/network/driver round trip ไม่ใช่ PostgreSQL execution ต้องไม่เสนอ index เพิ่มจากอาการนี้โดยไม่มีหลักฐานใหม่

### Final EditDealPanel result

```text
Cold: p50 433.7 ms → 138.9 ms (68.0% faster)
Cold: p95 770.4 ms → 210.6 ms
Warm: p50 113.3 ms → 22.0 ms (80.6% faster)
Warm: p95 124.5 ms → 22.9 ms
```

Representative final cold trace:

```text
Total                              138.9 ms
├─ JavaScript chunks                 3.8 ms   50,004 encoded bytes
├─ textarea committed               17.8 ms
├─ Pusher listener ready            18.1 ms
├─ Panel shell visible              29.2 ms
├─ Activity request                121.8 ms
│  ├─ Auth                          37.5 ms
│  ├─ Permission                    37.9 ms ┐ parallel
│  ├─ Opportunity access            34.4 ms ┘
│  ├─ Activity query                38.3 ms
│  └─ network/serialization          7.8 ms
└─ SWR activity commit               2.5 ms
```

Cold click network:

```text
2 JavaScript requests: 50,004 encoded bytes
1 Server Action:        1,706 gzip bytes
Total:                 51,710 bytes / 3 requests
```

Warm click ใช้ 0 bytes / 0 requests หลัง click แต่ intent prefetch จ่ายต้นทุนประมาณเดียวกันก่อน click ห้ามรายงาน warm click เป็น “ไม่มี network cost” โดยไม่บอกว่า cost ถูกย้ายไป hover/focus

Panel bind handler กับ private Pipeline channel ที่ KanbanBoard subscribe อยู่แล้ว จึงไม่มี Pusher auth หรือ WebSocket connection ใหม่ตอนเปิด Panel

## False leads และข้อผิดพลาดที่ Agent ต้องหลีกเลี่ยง

### “isOpen=false แต่ Panel ยัง render เท่ากับทุกการ์ดมี Panel ค้าง”

`mounted` ภายใน EditDealPanel ทำให้ component ไม่ return null หลัง mount จริง แต่ KanbanBoard มี `activePanelDeal` เพียงหนึ่งตัว และ parent unmount หลัง close animation 300 ms จึงไม่ได้มี 50 Panels ตามจำนวนการ์ด อย่าตัดสิน architecture จาก local component เพียงไฟล์เดียว ต้อง trace ownership/lifecycle จาก parent

### “Chunk ใหญ่คือสาเหตุ”

Panel encoded chunksประมาณ 50 KB แต่รับเสร็จประมาณ 4 ms ใน local benchmark คอขวดจริงคือ request/suspense เริ่มช้า 300 ms การลด bundle อาจยังดีต่อ Vercel transfer แต่ไม่ใช่ causal fix ของ delay นี้

### “เรียก import ตอน click ก็พอ”

ไม่พอในกรณีนี้ การเริ่ม import พร้อม state update ทำให้ network เริ่มเร็วแต่ React ยัง retry ช้า ต้องทดลอง total ไม่ใช่ดูเฉพาะ resource start

### “วัดครั้งแรกแล้วเรียก cold”

ชื่อ scenario ไม่ได้พิสูจน์ cache state ตรวจ `encodedBodySize`, `transferSize`, request count, resource start และ response headers ทุกครั้ง หาก warm-up ไม่ได้สร้าง trace หรือ click ก่อน hydration ห้ามนับเป็น warm-up

### “React Profiler จะให้ duration ใน production เสมอ”

standard React production build ไม่ emit `Profiler.onRender` timing แบบ profiling build ในการตรวจนี้จึงใช้ first committed effect, shell-visible และ completion marks แทน ต้องรายงานข้อจำกัด ห้ามสร้างตัวเลข React reconciliation ปลอม

### “Resource Timing เห็น Server Action transfer ครบ”

Browser Resource Timing ใน environment นี้ไม่แสดง Next Server Action entry จึงใช้ temporary same-origin reverse proxy นับ gzip response bytes แล้วลบ proxy เมื่อเสร็จ ห้ามตีความ entry ที่หายไปว่าไม่มี request

### “Prisma 38 ms แปลว่า SQL 38 ms”

Prisma wall timeรวม pool wait, driver, database network และ serialization ต้องใช้ database-reported `EXPLAIN ANALYZE` แยก SQL execution ก่อนเสนอ index หรือ rewrite SQL

## Correctness checks ที่ทำแล้ว

- Server Action ส่ง Activity 10 รายการและ client render Reply 10 รายการ
- Opening action เป็น read-only ไม่มี test data หรือ DB mutation
- Permission และ opportunity access ยังคง require ทั้งคู่แม้รันขนาน
- Pusher ใช้ targeted private channel เดิม ไม่มี broadcast widening
- TypeScript, targeted ESLint, production build และ `git diff --check` ผ่าน
- Dev UI เปิด Panel, แสดง Activity 10 รายการและ textarea ได้
- `[PERF-TRACE]`, cache flags, proxy, EXPLAIN script และ detailed traces ถูกนำออกเมื่อเสร็จ
- ไม่มี commit ก่อนผู้ใช้ตรวจผล

## Reusable decision rules

เมื่อ Agent วิเคราะห์อาการคล้ายกัน ให้ใช้กฎต่อไปนี้:

1. กำหนด completion หลาย milestone โดยแยก shell, data, input และ realtime readiness
2. วัด production build เท่านั้น และพิสูจน์ cache state ของทุก sample
3. ตรวจว่า warm-up สร้าง action/trace สำเร็จก่อนเริ่มนับ samples
4. แยก resource request start ออกจาก resource download duration
5. แยก Prisma wall time ออกจาก Neon execution time
6. ตรวจ parent lifecycle ก่อนสรุปว่า component ถูก render ค้างหลายชุด
7. ถ้า prefetch ทำให้ click เร็ว ให้รายงาน bytes/requests ก่อน click ด้วย
8. Controlled experiment ต้องเปลี่ยนหนึ่งตัวแปรและ total ต้องลดใกล้ span ที่คาด
9. Hypothesis ที่ไม่ลด total ต้องถูกถอนและไม่ควรเก็บ code change ไว้
10. Optimization ห้ามลด authorization, durability หรือ server-authoritative reconciliation
11. หลังแก้ต้องเทียบ client rows กับ server result และตรวจ second realtime boundary ตาม scope
12. ลบ instrumentation/proxy/test flags และตรวจ working tree ก่อนส่งมอบ

## Remaining bottleneck

หลังการแก้ Activity cold path ยังถูกครองโดย remote Server Action/Prisma round trips ประมาณ 110–125 ms ในรอบปกติ แนวทางตรวจครั้งต่อไปคือทดลองรวม opportunity access กับ Activity retrieval เป็น query ที่ยังพิสูจน์ authorization ได้ หรือใช้ production-safe permission cache ที่มี invalidation ชัดเจน ห้ามทำก่อนมี baseline และ correctness experiment เพราะการ cache permission ผิดอาจกลายเป็น security bug


## Prompt 3 — Reply Activity ใน EditDealPanel

### Action contract

```text
Action: วิเคราะห์ Action: Reply Activity ใน EditDealPanel (addActivityLog Server Action)
Start: ผู้ใช้กดปุ่มส่งข้อความ (Reply)
Complete เมื่อครบทุกข้อ:
  1. click → optimistic reply painted
  2. click → database commit confirmed
  3. click → Pusher delivered
  4. click → user คนที่สองเห็น reply
```

### คอขวดและ controlled experiments

#### 1. Sequential Prisma I/O Operations

หลักฐาน:
- จากการทำ Telemetry trace พิสูจน์ให้เห็นว่า `addActivityLog` มีการเรียกใช้งาน Prisma แบบเรียงลำดับ (Sequential)
- Wait times ถูกบวกทบกันไปเรื่อย ๆ ตามลำดับ (`Wait(Log) + Wait(Deal) + Wait(Notifications)`)
- ส่งผลให้ระยะเวลารวมของ Server Action สูงถึงประมาณ 732 ms (Baseline)

ข้อสรุป: คอขวดเกิดจากการรอ I/O ของฐานข้อมูลทีละขั้นตอน ทั้งที่การบันทึก Log และระบบ Notifications (Database + Pusher) สามารถแยกไปทำงานแบบคู่ขนาน (Parallel) กันได้หลังจากดึงข้อมูล Deal มาแล้ว

สิ่งที่แก้:
- ปรับใช้ `Promise.all` เพื่อให้กระบวนการบันทึกฐานข้อมูล (`Prisma Write Log` และบล็อกของ Notifications) รันแบบคู่ขนาน 
- ลบส่วนคิวรีที่ดึง Relation เปล่าประโยชน์ทิ้ง (`include: { replies: true }`) ตอนสร้าง Activity Log ซึ่งช่วยประหยัดเวลาไปได้ราว ๆ 50 ms

### Before/after

```text
Warm Server Action p50:  732 ms → 468 ms (ลดลง ~30% หรือเร็วขึ้น 230 ms)
Prisma Read Deal:        77 ms  → 35 ms (ขนาน)
Prisma Write Log:        287 ms → 230 ms (ขนาน)
Notifications Block:     167 ms → 170 ms (ขนาน - ถูกซ่อนเวลาอยู่ข้างหลัง Write Log อย่างสมบูรณ์)
Optimistic UI render:    ~3-6 ms
```

### Correctness checks ที่ทำแล้ว

- Database commit confirmed: Activity Log ใหม่ถูกบันทึกลงฐานข้อมูลอย่างถูกต้องสมบูรณ์
- Notification creation และ Pusher delivery: ยังคงส่งแจ้งเตือนได้ถูกต้องแม้ถูกแยกตรรกะออกไปรันคู่ขนาน
- Optimistic UI: อัปเดตข้อมูลบนหน้าจอได้ทันทีแบบไม่ต้องรอ Server response (~3-6 ms)
- นำ Telemetry hooks (`[PERF-TRACE]`, benchmark scripts) ออกจาก source code หลักทั้งหมดหลังทดสอบเสร็จสิ้น
