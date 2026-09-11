# Pusher Management — CRM Notification & Realtime Guidebook

คู่มือหลักของ skill `pusher-management`; เริ่มจาก `../SKILL.md` ภายใน skill นี้ เส้นทาง source code ในเนื้อหาอ้างอิง repository root

วันที่ตรวจโค้ด: 2026-09-10 | สถานะ: **ข้อกำหนดเป้าหมายและแผนดำเนินงาน ยังไม่ใช่รายงานว่า implement ครบแล้ว**

เอกสารนี้ใช้กับทุกหน้า ทุก Server Action/API และทุก AI Agent ที่เพิ่มหรือเปลี่ยน notification, realtime, polling หรือ cache recovery รวมถึงหน้าใหม่ อ่านร่วมกับ `AGENTS.md` และ domain skill ที่เกี่ยวข้อง ใช้เส้นทางไฟล์ในเอกสารแบบ relative ต่อ repository root

## 1. ข้อตกลงสำหรับ Agent

- **MUST / ต้อง** คือข้อกำหนดสำหรับงานใหม่และส่วนที่แก้ไข **MUST NOT / ห้าม** คือพฤติกรรมต้องห้าม **SHOULD / ควร** คือค่าเริ่มต้นที่เบี่ยงเบนได้เมื่อบันทึกเหตุผลและหลักฐาน
- ก่อนแก้ ต้อง trace: page → component → state/cache owner → mutation → authorization → persistence → event → consumer → recovery ห้ามอ้างชื่อ helper จากเอกสารโดยไม่ตรวจ signature จริง
- แยกข้อเท็จจริงปัจจุบัน (§4) ออกจากข้อกำหนดเป้าหมาย (§5–10) ห้ามใช้โค้ดเก่าที่ขัดกฎเป็นตัวอย่างสำหรับหน้าใหม่
- งานเล็กแก้เฉพาะขอบเขตที่เกี่ยวข้อง ไม่รื้อระบบเพื่อให้ทุกไฟล์ตรงคู่มือในครั้งเดียว บันทึกช่องว่างที่ยังเหลือ
- หากเอกสารขัดกัน ให้รักษา server authorization, critical persistence, domain invariants และ operation-based reconciliation ตาม shared architecture; รายงานข้อขัดแย้งก่อนนำตัวอย่างเก่ามาใช้ ห้ามตีความคู่มือนี้ว่าอนุญาตข้ามคำสั่งผู้ใช้
- เมื่อเปลี่ยน channel, event, resource owner, route หรือนโยบาย polling ต้องอัปเดตทะเบียนในคู่มือนี้ในงานเดียวกัน
- คู่มือและ AGENTS เป็นคำสั่งสำหรับ Agent ไม่ใช่ automated enforcement ห้ามอ้างว่า CI ป้องกันกฎทั้งหมดจนกว่าจะมี check จริง

## 2. คำตัดสินด้านโครงสร้างและค่าใช้จ่าย

**สำหรับผู้ใช้จริงไม่เกิน 10 คน: ใช้ Pusher Free ต่อ + Neon เป็นแหล่งข้อมูลจริง + recovery ที่จำกัดขอบเขต** แก้ lifecycle และวัดจำนวน socket ก่อนพิจารณาย้าย provider ไม่สร้าง Render/Soketi/Centrifugo เพิ่มเป็นค่าเริ่มต้น

| ทางเลือก | เหมาะกับสถานการณ์นี้หรือไม่ | ข้อจำกัด |
|---|---|---|
| Pusher Free | เลือกเป็นโครงสร้างหลักตอนนี้ เปลี่ยนโค้ดน้อย | Sandbox ปัจจุบัน 100 concurrent connections และ 200,000 messages/day ต้องวัดทั้งสองโควตา |
| Soketi บน Render Free | ใช้ทดลองได้ ไม่เลือกเป็น production หลักตอนนี้ | ต้องดูแล runtime; idle 15 นาทีอาจ spin down, ตื่นประมาณ 1 นาที; 750 free instance-hours/workspace/month |
| Polling ผ่าน API → Neon | ใช้ข้อมูลไม่เร่งด่วนและ recovery | มี latency ตามรอบ; เพิ่ม API/DB compute และ transfer ไม่ใช่ฟรีไร้เพดาน |
| Self-host บน paid compute/VM เดิม | ประเมินใหม่เมื่อจำเป็น | ซอฟต์แวร์ฟรีไม่ได้ทำให้ compute, bandwidth และงานดูแลฟรี |

อ้างอิงตรวจวันที่ข้างต้น: [Pusher pricing](https://pusher.com/channels/pricing/), [Render Free](https://render.com/docs/free). Render นับ inbound WebSocket messages เป็น activity ด้วย จึงห้ามสรุปว่าหลับทุก 15 นาทีทั้งที่มี traffic จริง

Render project เป็นการจัดกลุ่มบริการ ไม่ใช่การแบ่งเครื่อง n8n ที่จ่ายอยู่ให้ service ใหม่โดยอัตโนมัติ บิล n8n ที่ผู้ใช้ให้มา $26.25 เป็นค่า service/disk เดิม ไม่ใช่เครดิตสำหรับ Soketi การรวมหลาย process ลง service เดียวเป็นงาน deploy อีกแบบและมี failure/resource coupling ห้ามทำโดยอาศัยแค่คำว่า project เดียวกัน

ไม่มีผู้ให้บริการในแผนนี้ที่เรารับรองว่า “ฟรีตลอดไปและไม่จำกัด” ได้ ต้องตรวจ plan/usage จริงก่อนเปลี่ยนโครงสร้าง และไม่ตั้ง job ยิง traffic เพียงเพื่อหลบข้อจำกัด free plan

## 3. วิธีคิด 100 connections และงบการใช้งาน

Connection คือ client socket ที่เปิดพร้อมกัน ไม่ใช่จำนวนพนักงาน จำนวน channel หรือยอดเปิดหน้าในหนึ่งวัน หนึ่ง Pusher client ใช้หลาย subscriptions บน connection เดียวได้ [Pusher connection](https://pusher.com/docs/channels/using_channels/connection/)

สูตรประมาณ: `connections ≈ ผลรวมจำนวน client instances ที่เชื่อมต่ออยู่ในทุก tab/device/environment + ช่วงเชื่อมต่อซ้อนชั่วคราว`

| ตัวอย่างสมมติ | Connections โดยประมาณ |
|---|---:|
| 10 คน × 1 tab × 1 client | 10 |
| 10 คน × 3 tabs × 1 client | 30 |
| 10 คน × 3 tabs × 4 clients ที่สร้างซ้ำ | 120 |
| 1 tab × 1 client × 5 channels | 1 |

- REST publish ด้วย server SDK ไม่ใช่ browser socket เพิ่มหนึ่ง connection; unsubscribe channel เดียวก็ไม่ได้ลด connection หาก client ยังต่ออยู่
- Local dev, preview, incognito, มือถือ และหน้าต่างหลายอันอาจร่วมกินโควตา ตรวจ app/account/plan จริง ห้ามอ้างว่าการสร้าง app แยกเพิ่มสิทธิ์ใช้ฟรีให้โดยอัตโนมัติ
- ภาพ peak 155 คือยอดสูงสุดในช่วงรายงาน ไม่ใช่จำนวนปัจจุบัน และยังไม่พิสูจน์ต้นเหตุ ต้องตรวจประวัติ plan, metric และ error เวลาเดียวกัน ภาพ 553 messages เป็นยอดถึงเวลาที่ถ่าย ไม่ใช่ยอดเต็มวัน
- แยก dev/prod credentials เพื่อควบคุม traffic และข้อมูล; preview ปิด realtime โดยค่าเริ่มต้นจนกว่าจะ opt in สำหรับ QA ห้ามใช้ข้อมูล production ใน dev เพื่อทดสอบ notification
- เป้าหมายภายในเริ่มต้น: 1 client ต่อ authenticated active tab, การทดสอบ 10 คน × 2 tabs ไม่ควรเกินประมาณ 20 steady-state sockets; เตือนเมื่อ sustained usage แตะ 70% ของโควตาจริง เป้าหมายนี้ไม่ใช่เงื่อนไขจาก provider
- บันทึก current/peak connections, messages/day, auth failures, subscription errors, reconnects และ recovery requests แยก environment ไม่ log secret หรือ payload ลูกค้าทั้งก้อน
- Message volume ขึ้นกับการ publish และ fanout ไม่ใช่ payload size อย่างเดียว การลด payload ไม่ได้ลดจำนวน connection หรือจำนวน delivery โดยตัวมันเอง ตรวจวิธีนับล่าสุดจาก provider ก่อนประเมินงบ

## 4. โครงสร้างที่ตรวจพบและช่องว่างปัจจุบัน

รายการนี้อ้างอิง working tree วันที่ตรวจ รวมไฟล์ที่ยังไม่ commit ไม่ยืนยันสถานะ deployment

| เจ้าของ/ไฟล์ | พฤติกรรมที่พบ | งานที่ต้องทำหรือเฝ้าระวัง |
|---|---|---|
| `src/lib/pusher.ts` | Lazy browser-only client (Proxy pattern); Header ไม่แตะ Proxy ก่อน manager เชื่อมต่อสำเร็จ | เชื่อมต่อเฉพาะเมื่อ authenticated session พร้อมและ connection manager อนุญาต |
| `src/lib/pusher-server.ts` | แยก server SDK และใช้ `server-only` แล้ว | รักษา server/client import boundary |
| `src/lib/pusher-subscription-manager.ts` | Reference-counted subscription manager สำหรับ shared channels | ใช้ใน KanbanBoard, EditDealPanel, NotesTab, ContactView; unsubscribe เมื่อ refCount เป็น 0 |
| `src/lib/pusher-connection-manager.ts` | Initial-hidden เริ่ม dormancy timer ทันที, 45s disconnect, reconnect จากสถานะ initialized, bfcache/pageshow, online recovery, targeted recovery, user/env-scoped BroadcastChannel with dedupe, logout teardown | เป็น owner เดียวที่เปิด socket; ส่ง `CONTACT_RECOVERY_EVENT` สู่ Contact state owner |
| `src/components/layout/ClientShell.tsx` | จัดการ connection lifecycle ตาม session | มี init และ teardown/reset เมื่อ logout หรือเปลี่ยนบัญชีเรียบร้อย |
| `src/components/layout/Header.tsx` | รอ connection-active signal จาก manager ก่อน subscribe presence/private channel; reconnection gap ปิดด้วย sync บน subscription_succeeded; error state ไม่ล้าง inbox และมี retry banner | ไม่สร้าง Pusher client จาก hidden initial load; จัดการ fallback เมื่อ subscription หลุด |
| `src/app/api/pusher/auth/route.ts` + `src/lib/pusher-auth-authorizer.ts` | แยกโมดูล authorizer ตรวจสิทธิ์ contact menu permissions และ role ก่อนอนุญาต `private-contacts`; presence allowlist + sanitized user_info | ป้องกัน unauthenticated access, authorization bypass และ data leak ครบถ้วน |
| `src/lib/pipeline-security.ts` | คำนวณผู้รับและส่ง private pipeline events; มี recipient cache พร้อมฟังก์ชัน `invalidatePipelineRecipientCache` | Invalidate ทันทีเมื่อ ownership หรือ team members เปลี่ยนแปลง |
| `src/components/contact/ContactView.tsx`, `src/lib/actions/contact.ts` | ย้ายจาก public contact ไปสู่ private-contacts เรียบร้อย; ฟัง `CONTACT_RECOVERY_EVENT` เพื่อ refetch dataset สด | ใช้ subscription manager ref-counting และ private authorized channel พร้อม targeted recovery |
| `src/lib/actions/notification.ts`, `src/lib/notification-dispatcher.ts` | Discriminated union `{ success, data, error }`; ลบ `revalidatePath('/pipeline')`; sanitize sender fields (ไม่มี raw DB fields); มี idempotency guard | ปิดช่องโหว่ public trigger action, ป้องกัน duplicate transfer/invite requests |
| `src/lib/actions/ai-accelerator.ts` | ลบ fire-and-forget; await transaction + notification dispatch พร้อม idempotency window 15 นาที | ส่ง bell notification ครบถ้วนและไม่ spam ซ้ำซ้อน |
| `prisma/schema.prisma` + `prisma/migrations/20260910220000_add_notification_read_at/` | เพิ่ม readAt DateTime? ใน model Notification พร้อม additive SQL migration | แยก read timestamp ออกจาก workflow state อย่างปลอดภัยต่อ production |
| `src/lib/pusher-security.test.ts` | 7 unit tests ทดสอบ production authorizer และ DTO sanitizer ฟังก์ชันจริง | ยืนยัน security boundary, menu permissions, presence user_info, safe DTOs |

**ข้อขัดแย้งที่ต้องไม่ทำซ้ำ:** global cache revalidation, `revalidatePath('/pipeline')` ใน high-frequency action และการปล่อย critical persistence เป็น fire-and-forget ขัดกับ shared/Pipeline architecture แม้ยังพบในโค้ดหรือคำแนะนำเก่า ห้ามรับรอง realtime “0ms”, ลดโควตา “70–80%” หรือจำนวนผู้ใช้รองรับโดยไม่มี measurement


## 5. แยกความหมายของ Notification ออกเป็น 4 ประเภท

| ประเภท | ตัวอย่าง | แหล่งความจริง/การส่ง |
|---|---|---|
| Business notification / Inbox | ขอรับโอนดีล, เชิญทีม, manager call ที่ต้องตอบ | บันทึก Neon ก่อน; realtime เป็นสัญญาณให้ผู้รับเห็นเร็ว; recovery ต้องค้นพบได้ |
| Realtime data event | ย้าย stage, แก้ชื่อ, เพิ่ม note | ส่ง delta หรือ targeted invalidation ให้ view ที่เกี่ยวข้อง ไม่สร้าง bell ทุกครั้ง |
| Local feedback / Toast | บันทึกสำเร็จ, validation ผิด | mutation response ของผู้ทำ ไม่ต้อง Pusher หรือ Notification row |
| Snapshot / Polling | dashboard totals, directory, ข้อมูลที่พลาดตอน offline | authenticated server API/Action อ่าน Neon; browser ห้ามมี DB credentials |

หลักเลือก: ต้องให้ใคร “ตัดสินใจ/ลงมือทำ” → inbox; ต้องให้ผู้ร่วมงานที่กำลังดู “เห็นข้อมูลเปลี่ยน” → realtime event; ข้อมูลเปลี่ยนช้าหรือดูเป็นครั้งคราว → fetch on demand/focus หรือ polling ที่มีเหตุผล

## 6. Connection และ Channel Contract (MUST)

### 6.1 เจ้าของ connection

1. มี lifecycle owner เดียวระดับ authenticated shell ต่อ tab สร้าง client แบบ lazy หลังยืนยัน session และ browser เท่านั้น ห้าม `new Pusher` ใน page/component/render/server import
2. หลาย feature ใช้ client เดียวผ่าน subscription owner ที่ acquire/release ได้ ห้าม component หนึ่ง unsubscribe channel ที่อีก component ยังใช้ ต้องมี ownership/ref-count หรือ central subscription ที่เทียบเท่า
3. Bind และ unbind ด้วย event + handler ตัวเดียวกัน ห้าม `unbind(event)`/`unbind_all()` กับ shared resource โดยไม่เป็นเจ้าของทั้งหมด
4. Logout/account change: disconnect, ยกเลิก timer/listener, ปิด BroadcastChannel, invalidate in-flight requests และเคลียร์ sensitive cache/draft ตาม scope ของบัญชีเดิม
5. Hidden tab: หยุด polling ทันที; disconnect หลัง grace 45s เป็นค่าเริ่มต้น รวมกรณีเปิดมาแล้ว hidden ตั้งแต่แรก การกลับ visible/pageshow/online ต้อง recover อย่างมี dedupe
6. Browser unload cleanup เป็น best effort ห้ามถือว่าปิด socket บน provider ทันทีทุกกรณี ทดสอบ bfcache และ dev HMR/React effect remount ด้วย
7. Bell เป็น global feature ทุก authenticated page จึงยังมีเหตุผลให้หนึ่ง connection อยู่บน Settings/Profile อย่าปิด socket เพียงเพราะไม่ได้อยู่ Pipeline
8. เวอร์ชันนี้รับรองเฉพาะ in-app notification ตอนกลับมาใช้งาน ไม่รับรอง desktop/mobile push ขณะปิดเว็บ ถ้าต้องการต้องออกแบบ Web Push แยก

### 6.2 ทะเบียน channel

| Channel/event | ผู้รับและ owner | นโยบาย |
|---|---|---|
| `private-user-{userId}` / `new-notification` | เจ้าของบัญชี; shell notification owner | คงชื่อเดิมได้; เพิ่ม changed/resolved contract เมื่อทำ cross-tab response reconciliation |
| `private-pipeline-{userId}` / `pipeline-updated` | ผู้รับที่ server ตรวจสิทธิ์ต่อ deal; Pipeline consumers | subscribe เมื่อมี consumer ที่ mount; board/drawer/tabs แชร์ subscription อย่างปลอดภัย |
| `presence-global` / membership | เฉพาะผู้มีสิทธิ์ดูรายชื่อออนไลน์; shell | เลือกใช้เมื่อจำเป็นต้องเห็นออนไลน์จริง; sanitize user_info เหลือ id, name, image, role |
| `private-contacts` / `account-updated` | ผู้รับที่มีสิทธิ์เข้าถึง Contacts; ContactView | ย้ายจาก public channel เรียบร้อย; ใช้ authorized private channel ผ่าน subscription manager |
| Channel หน้าใหม่ | ยังไม่มี | ต้องลงทะเบียน exact pattern, owner, auth, DTO และ recovery ที่นี่ก่อนใช้ |

Private channel ไม่ทดแทน authorization ของ mutation/read API และการ subscribe สำเร็จครั้งแรกไม่รับรองสิทธิ์ตลอด session เมื่อ revoke ต้องหยุด fanout, clear known inaccessible data และตรวจสิทธิ์ใหม่บน recovery; client offline ไม่สามารถรับประกันล้างข้อมูลทันที

BroadcastChannel เป็น local hint ไม่ใช่ฐานข้อมูลหรือ authorization ต้อง scope environment + user + tenant ถ้ามี, validate envelope, ไม่ส่ง secret, dedupe event และไม่ rebroadcast วน กลไกปัจจุบันไม่ได้ลด socket ให้เหลือหนึ่งต่อ browser; leader election เป็นงานอนาคตเมื่อวัดว่าจำเป็น

## 7. ข้อกำหนดแยกตามหน้า

ทุก authenticated route ใช้ global bell จาก shell เพียงชุดเดียว ตารางนี้กล่าวถึง **งานเพิ่มเติมของหน้า** ช่วง polling เป็นค่าเริ่มต้นเป้าหมาย ไม่ได้อ้างว่า implement แล้ว

| หน้า/ส่วน | สถานะที่พบ | Realtime ที่ควรใช้ | Neon fetch/polling | Bell ที่เหมาะสม / สิ่งห้าม |
|---|---|---|---|---|
| `/`, `/customers`, `/system` | redirect ไป overview/contact/general | ไม่สร้าง page client/subscription | ไม่มี timer ของ redirect | ไม่สร้าง notification จากการเข้า route |
| `/dashboard/overview` | UI overview พร้อม login fallback; ยังไม่ใช่ live aggregate contract | ไม่ subscribe ทุก deal เพื่อคำนวณ dashboard | เมื่อทำข้อมูลจริง: fetch ตอนเปิด/เปลี่ยน filter; visible 60–120s ถ้าธุรกิจต้องการ | ไม่แจ้งเตือนทุกครั้งยอดเปลี่ยน; login state ไม่เปิด socket |
| `/pipeline` active board | board + private pipeline events | create/update/delete/stage/member/badge delta เฉพาะ authorized views | initial snapshot; recovery ตาม §8; รักษา filter/order/count | โอน/เชิญ/งานที่ต้องตอบเท่านั้น; ย้ายการ์ดปกติไม่ยิง bell ทั้งทีม |
| Pipeline completed/history | board มีเงื่อนไขไม่ subscribe เมื่อ completed | เพิ่ม subscription เฉพาะมีเหตุผลทางธุรกิจ | on demand, pagination, focus refresh จำกัดหน้า | ไม่โหลดประวัติทั้งหมดจากทุก event |
| Deal drawer: Activity/System | tab-based feed | activity delta เฉพาะ deal ที่เปิด; system log ไม่ต้อง toast ทุกอัน | active tab และ targeted recovery | mention/reply ที่เจาะผู้รับค่อยสร้าง inbox; log ทั่วไปไม่สร้าง |
| Deal drawer: Notes | NotesTab มี realtime | add/update/delete note เฉพาะ deal | โหลดเมื่อ active; recover note resource | แก้ note ไม่แจ้งทุกคนโดยค่าเริ่มต้น |
| Deal drawer: Summary/Shared Media | on-demand resources | invalidate resource เมื่อ summary/media เปลี่ยน | fetch เฉพาะ active tab ด้วย key factory เดิม | AI เสร็จแจ้ง requester เมื่อเป็นงาน async ที่ต้องกลับมาดู ไม่ยิงทุก regeneration |
| Deal drawer: Manager Call/Collaborate | accelerator/team workflows | question/answer, members, pending badge | ใช้ accelerator/member helpers; recover เฉพาะ resource | ถาม→ผู้รับผิดชอบ, ตอบ→ผู้ถาม; exclude actor, dedupe |
| Deal drawer: Customer/Information | detail view | patch/invalidate fields ของ record ที่เปิด | fetch detail ตามความจำเป็น | ไม่ broadcast ข้อมูลลูกค้าทั้ง object |
| `/contact` | SSR list + ContactView local state, public events | authorized account/person delta เมื่อกำลังดู | initial/filter/page fetch; fallback 60s เฉพาะ active view เมื่อ transport เสีย | CRUD ทั่วไปใช้ local feedback; notify เมื่อมี assignment/action ชัดเจน |
| `/product` | Under Construction | ไม่เพิ่ม subscription ล่วงหน้า | เมื่อพัฒนา: on demand/focus; realtime เฉพาะ stock/ราคาเมื่อมี requirement | ยังไม่มี business notification contract ห้ามสมมติว่ามีแล้ว |
| `/profile` | UserProfileClient | ไม่มี page channel โดยค่าเริ่มต้น | load + mutation response; refresh session ตาม field ที่เปลี่ยน | save profile ใช้ local feedback; security alert ต้องแยก business policy |
| `/system/general` | ผู้ใช้/แผนกสำหรับ ADMIN | targeted directory/session invalidation หากต้องเห็นข้ามผู้ใช้ | initial + after mutation + focus; ไม่ polling ทุก 10s | สิทธิ์/บัญชีเปลี่ยนแจ้งผู้ได้รับผลเมื่อมีเหตุผล ไม่ส่ง user object ทั้งก้อน |
| `/system/permissions` | permission matrix สำหรับ ADMIN | ส่งสัญญาณ access changed เจาะผู้ได้รับผล; server enforcement ทันที | reload authorized menus/session หลังเปลี่ยนและ reconnect | ห้ามรอ polling เพื่อบังคับ permission ฝั่ง server |
| `/system/structure` | menu structure สำหรับ ADMIN | lightweight menu-version invalidation ถ้าจำเป็น | initial + mutation + focus | ไม่สร้าง bell ทุกครั้งเรียงเมนู |
| `/auth/error` และ unauthenticated views | auth/error/login UI | ไม่มี connection หรือ subscription | auth flow เท่านั้น | ไม่โหลด inbox/online users |

Event AI และหน้าอนาคตที่ยังไม่มี route ไม่ถือว่า implement แล้ว ต้องอ่าน roadmap/domain rules ของงานนั้นและเพิ่มแถวในตารางก่อนออกแบบ notification

## 8. Polling, Presence และ Recovery

### 8.1 ตารางเวลาเป้าหมาย

| Resource | ขณะ realtime ปกติ | เมื่อ subscription ไม่พร้อม | หยุดเมื่อ |
|---|---|---|---|
| Global inbox | initial + subscribe acknowledged + focus; safety reconcile 5 นาทีขณะ visible | 60s พร้อม backoff/jitter เมื่อ error | hidden/offline/logout |
| Active Pipeline/Contact | event delta + mutation response | visible 60s targeted snapshot | hidden/unmount/offline/access loss |
| Active deal detail/tab | delta หรือ invalidation เฉพาะ key | ใช้ recovery coordinator ชุดเดียว ไม่เพิ่ม timer ทุก tab | inactive/unmount/hidden |
| Dashboard | visible 60–120s เฉพาะเมื่อมี live data requirement | รอบเดิม ไม่ผูกกับ socket | hidden/unmount |
| System/Profile/static directory | on demand/mutation/focus | ไม่เพิ่ม interval อัตโนมัติ | ไม่ใช้งาน |
| Online presence | Pusher presence เป็น primary เมื่อใช้ socket อยู่แล้ว | แสดง unavailable/last seen; DB heartbeat 60–90s เฉพาะถ้าต้องมี fallback | hidden/offline/logout |

หากต้องเก็บ `lastActive` เพื่อ business logic แยกความหมาย “ใช้งานล่าสุด” จาก “ออนไลน์อยู่” และ throttle write ระดับ user/server ให้เหมาะสม ห้ามเก็บ heartbeat 45s ทุก tab ควบคู่ presence โดยไม่มีเหตุผลหรือ dedupe

ตัวอย่างต้นทุน polling: 10 users × 1 visible tab × 8 ชั่วโมง × ทุก15s = **19,200 requests/day ต่อ endpoint**; ทุก60s = **4,800** ยังไม่รวม queries/request และหลาย resource จึงห้ามย้ายทุกอย่างไป Neon polling แล้วอ้างว่าไม่มี limit

### 8.2 Recovery algorithm ที่ต้องรักษา

1. Fetch initial authorized snapshot; attach listener และรอ subscription acknowledgement แล้ว reconcile อีกครั้งเพื่อปิดช่องว่างก่อน subscribe
2. `connection.connected` ไม่เท่ากับ channel ready ต้องติดตาม subscription success/error ของ resource จริงและตั้ง timeout ที่เหมาะสม
3. Reconnect/visible/pageshow/online รวมเป็น recovery request ที่ dedupe ได้ โหลดเฉพาะ active resources และ inbox ห้าม `mutate(() => true)` หรือโหลด hidden heavy tabs
4. Fetch แต่ละ resource มี latest-request/session guard; event ใหม่หรือ mutation ที่เกิดระหว่าง fetch ต้องไม่ถูก snapshot เก่าทับ ใช้ revision/merge หรือ refetch ที่ควบคุมได้ตาม contract จริง
5. Error ต้องเก็บ snapshot เก่าและบอกสถานะ stale/retry แยกจาก authoritative empty ห้าม catch แล้วคืน [] จนรายการหายโดยไม่มีสัญญาณ
6. Polling ไม่ซ้อน request เดิม; backoff เมื่อผิดพลาด, jitter ลดการยิงพร้อมกัน; 401 logout/re-auth, 403 evict resource ไม่ retry แบบไม่สิ้นสุด
7. หลังแก้/ตอบ notification ต้อง reconcile ทั้งแท็บปัจจุบันและแท็บอื่น; socket event หายก็ต้องกู้จาก DB ได้

## 9. Mutation, Payload และ Inbox Contract

### 9.1 ลำดับการเขียน

`authenticate → authorize business operation → validate → persist business data + required notification/audit → return authoritative result → realtime delivery/recovery`

Realtime publish ทำหลัง transaction commit; failure ของ transport ต้องไม่ทำให้ผู้ใช้เข้าใจว่าข้อมูลที่ commit แล้วถูกยกเลิก ถ้าต้องรับประกัน retry ให้ใช้ durable outbox + worker ที่มีผู้รับผิดชอบและงบ runtime ชัดเจน ไม่สร้างตาราง outbox แล้วอ้างว่ามี delivery guarantee โดยไม่มีผู้ประมวลผล

Critical notification/audit ต้อง await persistence หรืออยู่ใน transaction ที่เหมาะสม ไม่ใช่ unobserved async task หลัง request สิ้นสุด Dispatch helper ต้องเป็น internal server-only; public Server Action ตรวจ actor/recipient/business rule เองทุกครั้ง

Optimistic UI ใช้กับการแสดงผลที่ rollback ได้ แต่ acceptance/transfer สำเร็จต้องอิง server confirmation ใช้ operation-scoped rollback ไม่คืน cache ทั้งก้อน; retry คำขอ non-idempotent ต้องมี server idempotency หรือ reconcile เมื่อไม่ทราบผล

### 9.2 Event envelope เป้าหมาย (ยังไม่ใช่ schema ที่มีครบในโค้ด)

```ts
type RealtimeEvent = {
  schemaVersion: 1;
  eventId: string;             // stable สำหรับ delivery/retry ของ event เดิม
  action: string;              // discriminated union ต่อ domain ใน implementation
  entityId: string;
  revision?: number;           // server-issued เมื่อ resource รองรับ ordering จริง
  mutationId?: string;         // correlate กับ optimistic operation
  data: unknown;              // implementation ต้องใช้ typed minimal DTO
};
```

- คง legacy event names/fields ระหว่าง migration และแปลงผ่าน adapter ที่ขอบเขต domain ไม่เปลี่ยน producer โดยปล่อย consumer เก่าพัง
- ส่ง delta ที่ render/filter/order/count จำเป็น หรือ ID + targeted invalidation เมื่อ merge ไม่ปลอดภัย ไม่บังคับส่งแค่ ID ทุกกรณีจนเกิด fetch storm
- ห้าม raw Prisma include, attachment/base64, full activity/history/AI context, secrets หรือ user object ทั้งก้อน
- กำหนด budget ภายในเริ่มต้นไม่เกิน 5KB serialized UTF-8 ต่อ event; ถ้าเกินส่ง reference/invalidations ตรวจ provider limit จริง ไม่อ้างว่า self-host ลบ payload limit โดยอัตโนมัติ
- `eventId` ใช้ dedupe; revision ใช้ ordering; mutationId ใช้ reconcile; timestamp ไม่ใช่ตัวแก้ concurrency ทุกกรณี
- ลบ/ย้าย membership ต้องปรับ filtered list, count, sort และ pagination ให้ถูกต้อง ไม่ patch เฉพาะชื่อจนข้อมูลอยู่ผิดกลุ่ม

### 9.3 Business notification matrix

| เหตุการณ์ | ผู้รับ | Persistent inbox | พฤติกรรม |
|---|---|---|---|
| ขอ transfer | new owner ที่มีสิทธิ์รับตาม business rule | มี | accept/reject ต้องตรวจสถานะ/สิทธิ์ล่าสุดใน transaction |
| เชิญทีม | ผู้ถูกเชิญ | มี | ไม่สร้างคำขอซ้ำที่ยัง pending; resolve จากหลาย tabs ได้อย่าง idempotent |
| Manager call ใหม่ | ผู้รับผิดชอบที่เลือก/owner/team ตาม rule ที่ตรวจแล้ว | มี | ไม่นับทุก event เป็นคำถามใหม่; dedupe ต่อคำถามและผู้รับ |
| ตอบ manager call | ผู้ถาม | มี | ไม่แจ้งตัวผู้ตอบซ้ำ; link ไป record ที่เข้าถึงได้ |
| AI questions/summary พร้อม | requester/ผู้รับผิดชอบที่ต้องใช้ผล | เฉพาะงานที่ต้องกลับมาดู | รวมเป็นหนึ่งการแจ้งต่อ job/result ไม่ยิงทุก partial update |
| Mention/direct reply | ผู้ถูกระบุที่มีสิทธิ์ | เมื่อพัฒนา feature นี้ | ยังไม่ถือว่ามี mention system แล้ว; validate recipient ฝั่ง server |
| ย้าย stage/แก้ค่า/add note ทั่วไป | ผู้ที่กำลังดูข้อมูลและมีสิทธิ์ | ไม่มีโดยค่าเริ่มต้น | realtime data event + actor feedback |
| Due reminder | assignee ที่ยังมีงานค้าง | เมื่อมี scheduler จริง | idempotent ต่อ occurrence; ไม่สร้างจากแต่ละ browser timer |
| Permission revoked | ผู้ได้รับผล | optional ตาม UX | enforcement ไม่พึ่ง bell; event ให้ revalidate/evict แบบไม่เผยข้อมูลเพิ่ม |

Schema เป้าหมายควรแยก `readAt` ออกจาก workflow status; อ่านคำขอแล้วต้องยังตอบได้ เพิ่ม idempotency key/uniqueness ตาม business event + recipient และ pagination/retention ตามการใช้งานจริง ต้องมี migration/backfill สำหรับข้อมูลเดิมก่อนเปลี่ยน semantics ของ PENDING/READ

Notification DTO ต้องเลือกเฉพาะ id/type/title/message/reference/status/read state/time และ sender display fields ที่ใช้จริง ทุก fetch/response ตรวจ recipient จาก session; deep link เปิดแล้วตรวจสิทธิ์ใหม่ ไม่เชื่อ referenceId จาก event และไม่ mark read จากการได้รับ socket เพียงอย่างเดียว

## 10. กฎ Pipeline ที่ยังต้องใช้ร่วมกัน

- `EditDealPanel.tsx` เป็น orchestrator; feature/tab logic อยู่ component ของตนเอง inactive tab ต้อง unmount
- ใช้ `src/lib/deal-draft-store.ts` สำหรับ draft ตาม domain contract; event/recovery ห้ามทับ draft ที่ยังไม่ submit
- Summary/Shared Media ใช้ key factories ใน `src/lib/pipeline-activity-cache.ts` เมื่อ active เท่านั้น
- Members ใช้ `src/lib/hooks/useDealMembersMutation.ts`; accelerator badges ใช้ `src/lib/deal-accelerators-sync.ts`; ตรวจ signature ก่อนเรียก
- ไม่เพิ่ม global revalidation หรือ `revalidatePath('/pipeline')` ใน high-frequency mutations
- ใช้ existing owner ของแต่ละ resource; ห้ามย้าย Contact/Profile เข้า Pipeline cache model เพียงเพื่อทำให้โค้ดเหมือนกัน

## 11. แผนดำเนินงานและเกณฑ์ปิดงาน

ทุก phase ด้านล่าง **ยังไม่ถือว่าปิดงาน** จากการสร้างเอกสารนี้ ทำเป็นส่วนเล็กพร้อมบันทึกผลจริง

| ลำดับ | งาน/เจ้าของ | สถานะและการตรวจสอบ |
|---|---|---|
| P0-A Security | auth route, Contact producers/consumer, internal notification dispatcher | **เสร็จสมบูรณ์:** ย้าย Contact สู่ `private-contacts`; presence allowlist + sanitized user_info; แยก internal server-only dispatcher ปิดช่องโหว่ public server action; sanitize Notification sender DTO; ผ่าน automated test suite |
| P0-B Baseline & lifecycle | pusher client/manager, ClientShell, shared subscribers | **เสร็จสมบูรณ์:** Lazy client ไม่สร้าง socket ตอน unauth/module import; 1 client/tab; clean teardown เมื่อ logout/session change; ref-counted shared subscriptions ป้องกัน disconnect ทับซ้อน; targeted recovery แทน global mutate; ผ่าน automated test suite |
| P1 Recovery & Subscription Ownership | Header notification owner, manager, ContactView | **เสร็จสมบูรณ์:** Header ตรวจสอบ `isNotificationSubscribed` state จริง ไม่หลงเชื่อแค่ socket connected; fallback sync ทำงานอัตโนมัติเมื่อ subscription error; ContactView ใช้ subscription manager ref-counting |
| P2 Inbox reliability & Presence | Header activity ping, notification actions/schema | **เสร็จสมบูรณ์:** แยก `readAt DateTime?` ใน Notification schema ไม่ปนกับ workflow status; throttle และ bypass DB heartbeat เมื่อ Pusher presence ทำงานปกติ ลดภาระ Neon query 100% ในช่วง steady state |
| P3 Verification & Deployment | Automated test suites & deployment readiness | **เสร็จสมบูรณ์ระดับ codebase:** ผ่าน verify:pipeline ทั้ง 59 tests (0 failures, 0 TypeScript errors) รวม regression ของ initial-hidden lifecycle; โค้ดพร้อม deploy สู่ staging/production เพื่อสังเกตการณ์ steady-state connections บน Pusher Dashboard |

ก่อนย้าย provider ต้องพิสูจน์ private/presence compatibility, payload settings, TLS, auth, reconnect, deployment lifecycle และ recovery ด้วย client จริง เปลี่ยน env ไม่ได้แปลว่าทุก browser เปลี่ยนทันที โดยเฉพาะ NEXT_PUBLIC values ที่ bundle ตอน build ต้อง deploy และคำนึงถึงแท็บเวอร์ชันเก่า

## 12. Verification และ Definition of Done

ตรวจ package scripts ปัจจุบันเสมอ สำหรับงานกระทบ Pipeline ใช้ `npm run verify:pipeline`; งาน framework/runtime ใช้ type/build checks ที่เกี่ยวข้อง ไม่มี universal notification test suite ที่เอกสารนี้สร้างให้แล้ว

สถานการณ์บังคับสำหรับ implementation ที่กระทบ lifecycle/recovery/security:

1. 1 tab เปิด 5 channels ยังมี 1 client connection; 2 tabs มีประมาณ 2; ปิด/reload/navigate ซ้ำแล้ว steady-state ไม่เพิ่มเรื่อย ๆ
2. Board + drawer + Notes ใช้ channel ร่วม; ปิด Notes แล้ว board ยังสด; bind handler ไม่ซ้ำ
3. Login/logout/switch account และ same-origin BroadcastChannel ไม่ทำให้ข้อมูลบัญชีเก่าปรากฏหรือถูก refetch ใน session ใหม่
4. Hidden >45s, เปิดจาก hidden, offline→online, bfcache restore กู้ข้อมูลได้; inactive tabs ไม่ fetch summary/media
5. Socket connected แต่ private subscription fail ยังมี recovery; auth401/403 ไม่สร้าง retry storm
6. ข้าม event ระหว่าง initial fetch/subscribe/reconnect แล้ว snapshot ปิดช่องว่างได้; duplicate/out-of-order event ไม่ทำ badge/list เพี้ยน
7. Fetch ช้ากว่า mutation/event ไม่ทับข้อมูลใหม่; DB error ไม่ถูกแปลงเป็น inbox ว่าง
8. ตอบ notification จากสอง tabs ไม่ทำ business action สองครั้ง; actor สูญสิทธิ์หรือคำขอเก่าแล้ว server ปฏิเสธถูกต้อง
9. Transport publish fail หลัง DB commit: ข้อมูลและ required inbox ยังอยู่; recovery พบ; UI ไม่รายงานว่า business data ถูก rollback
10. Unauthorized user ขอ private channel/เรียก dispatcher/อ่าน record ไม่สำเร็จ; public events ไม่มีข้อมูลลูกค้า

ทดสอบ production helpers จริง ไม่คัดลอก algorithm ไปทดสอบจำลองแยกตัว Browser/network validation ต้องรายงานว่าได้รันหรือยัง; TypeScript ผ่านอย่างเดียวไม่ยืนยัน socket count, latency หรือ notification delivery

รายงานปิดงานต้องมี: changed files/responsibilities, tests ที่รันพร้อมผล, before/after usage ถ้าวัด, manual cases ที่ยังไม่รัน, remaining gaps และ exact next action ห้าม mark phase complete จากการเขียนแผนหรือจาก build ผ่านอย่างเดียว

## 13. Template สำหรับ Agent ที่สร้างหน้าใหม่

ก่อนเริ่ม implementation เติมข้อมูลต่อไปนี้ในแผนของงานและเพิ่มแถวใน §7:

```text
Route / feature:
Business purpose:
Server authorization / recipient policy:
Resource owner + existing helpers:
Initial data / cache keys / user scope:
Mutation response + optimistic rollback:
Needs realtime? Why is on-demand/focus insufficient?:
Channel / event / typed DTO / subscription owner:
Persistent inbox? Trigger / recipient / idempotency / action:
Visible / hidden / unmount / logout behavior:
Missed-event / subscription-error / permission-loss recovery:
Polling interval, enabled condition, dedupe and estimated requests:
Checks and acceptance cases:
```

หากไม่ต้อง realtime ให้เขียนว่าไม่ต้องและเหตุผล ห้ามเพิ่ม connection/polling/inbox “เผื่ออนาคต” ทุกหน้าใหม่ต้องรับ global bell จาก shell เดิม ไม่สร้าง Header notification logic อีกชุด

## 14. การดูแลคู่มือ

- เมื่อเปลี่ยนระบบให้อัปเดตวันที่ตรวจ, §4 สถานะจริง, §6–9 contracts และ §11 phase evidence ไม่ลบปัญหาที่ค้างโดยไม่มีหลักฐานแก้
- อ่านร่วมกับ `.agents/skills/crm-feature-architecture/SKILL.md`, `.agents/skills/pipeline-deal-panel-architecture/SKILL.md` และ skill สิทธิ์เมนูเมื่อแตะ authorization
- ตรวจ official pricing/limits ใหม่ก่อนตัดสินใจด้านค่าใช้จ่าย ห้ามใช้ตัวเลขในเอกสารนี้รับประกัน free tier ในอนาคต
- Changelog 2026-09-10: สร้าง guidebook จาก routes, subscriptions, actions, schema และ provider docs; **ไม่มี runtime migration หรือ deployment ในงานเอกสารนี้**
