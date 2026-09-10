---
name: pusher-management
description: >
  Design and maintain CRM notifications, Pusher subscriptions, connection lifecycle,
  Neon polling, and cache recovery. Apply when changing these behaviors or creating
  a CRM page that needs a notification/realtime policy. Includes per-page contracts,
  quota planning, and the long-term implementation roadmap.
---

# Pusher Management

ใช้สำหรับออกแบบหรือแก้ notification, realtime, polling และ recovery ของ CRM
รวมถึงกำหนดนโยบายให้หน้าใหม่ อ่านร่วมกับ `AGENTS.md` และ domain skill ที่เกี่ยวข้อง

## คู่มือหลัก

อ่าน [pusher-management.md](references/pusher-management.md) ในส่วนที่เกี่ยวข้องก่อนแก้โค้ด:

- ทุกงาน: §1 ข้อตกลง, §4 สถานะจริง/ช่องว่าง และ §5 การแยก inbox/event/toast/snapshot
- หน้าใหม่: §6 channel ownership, §7 ตารางนโยบายหน้า และ §13 feature contract
- Connection/subscription: §3 วิธีนับโควตา, §6 lifecycle และ §8 recovery
- Notification/mutation: §9 persistence, payload, recipient และ inbox contract
- Pipeline/deal: §10 และ Pipeline architecture skill
- แผนระยะยาว/provider: §2, §3 และ §11; ตรวจราคาหรือข้อจำกัดล่าสุดก่อนตัดสินใจ
- ก่อนปิดงาน implementation: §12 verification และ §14 การดูแลคู่มือ

## ข้อกำหนดหลัก

- แยกสิ่งที่ implement แล้วออกจาก target requirements และ unfinished phases
- ใช้ client เดียวต่อ authenticated active tab; ห้ามสร้าง client แยกในแต่ละ component
- Subscription ที่แชร์กันต้องมี ownership และ cleanup ที่ไม่ตัด consumer อื่น
- ห้ามส่งข้อมูล CRM ที่เป็นส่วนตัวผ่าน public channel; ตรวจสิทธิ์ที่ server เสมอ
- Neon เป็นแหล่งความจริง; critical notification ต้อง persist อย่างเชื่อถือได้
  Pusher เป็นช่องส่ง realtime ไม่ใช่หลักประกันว่าผู้รับได้รับหรืออ่านแล้ว
- Recovery ต้องจำกัด resource และรักษา mutation/event ใหม่ ห้าม global cache revalidation
- ห้ามเพิ่ม polling, inbox หรือ realtime ให้หน้าใหม่โดยไม่มี business requirement
- เมื่อเปลี่ยน page/channel/event/polling contract ให้อัปเดตคู่มือหลักในงานเดียวกัน
  ไม่สร้างสำเนาคู่มืออีกชุด และไม่ถือว่าการแก้เอกสารทำให้ runtime เปลี่ยนแล้ว

ใช้ existing code และ signature จริงเป็นหลักฐาน เก็บขอบเขตงานตามคำขอผู้ใช้
ไม่ใช้ skill นี้เป็นเหตุให้รื้อระบบหรือ deploy โดยอัตโนมัติ
