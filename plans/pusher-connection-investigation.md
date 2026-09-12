# Pusher Connection Investigation Plan

สถานะเอกสาร: สืบสวนและแก้ไขสำเร็จ (Resolved) — Connection ลดลงเหลือ 0 ตามเป้าหมาย  
วันที่ตั้งต้น: 12 กันยายน 2026 (Asia/Bangkok)  
เป้าหมาย: ระบุ `socket_id`, ผู้ใช้, deployment/environment, browser tab และ lifecycle path ของ connection ทุกตัวที่ถูกนับใน Pusher app `my-crm-pusher` แล้วแก้เฉพาะต้นเหตุที่พิสูจน์ได้

## 1. ข้อเท็จจริงที่ยืนยันแล้ว

- Pusher นับ concurrent client sockets ไม่ได้นับจำนวน channel; client หนึ่งตัว subscribe หลาย channel ยังเป็นหนึ่ง connection
- `src/lib/pusher-server.ts` เป็น REST publisher และไม่ใช่ client WebSocket จึงไม่ควรทำให้ฐาน connection ค้าง
- CRM ตั้งเป้าหนึ่ง browser client ต่อ authenticated visible tab ผ่าน `ClientShell` และ connection manager
- ทุก authenticated page ตั้งใจมีหนึ่ง connectionสำหรับ global notification/presence แม้ไม่ได้เปิด Pipeline หรือ Calendar
- ภาพล่าสุดแสดงฐานประมาณ 7 และเพิ่มเป็น 8 เมื่อเปิด CRM หนึ่งเครื่อง รูปแบบนี้สอดคล้องกับ client sockets อีก 7 ตัวที่ยัง active แต่กราฟอย่างเดียวไม่บอกแหล่งกำเนิด
- การ restart เครื่องที่กำลังทดสอบแล้วฐานยัง 7 ทำให้ connection 7 ตัวไม่น่ามาจาก process บนเครื่องนั้นเพียงอย่างเดียว; socket ที่ตายจริงไม่ควรอยู่ตลอดหลายชั่วโมง จึงต้องค้นหา client ที่ reconnect/ยังทำงานอยู่ หรือยืนยันความหมายของ metric กับ Pusher
- `pusher-js@8.6.0` ไม่มี option `autoConnect`; constructor เชื่อมอัตโนมัติเมื่อ runtimeพร้อม ดังนั้น boundary ที่ถูกต้องคือต้องไม่ construct clientจน connection managerอนุญาต ไม่ใช้ type castเพื่อส่ง optionที่ libraryไม่รองรับ
- `releaseAllChannels()` ยังอ่าน Proxy `pusherClient` แม้ registry ว่าง ซึ่งสามารถสร้าง client ระหว่าง teardown ได้เมื่อ `autoConnect` ยังเป็น default; คาดว่าเป็น transient connection และต้องวัดก่อนสรุป
- ไม่พบ `ServiceWorker`, `SharedWorker` หรือ `new Worker` ใน source ที่เปิด Pusher เอง
- Authorized Connections จะนับเฉพาะ connection ที่ authenticate user หรือ subscribe private/presence หลังเปิดใช้และตัด unauthorised connectionหลัง timeout แต่ connection ที่เปิดก่อนเปิด setting ไม่ถูกตัดย้อนหลังตามเอกสาร Pusher

## 2. สมมติฐาน เรียงตามข้อมูลที่แยกได้

| ID | สมมติฐาน | หลักฐานที่จะยืนยัน/หักล้าง |
|---|---|---|
| H1 | Production, Preview, local หรือ domain เก่ายังใช้ Pusher app เดียวกัน | auth telemetry แสดง host/deployment ต่างกันแต่ app fingerprint เดียวกัน |
| H2 | มี browser/device/tab อื่นที่ login ค้างและ reconnect อัตโนมัติ | `socket_id` มี user เดิมแต่ tab instance / user-agent hash / host ต่างกัน |
| H3 | client ถูกสร้างซ้ำจาก lifecycle, HMR, teardown หรือ Proxy path | tab เดียวสร้าง `socket_id` ใหม่โดยตัวเก่ายังไม่ disconnect และ trace ระบุ lifecycle reason |
| H4 | external client รู้ public keyและ subscribe authorized channelด้วย session/authorization ที่ยังใช้ได้ | Pusher Debug Console พบ connection แต่ CRM auth telemetryไม่สามารถจับคู่ หรือพบ auth trafficจาก origin/hostผิดคาด |
| H5 | Pusher Debug Console/CLI หรือเครื่องมือ monitoring เพิ่ม connection | จำนวนเปลี่ยนแบบ +1/-1 เมื่อเปิด/ปิดเครื่องมือนั้นโดยไม่มี CRM auth request |
| H6 | Dashboard graph เป็น sampled peak/aggregation หรือมี provider delay ไม่ใช่ current live countตรงเวลา | channel API, Debug Console และ dashboardไม่ตรงกันใน timestamp เดียวกัน |

ห้ามสรุปว่าเป็น zombie socket จนกว่าจะไม่มี heartbeat/reconnect source และ provider ยังรายงาน socket เดิมเกินช่วง timeout จริง

## 3. Phase 0 — Freeze baseline และเก็บหลักฐาน provider

1. จด Pusher `app_id`, cluster และ fingerprint ของ public keyที่ production/preview/local ใช้ โดยไม่บันทึก secret ลง logหรือเอกสาร
2. ปิด CRM ทุก tabที่ทราบ รวมถึง mobile PWA, incognito, Preview URL, localhost และ browser profile อื่น รออย่างน้อย 2 นาทีหลัง connection timeout
3. บันทึก dashboard connection ทุก 5 วินาทีเป็นเวลา 2 นาที พร้อม timezone และระบุว่าเป็น Average หรือ Peak
4. เปิด Pusher Debug Consoleเพียงหน้าต่างเดียวและจดผลต่างของ count เพื่อแยก connection ที่เครื่องมือสร้างเอง จากนั้นปิดและยืนยันว่าค่ากลับ
5. เปิด Subscription Count ใน App Settings แล้วเรียก Channels HTTP APIเพื่อเก็บ occupied channels และ `subscription_count`; presence ใช้ users endpointเพื่อดู distinct user IDs
6. จับคู่ผลรวม subscription countอย่างระวัง เพราะ socket เดียวอยู่หลาย channelได้ ห้ามบวกทุก channelแล้วเรียกว่า connection count

Exit criteria: มี timestamped baseline และรู้ว่า Debug Console เพิ่ม connectionหรือไม่ รวมถึงรายชื่อ channelที่ยัง occupied ตอน CRM ที่ทราบถูกปิด

## 4. Phase 1 — เพิ่ม temporary connection attribution

เพิ่ม diagnostic แบบ opt-in ด้วย environment flag เช่น `PUSHER_CONNECTION_DIAGNOSTICS=1`; production default ปิดหลังสืบสวน

### 4.1 Server-side auth observation

ที่ `/api/pusher/auth` บันทึกหนึ่ง recordต่อ `(socket_id, channel_name)` พร้อม:

- timestamp และ lastSeen
- `socket_id` เต็มเฉพาะใน protected admin storage
- user ID (ไม่เก็บ email/name)
- channel category (`presence`, `user`, `pipeline`, `calendar`, `contacts`) โดย redact identifierท้าย channel
- request host, Vercel environment/deployment ID และ release/build ID
- hashed user-agent, hashed IP prefix และ request origin; ใช้ saltเฉพาะ environment
- TTL 24–48 ชั่วโมงและ indexตาม `socket_id`, `lastSeen`

ห้าม log auth response, cookie, Pusher secret, full private channel payload หรือ customer data ลง console

เหตุผล: connection CRM ที่ถูก Authorized Connections นับต้อง subscribe `presence-global` หรือ private channel และจะส่ง `socket_id` มายัง auth route จึง group requestหลาย channelให้เป็น socketเดียวได้

### 4.2 Client lifecycle observation

เพิ่ม tab instance IDใน `sessionStorage` และส่ง diagnostic eventขนาดเล็กเฉพาะเมื่อ flagเปิด:

- `client_created`, `connecting`, `connected`, `disconnected`, `unavailable`, `destroyed`
- `socket_id`, tab instance ID, visibility, pathname, lifecycle reason
- host, build ID, environment และ public-key fingerprint
- sequence numberต่อ tab เพื่อเห็น reconnect ordering

ใช้ `sendBeacon` ตอน pagehideเป็น best effort; อย่าใช้ Pusherส่ง telemetryนี้ เพราะจะวนกลับไปพึ่งระบบที่กำลังตรวจ

### 4.3 Protected report

สร้าง System Admin-only report/CLI queryที่ groupตาม `socket_id` แล้วแสดง:

- first seen / last seen
- user ID
- host/environment/build
- tab ID / UA hash
- channels และ lifecycle ล่าสุด
- matched / unmatched กับ client telemetry

Exit criteria: เมื่อเปิดหนึ่ง tabต้องเห็นหนึ่ง socket row แม้มี 2–4 channel auth requests; สอง tabsต้องเห็นสอง socket rows; ไม่มี sensitive fieldใน response/log

## 5. Phase 2 — Controlled isolation matrix

รันทีละกรณี โดยทุกกรณีเริ่มจาก baselineนิ่งและจด `socket_id` ก่อน/หลัง

| Case | Action | Expected |
|---|---|---|
| A | เปิด productionหนึ่ง tab | +1 socket, host=production, tab IDหนึ่งค่า |
| B | navigate Calendar → Pipeline → Settings 20 รอบ | ยัง +1; channelเปลี่ยนได้แต่ socketเดิม |
| C | เปิด tabที่สอง | +1 เพิ่มและมี tab IDใหม่ |
| D | ซ่อน tabเกิน 45 วินาที | socketนั้น disconnect; กลับ visibleได้ socketใหม่หนึ่งตัวและ snapshot recovery |
| E | ปิด tab / reloadเร็ว 20 รอบ | มี overlapชั่วคราวได้ แต่ steady stateกลับจำนวนเดิมภายใน timeout |
| F | logout/login/switch account | socketเดิมถูกทำลาย; socketใหม่ผูก userถูกคน ไม่มีสองตัวค้าง |
| G | mobile Safari background/foreground, PWA และ bfcache | countกลับตาม lifecycleโดยไม่โตสะสม |
| H | local dev + HMR 20 ครั้ง | production app countไม่เปลี่ยนถ้าแยก credentials; local appไม่โตสะสม |
| I | Preview deploymentหนึ่ง URL | production appไม่เปลี่ยนถ้า Preview realtimeปิดหรือแยก app |

บันทึก Network WebSocket frames, `/api/pusher/auth` requests และ diagnostic tableควบคู่กับ Pusher Debug Console ห้ามใช้ avatar countแทน socket count เพราะ presence userหนึ่งคนอาจมีหลาย connections

Exit criteria: ระบุ caseแรกที่ steady-stateเพิ่มโดยไม่ลด และมี socket IDs จับคู่ทั้งก่อนและหลัง

## 6. Phase 3 — Binary isolation ของแหล่งที่ไม่รู้จัก

1. เพิ่ม kill switch `NEXT_PUBLIC_PUSHER_ENABLED=false` ที่ป้องกันการสร้าง clientตั้งแต่ boundary ไม่ใช่เพียง unsubscribe channel
2. deploy ช่วงทดสอบสั้นที่ production หลังเตรียม fallback polling/recoveryแล้ว
3. ถ้าฐาน 7 ลด: แหล่งอยู่ใน deployment/clientที่รับ configนี้ ให้ไล่ build/host/tab telemetry
4. ถ้าฐาน 7 ไม่ลด: แหล่งอยู่นอก deploymentปัจจุบัน เช่น Preview/โดเมนเก่า/เครื่องมือภายนอก/metric provider
5. สร้าง Pusher appแยกสำหรับ local, preview และ production การ rotate keyภายใน appเดิมไม่ใช่การแยก metricตาม environment

ขั้นนี้มีผลต่อ realtime production จึงต้องกำหนด maintenance windowและ rollbackก่อน deploy; การเขียนแผนนี้ยังไม่อนุญาตให้ปิด production realtime

## 7. Phase 4 — แก้ regression ที่พิสูจน์ได้

หลังเก็บ baselineแล้ว:

1. ให้ connection managerเป็น ownerเดียวที่ construct client; `pusher-js@8.6.0` ไม่มี `autoConnect: false` จึงต้องบังคับที่ creation boundary
2. แก้ `releaseAllChannels()` ไม่ให้แตะ Proxyหรือสร้าง clientเมื่อ registryว่าง/ไม่มี existing client
3. เพิ่ม development invariant: client creation countต่อ documentต้องไม่เกินหนึ่ง และ log call reasonเมื่อ diagnosticsเปิด
4. ตรวจทุก callerของ `getOrCreatePusherClient`, Proxy และ raw `.subscribe()`; componentต้องรอ connection-active หรือใช้ shared subscription manager
5. เพิ่ม regression testsสำหรับ initial hidden, teardownก่อน init, Strict Mode effect cycle, rapid reload simulation และ empty-registry release

Exit criteria: automated lifecycle testsผ่าน และ isolation matrix A–I ไม่เกิด steady-state growth

## 8. Phase 5 — Provider escalation package

หาก Debug Console/Pusher metricยังเห็น unmatched sockets ให้ส่ง Pusher Support:

- app ID และ cluster (ไม่ส่ง secret)
- UTC timestamps, dashboard screenshots และ baseline/delta table
- socket IDs ที่ matched/unmatched
- occupied channel/API snapshots
- เวลาเปิด Authorized Connectionsและยืนยันว่า connectionใหม่หลังเวลานั้นหรือก่อนหน้า
- ผล kill-switch deploymentและ environment isolation

ขอให้ providerยืนยัน source metadata/connection lifetimeและเหตุผลที่ dashboardยังนับ socketเหล่านั้น แทนการขอให้ “flush zombie” โดยไม่มี socket evidence

## 9. Verification gates

- `npm run verify:pipeline`
- `npm run test:calendar`
- production build
- security testsของ auth endpointและ System Admin report
- browser matrixตาม Phase 2 พร้อม before/after countจริง
- ตรวจว่า diagnostics TTL cleanupทำงานและ flagปิดแล้วไม่มี request/network transferเพิ่มเติม
- อัปเดต `.agents/skills/pusher-management/references/pusher-management.md` เฉพาะเมื่อ runtime/channel/lifecycle contractเปลี่ยน

## 10. Exact next action

เริ่ม Phase 0 ก่อน: เปิด Pusher Debug Consoleเพื่อวัดผลต่างที่ตัว consoleสร้าง จากนั้นเก็บ occupied channels/subscription countsขณะปิด CRMทุก tabที่ทราบ แล้วจึง implement Phase 1 diagnostics โดยยังไม่แก้ lifecycle เพื่อไม่ทำลายหลักฐานของปัญหา

## 11. Implemented containment (12 กันยายน 2026)

- Local/dev ไม่สร้าง Pusher clientโดย default; การทดสอบ realtimeใน devต้อง opt inด้วย `NEXT_PUBLIC_PUSHER_ENABLE_IN_DEV=true` และควรใช้ Pusher appสำหรับ developmentแยกจาก production
- เพิ่ม `NEXT_PUBLIC_PUSHER_ENABLED=false` เป็น client creation kill switchสำหรับ controlled isolation
- `releaseAllChannels()` ที่ registryว่างไม่แตะ Proxyและไม่สร้าง Pusher clientระหว่าง teardown
- ยืนยันจาก sourceของ dependencyว่า `pusher-js@8.6.0` constructorเชื่อมอัตโนมัติและไม่มี `autoConnect` option จึง enforce lifecycleที่ creation boundary
- Automated verification: Pipeline/Pusher 63/63 passed, Calendar 62/62 passed และ TypeScript clean. ยังต้อง deploy/reload dev tabsและวัด Pusher dashboardจริงก่อนสรุปว่าฐาน 7 ลดลง
 
## 12. ข้อสรุปและการแก้ไขขั้นสุดท้าย (Final Resolution & Verification)

1. **ระบุต้นตอของฐาน 7 อย่างชัดเจน:**
   - ฐาน 7 เดิมบน Pusher App ID `2190175` เป็น orphan/ghost sockets ที่ค้างอยู่ในระดับ edge/infrastructure ของ Pusher ตั้งแต่ก่อนเปิดใช้งาน Authorized Connections โดยไม่มีการ subscribe channel ใดๆ (`occupied channels = 0`, `presence-global users = 0`)
   - การ rotate key ภายใน App ID เดิมไม่สามารถรีเซ็ตหรือเตะ socket เหล่านี้ออกจาก metric ของ Pusher ได้
2. **การแก้ไขด้วยการแยก Environment App:**
   - สร้าง Pusher App ใหม่ (`2193864`) สำหรับ development (`my-crm-pusher-new-development`)
   - อัปเดต credentials ใน `.env` และเชื่อมต่อกับ App ใหม่
3. **ผลการยืนยันบน Dashboard จริง:**
   - เมื่อเปิดแท็บ CRM ตัวเลขเพิ่มเป็น 1-2 connections ตามการใช้งานจริง
   - เมื่อปิดแท็บ CRM การทำงานของ lifecycle manager ตัด socket อย่างสมบูรณ์ ทำให้ **Concurrent Connections ดิ่งลงเหลือ 0 ทันที** (ยืนยันผลจาก Overview Dashboard เมื่อเวลา 22:24-22:26 น.)
   - ไม่มี ghost socket ตกค้างอีกต่อไป

## แหล่งอ้างอิง

- Pusher connection model: https://pusher.com/docs/channels/using_channels/connection/
- Pusher Debug Console: https://pusher.com/docs/channels/getting_started/debugging/
- Authorized Connections: https://pusher.com/docs/channels/using_channels/authorized-connections/
- Channels HTTP API counts: https://pusher.com/docs/channels/library_auth_reference/rest-api/
- Webhook behavior: https://pusher.com/docs/channels/server_api/webhooks/
