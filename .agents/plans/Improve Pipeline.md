# แผนวิเคราะห์และปรับปรุง Pipeline Workspace

วันที่: 2026-09-09 · หน้า `/pipeline?tab=workspace`

## 1. ขอบเขตและเป้าหมาย

**เป้าหมายหลัก**: ลด Network transfer ส่วนเกิน เพิ่มความเร็วที่ผู้ใช้รับรู้ (Perceived Speed) โดยที่ Action แสดงผลทันทีและ Sync กับผู้ใช้อื่นอย่างถูกต้อง โดยต้องคงข้อมูล สิทธิ์ ลำดับการ์ด และ Business Workflow เดิมไว้อย่างครบถ้วน

**กลยุทธ์การพัฒนาแบบยั่งยืน (Sustainable Vibe Coding)**:
แทนที่จะเป็นการ Refactor ใหญ่แบบเสี่ยงพังครั้งเดียว หรือลดขนาดไฟล์เพียงชั่วคราว เราจะจัดสถาปัตยกรรมเป็น **“4 เสาด้านโครงสร้าง + 1 เสาด้านการบังคับตรวจ (4 Architectural Pillars + 1 Machine-Enforcement Pillar)”** และทยอยทำทีละ Vertical Slice โดยเริ่มจาก **Team Members (เพิ่ม/ลบสมาชิกและรายชื่อผู้ใช้)** เป็นต้นแบบตัวแรก

---

## 2. หลักฐานจากโค้ดจริง (Code Fact-Check)

| ประเด็น | หลักฐานในโค้ด | ข้อสรุปเชิงเทคนิคและข้อจำกัด |
|---|---|---|
| **โหลด Users ซ้ำซ้อน** | `EditDealPanel.tsx:818, 1994`; `KanbanBoard.tsx:234` | มี SWR cache คีย์ `"all-users"` แล้ว แต่ในแท็บ Collaborate มีการเรียก `getAllUsers().then(setUsers)` ตรงๆ แยกต่างหาก |
| **Eager Preload เกินจำเป็น** | `EditDealPanel.tsx:920-924, 940-948` | `getLatestDealSummary` ถูกดึงผ่าน useSWR ทันทีที่เปิดการ์ด และอีก 150ms ถูกเรียกซ้ำผ่าน `preload` อีกรอบ พร้อม preload Media ทั้งที่ยังไม่ได้เปิดแท็บ Media |
| **Accelerator Key ไม่ตรงข้อมูล** | `KanbanBoard.tsx:179-181` | SWR key ใช้ `allDealIds.slice(0, 100)` แต่ fetcher ส่ง `allDealIds` ทั้งหมด ทำให้ดีลลำดับที่ 101+ ไม่สะท้อนการเปลี่ยนคีย์ |
| **`revalidatePath` กว้างเกินไป** | `opportunity.ts:107, 239, 425, 706, 762, 790, 814` | Server Action สั่ง `revalidatePath('/pipeline')` บังคับให้เซิร์ฟเวอร์ re-render RSC Flight tree ส่งกลับมา แม้หน้าบ้านจะ patch cache และมี Pusher อยู่แล้ว |
| **Workspace ไม่จำกัดจำนวน** | `src/lib/pipeline-opportunities.ts:26–81` | `take: tab === 'completed' ? 20 : undefined` ทำให้ Open Deals ถูกส่งมาทั้งหมดพร้อม relations ลึก |
| **Rollback สมาชิกแบบเหมารวม** | `EditDealPanel.tsx:2317-2324` | Action ล้มเหลวจะยัด snapshot เดิม (`originalTeamMembers`) กลับเข้า state ทั้งก้อน ลบผลของ action หรือ Pusher event ที่เข้ามาขนานกัน |
| **Action ขาด Optimistic Feedback** | `EditDealPanel.tsx:2240, 2250` | `handleDeleteSystemLog` ไม่มี optimistic feedback; `handleTransfer` รอ request จบแล้วต่อด้วย addSystemLog แบบ sequential |

---

## 3. สถาปัตยกรรมหลัก: 4 เสาด้านโครงสร้าง + 1 เสาด้านการบังคับตรวจ

### เสาที่ 1: Tab-Level Isolation พร้อม State Preservation
1. **Unmount Tabs ได้เพื่อประสิทธิภาพ**:
   - ไม่จำเป็นต้อง mount ทุกแท็บทิ้งไว้ใน background เพื่อหลีกเลี่ยง DOM load, listener leaks, และ re-renders
   - แยกแต่ละแท็บเป็น Component ย่อยแบบ Lazy / Dynamic Import
2. **State Store แยกตาม `dealId + tab`**:
   - เก็บ draft ข้อความ, scroll position, และ pending input แยกตาม `[dealId, tabId]`
   - เมื่อผู้ใช้สลับแท็บไปมา (เช่น Activity -> Media -> Activity) คอมโพเนนต์จะ re-hydrate draft และ scroll กลับมาสมบูรณ์
3. **Lifecycle การล้าง State ชัดเจน**:
   - ล้าง state เมื่อ:
     - ส่งข้อมูลสำเร็จ (Clear draft after submission)
     - ปิดการ์ด (หรือล้างหลัง timeout ป้องกัน memory leak)
     - ออกจากระบบ (Logout)
     - สิทธิ์เข้าถึงดีลใบนั้นถูกถอน (Permission Revoked)

### เสาที่ 2: Data Boundaries & Realistic Performance Budgets
1. **Card DTO vs Detail on Demand**:
   - หน้าบอร์ดดึงเฉพาะฟิลด์ที่จำเป็นต่อการแสดงการ์ดและจัดลำดับ (ID, Topic, Value, StageId, Priority, Avatars, Status Badges)
   - ข้อมูลรายละเอียด (System logs, Media lists, AI analysis ตัวเต็ม) ดึงแบบ on-demand เมื่อเปิดการ์ด
2. **DOM & Rendering Scalability**:
   - DTO ลดเฉพาะ network bytes แต่ไม่ลด DOM elements ในเบราว์เซอร์
   - หากจำนวนดีลเติบโตสูง ต้องเตรียมการจัดกลุ่ม (Virtualization / Windowing หรือ Incremental Pagination)
3. **Performance Budget แทนการรับประกัน 0ms**:
   - กำหนด Performance Budget ชัดเจน (เช่น Initial RSC bytes, JS bundle size ต่อแท็บ, Action roundtrip latency)
   - ฟีเจอร์ใหม่ต้องผ่านเกณฑ์ Budget จึงจะอนุญาตให้ผสานโค้ด

### เสาที่ 3: Operation-Based Mutation & Sync Contract
สัญญาการแก้ไขข้อมูลต้องครอบคลุม 6 สถานการณ์:
1. **Optimistic Paint**: สะท้อน UI ทันทีและแสดงเครื่องหมาย pending ประจำรายการนั้น
2. **Authoritative Confirmation**: ใช้ผลลัพธ์จาก Server Response โดยตรงในการยืนยันค่าจริงและค่าที่คำนวณจาก Server
3. **แยกสถานะล้มเหลว (Definite Failure) ออกจากไม่รู้ผล (Indeterminate/Timeout)**:
   - **Definite Failure (HTTP 4xx/5xx ชัดเจน)**: Rollback เฉพาะ Operation นั้น โดยไม่ทับการกระทำลำดับถัดไป
   - **Indeterminate (Network drop / Timeout)**: ห้าม rollback ทันที ต้องแสดงสถานะ retryable พร้อมใช้ **Mutation ID (Idempotency Key)** เพื่อให้การ retry ไม่สร้างข้อมูลซ้ำ
4. **Ordering & Concurrency ป้องกัน A → B → C และ Multi-client Conflicts**:
   - ใช้ **Server Revision / Version Number** ในการตัดสินว่าข้อมูลใดใหม่กว่า ห้ามพึ่ง Timestamp หรือ Event ID เพียงลำพัง (Timestamp อาจ skew, Event ID ใช้แค่กัน duplicate)
   - มี Client Mutation Queue หรือ Version Check ป้องกันการ rollback ของ A ไปเหยียบทับค่า C
5. **ไม่อาศัย Pusher เพียงอย่างเดียว & การเอา `revalidatePath` ออก**:
   - ผู้กดต้องอัปเดต cache จาก Server Action response ของตัวเองได้ทันทีแม้ Pusher จะขาดการเชื่อมต่อ
   - ก่อนเอา `revalidatePath` ออกจาก Action ต้องตรวจ Dependency Graph ของผู้ใช้ข้อมูลร่วม (เช่น Stage counts, summary badges ในหน้าอื่น)
6. **Reconnection Convergence**:
   - เมื่อกลับมาเชื่อมต่อ ให้ Re-sync Authoritative State ผ่าน Coordinator ตัวเดียว ไม่ยิง full-board refetch พร่ำเพรื่อ

### เสาที่ 4: Cache-Topology-Aware Merging
เลิกใช้การเขียนทับ Cache ทั้งก้อน แต่แยกการ Merge ตามโครงสร้างข้อมูล:
- **Single Entity**: Patch ฟิลด์เฉพาะตัว
- **Array of Deals (`pipeline-deals`)**: ค้นหาตาม `id` และอัปเดตเฉพาะฟิลด์ย่อย
- **Paginated Feed (`useSWRInfinite` ใน Activity Feed)**: Cursor/Page-aware update แทรกเฉพาะ Item ใหม่ลงในหน้าที่ถูกต้อง โดยไม่ทำลายโครงสร้าง cursor pagination

### เสาที่ 5: Machine-Enforceable Guardrails (ด่านตรวจอัตโนมัติ)
ด่านตรวจในระดับเครื่องมือเพื่อไม่ให้ AI หรือผู้พัฒนาเพิ่ม Technical Debt กลับเข้ามา:
1. **ESLint Import Rules**:
   - ห้าม UI Components เรียก Server Actions นอก Mutation Hook ที่กำหนด
   - ห้ามสร้าง Pusher subscription ใหม่นอกจุดศูนย์กลาง
2. **Mutation & Concurrency Tests**:
   - ทดสอบ Rollback เฉพาะรายการที่ล้มเหลว (A ล้มเหลวแต่ B ยังอยู่)
   - ทดสอบ Event ที่มาผิดลำดับ (Server Revision ป้องกันการทับข้อมูลใหม่)
   - ทดสอบ Network Timeout / Retry ด้วย Mutation ID
3. **Network Isolation Tests (บน Allowed Request Contract)**:
   - แบ่งหมวดหมู่ request ชัดเจน:
     - *Essential Summary / Badges*: อนุญาตให้โหลดตามความจำเป็นของบอร์ด
     - *Tab Details*: ห้ามโหลดข้ามแท็บ (เช่น เปิด Activity ต้องไม่ยิง Media API)
     - *Shared Directory (Users)*: อนุญาตให้ Collaborate, Invite, Transfer ใช้ร่วมกันผ่าน Shared SWR Cache เดียว
4. **CI Enforcement Gate**:
   - รวมทุกด่านตรวจเป็นคำสั่งเดียว เช่น `npm run verify:pipeline`
   - บังคับรันใน CI Pipeline และ AI ต้องแสดงผลผ่านจริงก่อนสรุปงาน

---

## 4. แผนปฏิบัติการ Vertical Slice: "Team Members (เพิ่ม/ลบสมาชิกและรายชื่อผู้ใช้)"

เพื่อเป็นต้นแบบ (Golden Pattern) ที่นำไปใช้กับทุกฟีเจอร์ถัดไป ขอบเขตของ Slice แรกนี้จะจำกัดอยู่ที่ **การจัดการสมาชิกดีล (Team Members)** เท่านั้น (ไม่รวม Transfer ownership):

### กิจกรรมที่ต้องทำใน Slice นี้:
1. **สร้าง Sub-component `DealTeamMembers`**:
   - สกัดโค้ด Member UI ออกจาก [EditDealPanel.tsx](file:///Users/light/my-crm/src/components/pipeline/EditDealPanel.tsx)
   - เชื่อมต่อกับ SWR Cache `"all-users"` จุดเดียว เลิกใช้ `getAllUsers().then(setUsers)`
2. **สร้าง `useDealMembersMutation`**:
   - รองรับ Optimistic Add / Remove
   - ส่ง `mutationId` และตรวจ Server Revision
   - Granular Rollback: หากเพิ่ม 2 คนพร้อมกัน คนแรกล้มเหลว ให้ rollback เฉพาะคนแรก คนที่สองยังคงอยู่
3. **ปรับปรุง Server Action**:
   - ปรับ Action คืนค่า Authoritative Member List หรือ Delta พร้อม Revision
   - ตรวจสอบ consumers ก่อนเอา `revalidatePath('/pipeline')` ออก โดยพึ่งพา Mutation Response + Pusher + Reconnect Recovery แทน
4. **สร้าง Guardrails & Tests (เสาที่ 5)**:
   - เพิ่ม Concurrency / Rollback Unit Test
   - เพิ่ม Network Request Check ว่าไม่มีการยิง `getAllUsers` ซ้ำซ้อน

### เกณฑ์ตรวจรับของ Slice นี้ (Definition of Done):
- [x] Panel และการ์ดแสดงรายชื่อสมาชิกตรงกันจาก Server Response โดยไม่ต้อง refresh ทั้งหน้า
- [x] ทดสอบเพิ่ม 2 คนต่อเนื่อง คนแรกล้มเหลว แล้วคนที่สองยังอยู่ (Granular delta rollback)
- [x] ทดสอบเพิ่ม/ลบสมาชิกคนเดียวกันต่อเนื่อง และจำลอง event มาผิดลำดับ แล้วผลลัพธ์สุดท้ายถูกต้องตาม Server Revision
- [x] ทดสอบตัดเน็ตเวิร์กตอนส่ง (Response หาย), Retry ด้วย Mutation ID เดิม และเมื่อ Pusher หลุด ข้อมูลสามารถ Reconnect กลับมาตรงกันได้
- [x] ไม่มี Request `getAllUsers` ซ้ำซ้อน โดยมีบันทึก Network trace ยืนยัน
- [x] มีคำสั่งตรวจและ Test ถูกผูกเข้า CI จริง (`npm run verify:pipeline`) และผ่าน 100% (14/14 tests)

---

## 5. บันทึกผลสำเร็จราย Phase (Progress Log)

### Phase 1: Team Members Vertical Slice (เสร็จสมบูรณ์)
- สกัด `DealTeamMembersSection.tsx` ออกจาก `EditDealPanel.tsx`
- สร้าง `useDealMembersMutation` พร้อม Granular Delta Rollback, Server Revision, และ Idempotency
- รวบ SWR cache `"all-users"` จุดเดียวสำหรับรายชื่อผู้ใช้ทั้งหมด
- เพิ่ม Unit Tests ด้าน Concurrency & Permissions (5 tests)

### Phase 2: Activity Feed & Draft Store (เสร็จสมบูรณ์)
- สกัด `ActivityFeedTab.tsx` และ `ActivityCommentItem.tsx` ออกจาก `EditDealPanel.tsx`
- สร้าง Global In-Memory Draft Store (`deal-draft-store.ts`) จดจำข้อความและไฟล์แนบข้ามการสลับแท็บ
- ออกแบบ Full-Width Bottom Dock ผ่าน React Portal (`deal-panel-activity-dock`)
- เพิ่ม Unit Tests สำหรับ Draft Store (5 tests)

### Phase 3: Network & Mutation Optimization (เสร็จสมบูรณ์)
- ตัด `revalidatePath('/pipeline')` ออกจาก `moveOpportunity` และ `updateDueDateWithLog`
- ปรับ AI Summary และ Shared Media เป็น On-Demand fetching ผ่าน `dealSummaryKey` และ `sharedMediaKey`
- ตัด eager background preloader 150ms ออก
- เพิ่ม Network Isolation Unit Tests (4 tests)

### Phase 4: Modular Component Extraction & File Size Reduction (เสร็จสมบูรณ์)
- สกัด `DealSystemLogsTab.tsx` (116 บรรทัด)
- สกัด `DealManagerCallTab.tsx` (263 บรรทัด)
- สกัด `DealSummaryTab.tsx` (564 บรรทัด)
- ลดขนาดไฟล์ `EditDealPanel.tsx` จาก 2,493 บรรทัด เหลือ 1,809 บรรทัด (ลดลงกว่า 684 บรรทัด)
- การสลับแท็บ Unmount จาก DOM 100% ลดการกิน Memory และลด Re-render
- รัน `npm run verify:pipeline` ผ่าน 14/14 tests ด้วย 0 TypeScript errors

### Phase 5: Accelerator & Manager Call Realtime Sync (เสร็จสมบูรณ์)
- สร้างโมดูลรวมศูนย์ `src/lib/deal-accelerators-sync.ts` สำหรับ SWR key matching และ optimistic badge mutations (`decrementPendingBadge`, `incrementPendingBadge`, `setPendingBadgeCount`, `mergePendingAccelerators`)
- แก้ไขปัญหา SWR key mismatch ใน `KanbanBoard.tsx` โดยใช้ Stable Key `'pending-accelerators'` ร่วมกับ `trackedDealIdsRef` สำหรับดึงและ merge ข้อมูลการ์ดใหม่แบบ Incremental โดยไม่ล้าง cache การ์ดเดิม
- Badge ปิดทันทีแบบ Zero-Latency (<10ms) เมื่อตอบคำถามครบ โดยลบ key ออกจาก map ทันที (`delete next[deal.id]`)
- รองรับการ Sync ข้ามแท็บและข้ามอุปกรณ์ผ่าน Pusher `DEAL_ACCELERATORS_UPDATED` และ `BroadcastChannel` ใน `pusher-connection-manager.ts`
- เพิ่ม Micro-interaction สปินเนอร์ (`Loader2`) บนปุ่ม Preset Choice ที่ถูกคลิกใน `AcceleratorQuestionCard.tsx`
- ลดขนาดไฟล์ `EditDealPanel.tsx` ลงเหลือ 1,730 บรรทัด (ลดลงรวม 763 บรรทัดจาก 2,493 บรรทัดเดิม)
- เพิ่ม Unit Tests ใน `src/lib/deal-accelerators-sync.test.ts` (6 tests)
- รัน `npm run verify:pipeline` ผ่านสมบูรณ์ 20/20 tests ด้วย 0 TypeScript errors

### Phase 7: Kanban Board Payload & Card DTO (เสร็จสมบูรณ์ - Final Phase)
- สร้างโมดูล `src/lib/pipeline-card-dto.ts` ใช้ `Prisma.validator<Prisma.OpportunitySelect>()` กำหนด `pipelineCardSelect` และ `KanbanCardDTO` อย่างเป็นทางการ
- กำหนด Data Boundary ชัดเจน: ดึงเฉพาะข้อมูลที่การ์ดต้องใช้ (ID, Topic, Status, Type, Value, DueDate, Avatars, 1 Latest Activity Log) ป้องกันการรั่วไหลของ Relations ลึก
- ปรับปรุง `getMoreCompletedOpportunities` ใน `src/lib/actions/completed-deals.ts` ยกเลิก heavy includes และหันมาใช้ `requirePipelineActor` ร่วมกับ `pipelineOpportunitySelect` ลด Network Payload ของแท็บ Completed มหาศาล
- ย้าย Pure logic functions (`checkIsRedCard`, `getRedThreshold`, `sortDeals`) มายัง `src/lib/pipeline-card-dto.ts` ทำให้ไม่ผูกติดกับ React/Prisma runtime และลดขนาด `KanbanCard.tsx` เพิ่มเติม
- เพิ่ม Unit Tests ใน `src/lib/pipeline-card-dto.test.ts` (3 tests)
- รัน `npm run verify:pipeline` ผ่านสมบูรณ์ **26/26 tests (216ms)** ด้วย 0 TypeScript errors
- ผ่านการตรวจสอบ Visual และ UI บน Browser ครบถ้วนทั้งแท็บ ACTIVE และ ARCHIVED

### Pillar 3: Operation-Based Mutation & Sync Contract (เสร็จสมบูรณ์ 100%)
- **Team Members Mutation**: เพิ่ม/ลบสมาชิกดีลแบบ Optimistic Paint (<10ms) พร้อม Granular Delta Rollback และ Server Revision (`useDealMembersMutation`)
- **Deal Accelerators & Badges Sync**: รวมศูนย์ SWR key `'pending-accelerators'` พร้อม Optimistic Clear (<10ms) เมื่อตอบคำถามครบ (`deal-accelerators-sync.ts`)
- **Deal Topic Inline Editing**: แก้ไขชื่อดีลทันทีทั้งบน Drawer Header และบนบอร์ด พร้อม Server Revision Concurrency และ Rollback เฉพาะ Topic (`deal-topic-sync.ts`)
- **Due Date Inline Mutation**: ใน `updateDueDateWithLog` เพิ่ม `revision` และ `mutationId` และใน `ActivityFeedTab.tsx` เพิ่ม Granular Rollback สำหรับ `opp.dueDate` ร่วมกับ `opp.activityLogs`
- **Granular Rollback for Delete Operations**:
  - สร้างโมดูล `src/lib/pipeline-delete-rollback.ts` สำหรับ Pure logic: `rollbackDeletedItem`, `rollbackDeletedPageItem`, `rollbackDueDate`
  - ใน `NotesTab.tsx`: เลิกใช้การเขียนทับทั้งก้อนด้วย `previousNotes` และหันมาใช้ `rollbackDeletedItem` ทำให้ไม่ลบ Note ที่ผู้ใช้อื่นเพิ่งเพิ่มเข้ามา
  - ใน `EditDealPanel.tsx` (`handleDeleteSystemLog`): เลิกใช้ `previousPages` และใช้ `rollbackDeletedPageItem`
  - ใน `ActivityCommentItem.tsx` (`handleDelete`): เลิกใช้ `refresh()` และใช้ `rollbackDeletedPageItem`
- **Decoupled Deal Transfer Logging**: ปรับ `addSystemLog` ใน `handleTransfer` ให้ทำงานแบบ Background Asynchronous ทันที
- **Automated Testing Suite**: เพิ่ม `src/lib/pipeline-delete-rollback.test.ts` (4 tests) รวมเป็น **35 tests**
- รัน `npm run verify:pipeline` ผ่านสมบูรณ์ **35/35 tests (245ms)** ด้วย 0 TypeScript errors



