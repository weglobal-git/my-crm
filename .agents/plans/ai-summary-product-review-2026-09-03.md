# AI Manager retirement & AI Summary product review

Date: 2026-09-03 · Status: Manager removed from source; Summary redesign PROPOSED, NOT IMPLEMENTED.

## ข้อสรุปสำหรับเจ้าของระบบ

ควรบันทึกทุกโพสต์เป็นข้อมูลต้นฉบับ แต่ไม่จำเป็นต้องเรียก LLM เพื่อเขียนใหม่ทุกโพสต์ หากเป้าหมายหลักคืออ่านงานย้อนหลัง ส่งต่องาน และถามเรื่องภายในการ์ด ผมเสนอให้ใช้ **สรุประดับการ์ดเมื่อผู้ใช้กด + ถามตอบพร้อมอ้างอิงข้อความต้นฉบับ** เป็นขั้นถัดไป ไม่ใช่กลับไปสร้าง AI Manager ทั้งบอร์ดอีกชื่อหนึ่ง

นี่เป็นข้อเสนอจากโค้ดและลักษณะงาน ไม่ใช่ผล A/B test ที่ยืนยันแล้วว่าแม่นยำหรือถูกกว่าทุกกรณี รอบนี้ยังไม่ได้เปลี่ยน trigger ของ Event Summary และไม่ได้เปิด/ปิด worker หรือเปลี่ยน policy/provider ของ Summary

## 1. งานที่ทำแล้วรอบนี้

- ถอด Manager launcher/floating chat, Server Action, orchestration/tools/registry/context/prompt/audit implementation และ tests เฉพาะ Manager
- ถอด Manager policy/prompt settings และ Server Actions ที่เกี่ยวข้องออกจาก AI Control Center
- ถอด imperative card-opener และ getPipelineCard ที่มีไว้เฉพาะ citation ของ Manager; การคลิกการ์ดตามปกติยังใช้ EditDealPanel เดิม
- เอา FEATURE_FLAG_AI_MANAGER ออกจาก local .env; ไม่แตะ secrets และ flag ของ Summary/Admin
- ย้าย authorization/visibility ที่ Summary ใช้ร่วมกันออกจากโฟลเดอร์ manager และแยก pricing helper ที่ Summary worker ยังต้องใช้
- แยก pure capability mapping ออกจาก runtime authorization เพื่อทดสอบได้โดยไม่เริ่ม Prisma/Pusher clients
- คง Summary UI, revisions, facts, event ledger, outbox, provider/encryption, budgets และ circuit breaker
- **ไม่ได้ลบ DB rows, schema models/enums หรือ migrations ที่มีประวัติใช้งานแล้ว** เช่น AI_MANAGER, AIManagerToolCallAudit, managerPrompt เพราะต้องเก็บ audit/usage เดิมและไม่ rewrite migration history
- ไม่ apply migration, ไม่แก้ Neon Main, ไม่ commit

Recovery archive ก่อนถอด source (ไม่มี .env): `/Users/light/Documents/Codex/2026-09-01/c/ai-manager-removed-2026-09-03.tar.gz`

ถ้าต้องคืนบางส่วน ให้แตก archive ไปโฟลเดอร์ชั่วคราวและตรวจ diff ก่อน ห้ามทับ worktree ทั้งชุด งานก่อนหน้าจำนวนมากยังไม่ได้ commit และเป็นของผู้ใช้

## 2. AI Manager ที่มีอยู่ให้ประโยชน์จำกัดเพราะอะไร

จาก implementation ก่อนถอด ระบบเลือก context ผ่านกฎ/keyword และเครื่องมืออ่านข้อมูลจำนวนจำกัด แล้วให้โมเดลเรียบเรียงคำตอบ ดังนั้นคำถามที่เป็นแค่ overdue, stage, owner, sort หรือ filter ยังตอบด้วย code ได้ตรงกว่า ถูกกว่า และตรวจสอบง่ายกว่า การเพิ่ม chat UI ไม่ได้สร้างความสามารถวิเคราะห์ใหม่โดยตัวมันเอง

AI ควรรับงานที่ code ธรรมดาทำได้ยากกว่า เช่น เชื่อมข้อเสนอหลายครั้งกับคำตอบลูกค้า อธิบายว่าการตัดสินใจเปลี่ยนเพราะข้อความไหน หรือช่วยคนรับช่วงงานอ่านบทสนทนายาว แต่ต้องมีหลักฐานที่ครบและได้รับอนุญาต ไม่ใช่ให้อ่านข้อมูลน้อยแล้วคาดเดา

## 3. สิ่งที่ Summary ทำจริงในโค้ดปัจจุบัน

| เรื่อง | หลักฐานจาก source | ความหมาย |
|---|---|---|
| โพสต์/ตอบกลับ | `actions/opportunity.ts:addActivityLog` → `createActivityCommand` → outbox ตาม feature flags | เป็นการประมวลผลระดับ event ไม่ใช่ whole-card summary |
| แยก AI ออกจากการโพสต์ | `ai/dispatch.ts` ใช้ `after()` เรียก worker เมื่อ flag เปิด | ผู้ใช้ไม่ต้องรอ LLM แต่ AI ยังมีค่าใช้จ่ายภายหลัง และเส้นทางโพสต์ยังมี DB/notification/Pusher ของมันเอง |
| Context ที่ส่ง | `ai/context-builder.ts` อ่าน event, activity revision, actor และ deal topic/type/status | ไม่ได้โหลดบทสนทนาทั้งการ์ด หรือ parent reply มาแก้ความกำกวม |
| สรุปและ facts | `ai/prompts/event-summarizer.ts`, `ai/processor.ts` | โมเดลคืน summary/type/importance/confidence/nextActions/blockers/facts ในรอบเดียว |
| ข้อความไม่ชัด | prompt ให้ตั้ง needsContext; processor บันทึก NEEDS_REVIEW | ไม่ได้ไปค้นบริบทเพิ่มโดยอัตโนมัติ |
| System/audit | `event-ledger/contracts.ts` แยก AI_SUMMARY/AUDIT_ONLY; `addSystemLog` ไม่เข้าทาง createActivityCommand | ไม่ใช่ว่าทุก system log เรียก AI; structured event บางชนิดถูกจัดเป็น AI_SUMMARY แต่ต้องตรวจ runtime producer ของแต่ละชนิดแยกกัน |
| Hash | hashActivityContent + buildEventSummaryDedupeKey | dedupe งานตาม domainEventId/prompt/schema; **ไม่ใช่** กันข้อความเหมือนกันที่โพสต์คนละ event |
| Blank/emoji/ack/batching | ไม่พบ semantic gate หรือ short-window batching ใน addActivityLog → ledger → processor ที่ตรวจ | UI อาจกันข้อความว่าง แต่เส้นทาง server นี้ไม่ควรถูกอ้างว่ามีตัวกรอง AI ครบแล้ว |
| Output cap | ส่ง policy.maxOutputTokens ให้ adapter | มี output cap; ไม่พบการบังคับ input token cap ก่อนส่งใน worker นี้ |
| Budget | worker ใช้ BudgetService(EVENT_SUMMARIZER) และ perRunCostLimitMicros | มีระบบ budget แต่ daily/monthly มาจาก defaults ของ service; อย่าอ้างว่าอ่านทุก limit จาก active policy แล้ว |
| Timeline | `ai/timeline.ts` compose events/facts ด้วย code | ไม่ต้องเรียก AI เพิ่มเพื่อจัดหัวข้อวันที่ แต่เป็นการประกอบข้อความ ไม่ใช่การสังเคราะห์เรื่องราวใหม่ |
| UI coverage | `getDealAISummaries` default 60 วัน; query สูงสุด 100 แล้วกรอง scope/คืนสูงสุด 50 | สิ่งที่เห็นไม่ใช่ประวัติทั้งหมดของการ์ด และการ์ดเก่าที่ไม่เคยเข้า ledger อาจไม่มี summary |

ความแม่นยำไม่ได้เพิ่มเพราะแปลงไทยเป็นอังกฤษ หรือเปลี่ยนรูปประโยคให้ดูเป็นระบบเสมอไป ตัวอย่าง “ลูกค้าโอนมาแล้ว 500,000 คงเหลือ 90,288 บาท” มีข้อมูลชัดอยู่แล้ว การเขียนใหม่แทบไม่เพิ่มสาระ คุณค่าที่มากกว่าคือเชื่อมว่าเกี่ยวกับใบเสนอราคาไหน จ่ายส่วนใด และงานที่ค้างคืออะไร **เมื่อหลักฐานมีจริงเท่านั้น**

ต้องแยก “ผู้ใช้บันทึกว่าจ่ายแล้ว” ออกจาก “ระบบบัญชียืนยันรับเงินแล้ว” ห้ามยกระดับข้อความในโน้ตเป็นธุรกรรมการเงินที่ตรวจสอบแล้ว

## 4. ข้อบกพร่องที่ตรวจพบ — ยังไม่ได้แก้ในรอบถอด Manager

รายการนี้เป็น code-level findings ไม่ใช่การโจมตีระบบจริง และไม่ใช่ full security/concurrency audit

### P0: ห้ามรับ actor/role จากผู้เรียก Server Action

`src/lib/actions/ai-events.ts` เป็น `use server` แต่ getDealAISummaries/getDealAITimeline/getDealAIContextBenchmark และ correctDealAISummary รับ actorOverride จาก args ได้ จากนั้นส่งเข้า requireOpportunityAccess ซึ่งยอมรับ actor แทน session; role ADMIN ข้ามข้อจำกัดบางส่วนใน pipeline-security.ts

ต้องย้าย test injection ไป internal non-action service และให้ทุก public action derive actor จาก authenticated server session เท่านั้น พบ pattern เดียวกันใน deleteActivityLog ของ opportunity.ts ด้วย จึงต้องตรวจ public action boundaries ให้ครบ ไม่แก้เฉพาะ UI

### P1: การอ่าน/แก้ Summary และ Facts ใช้ scope ไม่เท่ากัน

- correctDealAISummary เช็ค deal access แต่ไม่ได้บังคับ AI_MEMORY และ requiredCapabilities ของ revision เหมือน read path
- getDealAIContextBenchmark อ่าน ACTIVE facts โดยไม่กรอง requiredCapabilities แล้วคืน context; แม้ caller ผ่าน AI_MEMORY ก็อาจไม่มีสิทธิ์ดู fact ทุกประเภท
- ต้องตรวจสิทธิ์ก่อน retrieval และก่อนคืนผล/เขียนข้อมูล รวมถึงกรณีสิทธิ์เปลี่ยนระหว่างงาน

### P1: แก้โพสต์แล้ว Summary อาจไม่เปลี่ยน

editActivityLog ยังใช้ prisma.activityLog.update ตรง ๆ ไม่ผ่าน editActivityCommand เพื่อสร้าง immutable source revision/event และไม่ invalidate summary/facts ในเส้นทางนี้ การมี helper และ tests อยู่ไม่ได้แปลว่า UI action ใช้จริงแล้ว ต้องต่อ runtime path และทดสอบ end-to-end

### P1: สถานะสำเร็จ การคิดเงิน และ Pusher ต้องแยกขอบเขต

processor commit Summary/outbox COMPLETED ก่อน reconcile usage และส่ง Pusher แต่ catch ชั้นนอกครอบทุกอย่าง ถ้า Pusher ล้มเหลวหลังบันทึกสำเร็จ อาจเปลี่ยน AgentRun เป็น FAILED/DEAD และจัดการ reservation/circuit เหมือน provider ล้มเหลว ทั้งที่ Summary บันทึกแล้ว

Validation failure หลัง provider ตอบยังเกิดค่าใช้จ่าย แต่เส้นทางปัจจุบัน reconcile หลัง validate/writeback จึงเสี่ยงไม่นับ usage ของคำตอบที่ใช้ไม่ได้ ต้องบันทึก provider attempt usage แม้ output invalid/commit fail และ retry การแจ้งเตือนแยกจากการเรียก LLM

### P1: Input budget และ source lifecycle ก่อนส่ง AI

- worker ไม่ enforce input cap ก่อน adapter call; per-run reservation ไม่ใช่ hard cap ของค่าใช้จ่ายจริงหาก input ไม่ bounded
- existingEvent check อยู่หลัง provider call; retry ที่งานสำเร็จไปแล้วจึงอาจเสีย tokens อีกรอบ
- ต้องตรวจ source deleted/stale ก่อน dispatch และก่อน writeback ไม่เช่นนั้น immutable revision ของโพสต์ที่ถูกลบอาจถูกนำมาสร้างสรุปใหม่ภายหลัง ตรวจ deletion/race ทั้ง post/reply subtree เป็น integration test ไม่อนุมานว่าปลอดภัยจาก soft-delete อย่างเดียว
- HALF_OPEN probe gating ของ circuit ยังต้อง audit ว่า worker ใช้จริง ไม่ใช่ดูแต่ unit test ของ class

### P2: ตัวเลข confidence/token saving อาจชวนเข้าใจผิด

- Confidence 100% เป็นค่าที่โมเดลรายงาน ไม่ใช่อัตราความถูกต้องที่วัดจริง และ human correction ปัจจุบันยังคัดลอกค่าเดิมมา
- Benchmark เปรียบ raw สูงสุด 500 รายการกับ summary สูงสุด 50 + facts ไม่รับประกัน coverage เท่ากัน จึงยังสรุปว่าประหยัดโดยไม่เสียข้อมูลไม่ได้
- char/4 เป็น estimate โดยเฉพาะข้อความไทย ไม่ใช่ provider billing token count

## 5. ควรให้ AI จดทุกโพสต์หรือไม่

แยก 3 หน้าที่ออกจากกัน:

1. **บันทึกเหตุการณ์:** DB ทำทุกครั้ง พร้อม actor/date/revision/thread และการลบตามนโยบายเก็บข้อมูล ไม่ต้องใช้ LLM
2. **แสดงข้อมูลแน่นอน:** stage, due date, owner, ยอดจาก structured fields ใช้ query/code ไม่ต้องใช้ LLM
3. **ตีความหลายข้อความ:** สรุปเหตุผล การตัดสินใจ ลำดับเปลี่ยนแปลง ข้อตกลง/อุปสรรค ใช้ LLM เมื่อคนต้องการอ่านหรือมี workflow ที่ได้ประโยชน์จริง

การสรุปทุกโพสต์เหมาะเมื่อมี downstream automation ที่ต้องเข้าใจทุก event เช่นแจ้งเตือนความเสี่ยงภายใน SLA หรือมีคนถาม history เดิมซ้ำมากจน precomputed facts คุ้มค่า แต่ขณะนี้ยังไม่มีหลักฐานว่าการใช้ขององค์กรต้องการสิ่งนี้ทุก event

ข้อเสียของสรุปทุกโพสต์: มี prompt/output overhead ซ้ำ, ข้อความสั้นอาจยาวกว่าเดิมเมื่อเป็น JSON, บริบท reply หาย, ต้องดูแล edit/delete/correction/concurrency เพิ่ม และข้อสรุปคลาดเคลื่อนสะสมเป็น memory

อย่าทิ้ง raw “ครับ/โอเค” โดยมองว่าไม่มีสาระเสมอ: ใน reply ที่ตอบคำถามอนุมัติ อาจเป็นหลักฐานสำคัญได้ การประหยัดควรข้ามการเรียก LLM แยกโพสต์นั้น แต่ยังเก็บข้อความและ thread ให้ summary ระดับการ์ดอ่านได้

## 6. UX และ flow ที่เสนอ (ยังไม่สร้าง)

```text
โพสต์/แก้ไข/ลบ → บันทึก revision + เพิ่ม dataVersion → mark summary stale
                                                     (ไม่เรียก LLM)

ผู้ใช้กด AI Summary → ตรวจสิทธิ์ปัจจุบัน → หา cache รุ่น/ขอบเขตเดียวกัน
                                           ├─ พบ → แสดงผลเดิม
                                           └─ ไม่พบ → bounded context → queued generation
                                                       → validate sources → save revision
                                                       → targeted realtime update

ถามต่อในหน้าการ์ด → retrieve หลักฐานต้นฉบับที่เกี่ยวข้อง → ตอบพร้อม citation
```

ใน EditDealPanel ใช้แท็บ AI Summary เดิมได้ ภายในมี Generate/Refresh summary และ Ask about this card ไม่ต้องมี chatbot ทั้งบอร์ด

ผลสรุปที่ควรได้:

- สถานะล่าสุดที่ทราบและสรุปสั้น
- เหตุการณ์สำคัญแยกวันที่ พร้อมเหตุผล/แหล่งอ้างอิง
- สิ่งที่ตกลงแล้ว สิ่งที่เปลี่ยนแปลง และประเด็นที่ยังไม่ยืนยัน
- งานค้าง ผู้รับผิดชอบ/วันที่ ถ้ามีระบุจริง; คำแนะนำของ AI แยกจาก commitment ของคน
- ช่วงข้อมูล/จำนวนรายการที่อ่าน และ “as of” ที่ชัดเจน
- กด citation แล้วไปยังโพสต์ในการ์ดเดียวกัน ไม่เปิดแท็บใหม่

คำถามที่แสดงคุณค่ามากกว่า filter: “ลูกค้าเปลี่ยนสเปกอะไรบ้าง?”, “ทำไมงานยังไม่ไปต่อ?”, “ข้อเสนอรอบล่าสุดต่างจากเดิมตรงไหน?”, “มีหลักฐานว่าตกลงกำหนดส่งแล้วหรือยัง?” หากหลักฐานไม่พอต้องตอบว่าไม่พบ ไม่แต่งคำตอบ

ประวัติสั้นอ่าน raw ที่อยู่ในขอบเขตได้ครบ ประวัติยาวต้องใช้ bounded retrieval + chronology/source manifest และแจ้งส่วนที่ไม่ได้อ่าน ห้ามหยิบ 50 รายการล่าสุดแล้วเรียกว่า “สรุปทั้งการ์ด” การมี context window ยาวไม่ได้รับประกันใช้ข้อมูลทุกตำแหน่งได้ดี; งานวิจัยพบผลของตำแหน่งข้อมูลในบริบทยาว แต่ไม่ใช่ benchmark ของ Gemini รุ่นที่เราใช้อยู่ ([Lost in the Middle, TACL 2024](https://aclanthology.org/2024.tacl-1.9/))

## 7. Cache, permissions และ chronological correctness

- ใช้ result cache ใน DB ของแอป: dealId + source dataVersion/manifest + prompt/model version + permission-scope fingerprint/policy version + correction version
- ตรวจ current permissions ทุกครั้ง แม้ cache hit; ห้ามคืน summary ที่สร้างจากสิทธิ์ ADMIN ให้คนที่เห็นข้อมูลน้อยกว่า
- ใช้ unique job key และ in-flight claim รวมคำขอซ้ำ ไม่ให้ผู้ใช้ 10 คนเรียก LLM 10 รอบกับ snapshot เดียวกัน
- Update เพิ่ม version/mark stale ไม่รีบ generate; deletion/revocation ต้องระงับการคืนผลที่อ้างข้อมูลนั้นทันที ไม่แค่แปะป้าย stale
- ตอน worker เสร็จ ให้ตรวจ snapshot/version อีกครั้ง หากข้อมูลเปลี่ยนให้ถือว่าผลของ snapshot เก่า ไม่ publish เป็น latest
- Human correction เก็บ revision/provenance ไม่เอา AI รอบใหม่ทับเงียบ ๆ
- Q&A อ่าน raw evidence ที่ได้รับอนุญาต ไม่ใช้ summary เป็นแหล่งความจริงเพียงอย่างเดียว
- Claim references ต้อง resolve เป็น source IDs ที่ server ส่งจริง; ลำดับเวลาและตัวเลขสำคัญต้องทดสอบกับ golden dataset
- Provider context caching เป็นคนละเรื่องกับ result cache: ยังมีการ inference เมื่อถามใหม่ และมีเงื่อนไข cache hit/ขั้นต่ำตามบริการ จึงไม่ควรถือว่าใช้ฟรีทุกครั้ง ([Gemini context caching](https://ai.google.dev/gemini-api/docs/caching?hl=en))

## 8. ต้นทุน: อย่าวัดแค่จำนวน calls

```text
Per-event cost = จำนวน event ที่ประมวลผล × ต้นทุนเฉลี่ยต่อ event
On-demand cost = จำนวน summary cache miss × ต้นทุนอ่านการ์ด
               + จำนวนคำถามที่เรียก AI × ต้นทุน retrieval/answer
```

ตัวอย่างสมมติ 100 โพสต์ มีคนสรุปข้อมูลรุ่นใหม่ 5 ครั้ง และถาม 10 คำถาม: calls อาจลดจาก 100 เหลือ 15 แต่ **ไม่ได้แปลว่าประหยัด 85%** เพราะการสรุปทั้งการ์ดมี input มากกว่า การ์ดที่ถูกถามบ่อยมากอาจคุ้มกับ precompute มากกว่า

วัด provider-reported input/output/cached/thinking tokens ทุก attempt รวม error/retry พร้อม latency และ “ต้นทุนต่อคำตอบที่มีประโยชน์” Cache hit ของแอปไม่เสีย LLM tokens แต่ DB/request transfer ยังไม่เป็นศูนย์ รอบนี้ไม่มีการเรียก paid provider เพื่อทำ benchmark จึงไม่มี before/after cost หรือ latency จริงของ design ใหม่

## 9. ลำดับงานถัดไปที่เสนอให้อนุมัติ

1. แก้ security boundaries และ source edit/delete consistency ก่อน เพื่อไม่ต่อยอดบนข้อมูลที่ล้าสมัยหรือสิทธิ์รั่ว
2. แยก usage/writeback/notification failure และ enforce input/output/worst-case admission ก่อนเปิดใช้งานกว้าง
3. เก็บชุดทดสอบ 10–20 การ์ดที่ได้รับอนุญาต ครอบคลุมหลายแผนก มี reply/แก้/ลบ/ขัดแย้ง พร้อมคำถามและหลักฐานคำตอบที่คนตรวจแล้ว
4. สร้าง on-demand summary รุ่นเล็กก่อน: permission-aware result cache, source citations, as-of/coverage และ Refresh ชัดเจน ใช้ gateway/encryption/budget/outbox เดิมได้หลังแก้ safety ไม่ต้องเริ่มโครง Agent ใหม่
5. ทดสอบ goldens: source-backed claims, temporal order, omission, unsupported answers, payment/approval distinctions, permission change, duplicate concurrent request, edit/delete during generation, human correction และ failure usage
6. วัด cold generation/cache hit p50/p95, encoded bytes/request, actual cost และคนอ่านงานได้เร็วขึ้นหรือไม่ ไม่ใช้ความยาวคำตอบหรือ confidence เป็น quality score
7. เพิ่ม Q&A เฉพาะการ์ดเมื่อ summary useful แล้ว จากนั้นจึงพิจารณาเปลี่ยน automatic per-event เป็น on-demand; ขณะ cutover ต้องกำหนดว่าจะ drain/cancel งานเก่าอย่างไรโดยเก็บ audit ไม่ปิด raw ledger

ไม่อนุมัติ Phase 7 ต่อจากบันทึกเก่าโดยอัตโนมัติ เจ้าของผลิตภัณฑ์เลือกพัก/ถอด Manager แล้ว

## 10. Verification รอบถอด Manager

- TypeScript `tsc --noEmit`: passed
- Pure shared capability/visibility/pricing + existing timeline tests: 8/8 passed; ไม่มี DB writes หรือ provider calls ใน suite นี้
- Scoped ESLint สำหรับ extracted shared modules/tests, PipelineView และ Pipeline page: passed
- `git diff --check`: passed
- Source scan ไม่พบ Manager runtime imports/entrypoints ใน src TS/TSX; historical schema/migrations/docs deliberately retained
- Browser skill ใช้ตรวจจริง: Pipeline ไม่มีปุ่ม AI Manager; เปิด Keratin Treatment → AI Summary แสดง persisted payment summary revision 2 และปุ่ม correction; ไม่ได้กดบันทึก/แก้/เรียก provider
- Settings AI Control Center ยังมี shared provider/operations UI และไม่มี Manager settings; ไม่ทดสอบการเปลี่ยน config/keys
- ไม่ได้รัน production build ใหม่ในรอบถอดนี้ ไม่ใช่ production performance benchmark และไม่ได้ยืนยัน server-side action manifests ของ deployment เก่าหมดอายุแล้ว ต้อง rebuild/redeploy release ก่อนถือว่า Manager ถูกถอดจาก production
- การทดสอบชุดแรกนำ runtime auth มา import แล้วเปิด long-lived dependencies จึงหยุดชุดนั้นและแยก pure capabilities; rerun ผ่านทั้งหมดตามข้างต้น

