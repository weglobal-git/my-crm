# แผนวิเคราะห์และปรับปรุง Pipeline Workspace

วันที่: 2026-09-09 · หน้า `/pipeline?tab=workspace`

## ขอบเขตและสถานะ

เป้าหมาย: ลด transfer รวมตลอดการทำงาน เพิ่มความเร็วที่ผู้ใช้รับรู้ และให้ action แสดงผลทันทีพร้อม sync ผู้ใช้อื่น โดยคงข้อมูล สิทธิ์ ลำดับการ์ด และ workflow เดิม

งานรอบนี้เป็นการวิเคราะห์และจัดทำแผน ยังไม่แก้ application code หรือฐานข้อมูล ใช้ fable-5, crm-performance-optimization และ crm-realtime-optimistic-ui พร้อม read-only scout ตรวจเส้นทางข้อมูลอย่างอิสระ

ตรวจหน้า localhost แล้ว browser แสดงหน้า Sign in จึงยังไม่มี authenticated HAR, production baseline, LCP/INP หรือผลทดสอบ action สองผู้ใช้ ห้ามตีความข้อเสนอด้านล่างเป็นผลลดเวลา/bytes ที่วัดแล้ว

Working tree มีงานเดิมใน EditDealPanel.tsx, RewriteCommentModal.tsx, ai-rewrite.ts และ constants ต้องรักษางานเหล่านี้เมื่อเริ่ม implementation

## หลักฐานจากโค้ด

| ประเด็น | หลักฐาน | ข้อสรุปและข้อจำกัด |
|---|---|---|
| มีเส้นทางโหลด users ซ้ำ | `src/components/pipeline/EditDealPanel.tsx:772,1948`; `KanbanBoard.tsx:232` | มี SWR/preload ของ all-users แล้ว แต่ Collaborate เรียก action ตรงอีกครั้ง; ตรวจจำนวน request ใน browser ก่อน/หลัง |
| โหลดข้อมูลล่วงหน้าทุกครั้งที่เปิด panel | `EditDealPanel.tsx:874–900` | Summary และ Accelerators เริ่มเมื่อเปิด panel; อีก 150ms preload media และ summary อีก ต้องตรวจว่า summary ซ้ำจริงหรือไม่ และแท็บใดต้องใช้ Accelerator |
| Route invalidation หลัง action | `src/lib/actions/opportunity.ts:107,239,425,706,762,790,814` | ยังเรียก revalidatePath ขณะที่ Pusher patch cache ได้แล้ว มีโอกาสเพิ่ม RSC response/DB work; ต้องวัดจริง |
| Initial board มี query ต่อเนื่อง | `src/app/pipeline/page.tsx:28–35` | รอ stages + opportunities แล้วรอ pending accelerators ก่อน render; ข้อมูล accelerator มีผลต่อ priority/order จึงเลื่อนโหลดทันทีไม่ได้ |
| Workspace ไม่จำกัดจำนวนรายการ | `src/lib/pipeline-opportunities.ts:26–80` | ใช้ lean select และ latest comment 1 รายการแล้ว แต่ทุก open deal ยังถูกส่ง พร้อม full comment และข้อมูลคนซ้ำ |
| Accelerator key ไม่ตรงข้อมูล | `KanbanBoard.tsx:179–181` | key ใช้ 100 ID แรก แต่ fetch ทุก ID; การเปลี่ยนรายการหลัง 100 อาจไม่ได้ key ใหม่ เป็นข้อผิดพลาดเชิงโครงสร้างที่ต้องมี regression test |
| มี full-board reconciliation หลายทาง | `KanbanBoard.tsx:156,275–278,293,316,533` | reconnect/unknown event/new membership อาจโหลดบอร์ดใหม่; ยังไม่ยืนยันว่าเกิด request ซ้ำจริง |
| Rollback สมาชิกเป็น snapshot ทั้งชุด | `EditDealPanel.tsx:2225–2325` | action ที่ล้มเหลวอาจย้อนทับ action ถัดไปหรือ event จากผู้อื่น ต้องจำลอง concurrency ก่อนสรุปเป็น bug ที่ reproduced |
| บาง action ยังรอผลก่อน feedback | `EditDealPanel.tsx:2194–2222` | delete system log ไม่มี local optimistic removal; transfer รอ request แล้วรอ system log ต้องคงความหมายว่าเป็นคำขอโอน ไม่ใช่โอนสำเร็จ |

สิ่งที่มีแล้วและควรรักษา: server snapshot + SWR ที่ข้าม initial refetch, dynamic EditDealPanel, search debounce, patch Pusher events, pagination Activity/System และ on-demand create data การมี useSWR key เดียวทั้ง View/Board ไม่ใช่หลักฐานว่าเกิด request ซ้ำ

Skill เป็นแนวทาง ไม่ใช่ baseline: รายการ known issues บางข้อเก่าแล้ว; ไม่เปลี่ยนเป็น CSR ทั้งหมดเพียงเพื่อให้ HTML เล็ก และไม่ปล่อย critical mutation เป็น fire-and-forget จนตรวจ failure ไม่ได้

## ลำดับดำเนินการและเกณฑ์ผ่าน

### 0. เก็บ baseline ที่ทำซ้ำได้ (check: trace มี scenario/environment/sample count ครบ)

- ใช้ browser ที่ล็อกอินด้วยบัญชีทดสอบและข้อมูลที่อนุญาตให้แก้; ใช้สอง session สำหรับ multi-user
- แยก dev ปัจจุบันออกจาก production build ใน environment ทดสอบ ใช้ข้อมูล/role/device/network เดียวกันก่อนและหลัง ไม่ใช้ dev compile time ตัดสิน production
- เก็บ cold load, warm load, กลับเข้าหน้าเดิม, เปิด/ปิดการ์ดเดิมและต่างใบ, สลับ Activity/Collaborate/Media/Summary, search/filter, idle 60 วินาที และ reconnect
- เก็บ HAR ที่ตัด credentials, transfer bytes จริง แยก document/RSC/JS/CSS/images/action responses และ WebSocket frames; แยก decoded size จาก transfer และ cache hits
- วัด first usable board (การ์ดจริง+controls ใช้งานได้ ไม่ใช่ skeleton), LCP, INP, CLS, action-to-paint, server acknowledgement, remote-user update และ DB time/query count
- การเปรียบเทียบเริ่มอย่างน้อย 5 รอบต่อ scenario รายงาน median/range; p95 ต้องใช้ sample ที่มากพอและระบุจำนวน ไม่อ้าง p95 จากรอบน้อย

### 1. ลด request ส่วนเกินก่อน (check: workflow เดิมมี request/bytes ลดลงและไม่มีข้อมูลหาย)

- ใช้ all-users cache เดียวใน Collaborate/Invite/Transfer; รักษา refresh policy เมื่อ directory เปลี่ยน
- เลิก summary preload ซ้ำเมื่อ trace ยืนยัน; media โหลดตาม tab intent หรือเปิดแท็บ พร้อมรักษา cache เพื่อกลับมาใช้งานทันที
- จัด preload budget ตาม network และ intent; ตรวจว่า transfer ที่ประหยัดไม่แลกกับ tab-ready time ที่แย่ลง
- แก้ Accelerator key ให้ตรงชุด IDs ทั้งหมดแบบ stable และ scope ตามข้อมูล/สิทธิ์ที่ต้องใช้ (check: เพิ่ม/ลบ/สลับลำดับรายการมากกว่า 100 ใบ)

### 2. ให้หนึ่ง action มีการ sync เท่าที่จำเป็น (check: action response และ event converge โดยไม่ full-board refresh ที่ไม่จำเป็น)

- เลือกสมาชิกหนึ่ง action เป็น vertical slice: local optimistic patch → awaited mutation → authoritative response → scoped cache reconciliation → push ให้ผู้มีสิทธิ์
- วัด response ของ revalidatePath ก่อนตัดออก; sweep callers และหน้าที่ใช้ข้อมูลร่วมทุกจุด ต้องยังเห็นค่าถูกเมื่อ navigate กลับ
- ใช้ mutation ID/event ID และ version เมื่อจำเป็นเพื่อกัน duplicate, out-of-order และ event echo; รวม reconnect recovery ให้มีผู้ประสานงานเดียว โดยยังดึงค่าจริงเมื่อขาด event
- ข้อมูลหรือสิทธิ์เปลี่ยนให้ server ตรวจและส่ง snapshot ที่อนุญาต; อย่าแก้ด้วย broadcast payload ทุกคนหรือเพิ่ม refetch แบบไร้เงื่อนไข
- Audit log ที่ต้องเก็บต้อง commit อย่างเชื่อถือได้ร่วมกับ mutation หรือ durable job; push ที่ไม่บล็อก UI ต้องมี failure handling/retry ตาม runtime ไม่ใช้ void promise เป็นหลักประกัน delivery

### 3. ทำ action ต่อเนื่องและ rollback ปลอดภัย (check: pending/failure/concurrency matrix ผ่าน)

- ครอบคลุม create, move, due date, comment/reply/edit/delete, member add/remove, transfer request, WON/LOST, conversion, notes/customer และ AI actions ที่เปิดใช้จริง
- patch เฉพาะ operation เมื่อ rollback; อย่าย้อน cache ทั้งชุดจนลบผลของ operation ถัดไป
- pending state ต่อ item/operation และกัน double-submit; ล็อกเฉพาะ action ที่ขัดกัน ผู้ใช้ยังทำงานกับส่วนอื่นได้
- เก็บ draft/ข้อความ/ไฟล์เมื่อบันทึกไม่สำเร็จ มี retry/error ชัดเจน; temp ID ถูกแทนด้วย ID จริงโดยไม่เกิดรายการซ้ำ
- transfer แสดงคำขอ pending และ AI แสดงกำลังประมวลผลทันที ไม่แสดงผลสำเร็จก่อน server ยืนยัน business outcome
- ทดสอบ DB/action failure, latency สูง, 2 action ติดต่อกันที่สำเร็จสลับลำดับ, event มาก่อน response, offline/reconnect, และถอนสิทธิ์ขณะเปิด panel

### 4. ลด initial payload และงาน render ตาม baseline (check: first usable board และ total workflow transfer ดีขึ้นพร้อมกัน)

- วิเคราะห์ bytes ต่อ field แล้วออกแบบ card DTO + detail on demand; ถ้าข้อมูลคนซ้ำมากให้ประเมิน dictionary โดยไม่ตัด field ที่มีผลต่อสิทธิ์หรือ UI
- ประเมิน summary ของ pending accelerator ที่ไม่ต้องอ่าน/parse AI JSON เต็มทุกครั้ง พร้อมวิธี update ให้ตรงกัน
- เปรียบเทียบ SSR snapshot เดิมกับ streamed/bounded snapshot ก่อนเลือก; ไม่ตัด initial snapshot โดยดู HTML size อย่างเดียว
- ถ้าจำนวนการ์ดเป็นคอขวด ให้ทดลอง virtualization หรือ incremental loading โดยรักษา counts, search ครบข้อมูล, priority/order, drag/drop, keyboard navigation และ scroll position
- ทำ DB query plan/index analysis จาก query จริงก่อนเสนอ migration; ไม่รัน prisma db push อัตโนมัติจาก checklist
- ตรวจ bundle ของ panel และแท็บย่อยเมื่อ trace ยืนยัน parse/render เป็นคอขวด; ไม่เพิ่ม complexity จากการ split ทุก component โดยไม่มีผลวัด

## เป้าหมายการยอมรับ (เป้าหมาย ไม่ใช่ผลที่ทำได้แล้ว)

- Optimistic feedback ภายใน 100ms โดยตั้งเป้าใกล้ 50ms สำหรับ action ที่ patch local ได้
- First usable board warm navigation เป้าหมายไม่เกิน 1s; cold LCP เป้าหมาย ≤2.5s, INP ≤200ms, CLS ≤0.1 บน profile ทดสอบที่ตกลงและบันทึกไว้
- Remote update เป้าหมาย ≤1s หลัง commit เมื่อ connection ปกติ พร้อม convergence หลัง reconnect
- ไม่มี request ซ้ำที่ระบุได้ใน users/summary flow; known patchable action ไม่โหลดบอร์ดทั้งชุดโดยไม่จำเป็น
- Transfer รวมต้องลดลงใน workflow เทียบเท่า ไม่ตั้งเปอร์เซ็นต์ก่อนมี baseline และไม่ถือการย้าย bytes จาก initial load ไปแท็บถัดไปเป็นการลดรวม
- ทุก action คง permissions/business rules, draft, focus, scroll, panel state และ rollback correctness; หากไม่ผ่านให้ revert เฉพาะ slice

## Verification ที่รันแล้ว

`node --import tsx --test src/lib/pipeline-activity-cache.test.ts` — ผ่าน 2/2: แท็บที่ไม่ใช่ Activity/System ไม่สร้าง log fetch key และ Activity/System แยก key/หยุดเมื่อหมดหน้า

อ่าน Next.js docs ที่ติดตั้งจริง `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md`: Server Function สามารถ update UI ของ affected path ทันที จึงต้องวัด RSC response ไม่ใช่ค้นหา router.refresh อย่างเดียว

ยังไม่ได้รัน production benchmark, mutation tests, browser performance trace หรือ multi-user tests ผล unit test นี้ไม่ครอบคลุมทั้งหมดนั้น

ขั้นแรกเมื่อเริ่ม implementation: เก็บ authenticated baseline ตามข้อ 0 แล้วทำ slice all-users + preload พร้อม request-count comparison ก่อนแตะ SSR หรือ DB schema
