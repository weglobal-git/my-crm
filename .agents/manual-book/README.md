# 📚 CRM Manual Book (คู่มือการใช้งานระบบ CRM)

> **เอกสารคู่มือการใช้งานระบบสำหรับ AI Agent และพนักงาน**  
> รวบรวมหลักการทำงาน, โครงสร้างสิทธิ์ (Roles & Departments), Flow การดำเนินงาน, กฎทางธุรกิจ (Business Rules) และคู่มือฟังก์ชันการใช้งานทุกส่วนของระบบ

---

## 📑 สารบัญรวม (Table of Contents)

### หมวดที่ 1: โครงสร้างพื้นฐานและระบบสิทธิ์ (Core Fundamentals & Permissions)

- [01-roles-and-departments.md](./01-roles-and-departments.md) — **บทบาทผู้ใช้และโครงสร้างแผนก**
  - บทบาทหลัก (User Roles): `ADMIN`, `MANAGEMENT`, `GENERAL`
  - โครงสร้างแผนก (Departments) และความสัมพันธ์กับผู้ใช้
  - ระดับสิทธิ์ความสัมพันธ์กับการ์ด: Deal Owner, Manager of Owner, Team Member, Viewer
- [02-menu-permissions.md](./02-menu-permissions.md) — **ระบบสิทธิ์เมนูระดับแผนก (Department Menu Permissions v2)**
  - กลไกการกำหนดสิทธิ์เปิด/ปิดเมนูตามแผนก
  - แมปปิ้งสิทธิ์ของ Pipeline (`information`, `collaborate`, `activity`, `notes`, `files`, `summary`)
  - ความปลอดภัยระดับ Backend (Server Actions Security & Access Enforcement)

---

### หมวดที่ 2: บอร์ดและการจัดการการ์ดงาน (Pipelines & Cards)

- [03-pipeline-and-card-types.md](./03-pipeline-and-card-types.md) — **บอร์ด Pipeline และประเภทของการ์ด**
  - มุมมองบอร์ด: Active Workspace Board vs Completed Projects (Archived View)
  - ประเภทการ์ด: `SALES_DEAL` (งานขาย) vs `INTERNAL_TASK` (งานภายใน)
  - ส่วนประกอบบนการ์ด (Card Anatomy): หัวข้อ, ผู้รับผิดชอบ, บริษัทลูกค้า, ไอคอนประเภท, นาฬิกา Timer Countdown, ป้ายแจ้งเตือนเร่งด่วน
  - การจัดวางความสูงคงที่ `h-[220px]` และ Responsive Layout บนทุกอุปกรณ์
- [04-search-and-filters.md](./04-search-and-filters.md) — **ระบบค้นหาและตัวกรองข้อมูล**
  - Search Box แบบขยายอัตโนมัติ (Expanding Search with Escape / Clear)
  - Manage & Filters Drawer (Floating Card กลางที่แชร์การทำงานทั้ง Desktop และ Mobile)
  - การกรองตาม Card Type และ Card Owner (คลิกเพื่อเลือก / คลิกซ้ำเพื่อ Unfilter)

---

### หมวดที่ 3: วงจรชีวิตการ์ดและการปิดดีล (Deal Actions & Lifecycle)

- [05-deal-actions-and-closing.md](./05-deal-actions-and-closing.md) — **Card Actions Drawer และการปิด/จัดการดีล**
  - **Close as Won (งานสำเร็จ)**:
    - กรณี `SALES_DEAL`: การตรวจสอบฟิลด์บังคับ (Total Value, Goods Loading Date, Invoice Number) พร้อมปุ่มทางลัดสลับไปยังหน้า Sale Deal เพื่อกรอกข้อมูล
    - กรณี `INTERNAL_TASK`: ปิดงานสำเร็จได้ทันทีในคลิกเดียว
  - **Close as Lost (งานไม่สำเร็จ / ยกเลิก)**:
    - บังคับระบุเหตุผลการปิด (Loss Reason)
    - การย้ายการ์ดเข้าคลัง Completed Projects
  - **Convert to Sale Deal (การอัปเกรดประเภทการ์ด)**:
    - เงื่อนไขผู้มีสิทธิ์ (Open, Internal Task, Owner/Manager/Admin, Department Permission)
    - ผลกระทบของการแปลงดีล (Irreversible Action)
  - **Deal Permanently Delete (การลบการ์ดถาวร)**:
    - Danger Zone และปุ่มยืนยันแบบ Checkbox ทรงกลม (Circular Checkbox)
    - สิทธิ์เฉพาะ Admin หรือ Owner ของการ์ด
    - ขอบเขตการลบข้อมูล (การ์ด, กิจกรรม, ไฟล์แนบ, คอมเมนต์)

---

### หมวดที่ 4: การทำงานร่วมกันและระบบแจ้งเตือน (Collaboration & Notifications)

- [06-team-collaboration.md](./06-team-collaboration.md) — **การทำงานร่วมกันในทีม**
  - การเชิญสมาชิกเข้าร่วมทีม (Invite Team Members Drawer)
  - การจัดกลุ่มตามแผนก (Collapsible Departments) และ Multi-select
  - การโอนสิทธิ์เจ้าของการ์ด (Deal Ownership Transfer Request & Approval)
- [07-notification-system.md](./07-notification-system.md) — **ระบบการแจ้งเตือนแบบเรียลไทม์**
  - Floating Drawer Card สำหรับ Notifications
  - การแจ้งเตือนคำขอโอนการ์ด และคำขอเชิญเข้าทีม พร้อมปุ่ม Accept / Reject แบบเรียลไทม์ (Pusher)
  - ตัวแสดงสถานะเวลาสัมพัทธ์ (Relative Timestamp)

---

### หมวดที่ 5: ปัญญาประดิษฐ์และระบบเร่งงาน (AI & Accelerators)

- [08-ai-summary-and-accelerators.md](./08-ai-summary-and-accelerators.md) — **ระบบ AI Summary และ Manager Call**
  - AI Deal Summary: สรุปความคืบหน้าการ์ดอัตโนมัติ พร้อมตรวจจับกิจกรรมใหม่ (Newer Activity Warning)
  - Manager Call (Accelerators): ระบบสร้างคำถามด่วนจากผู้จัดการถึงผู้ดูแลการ์ด
  - การตอบคำถามและการล้างสถานะแจ้งเตือนเร่งด่วน (Urgent Call Badge & Amber Alert)

---

### หมวดที่ 6: การออกแบบและการใช้งานในแต่ละอุปกรณ์ (Responsive Design & UX)

- [09-mobile-and-responsive-ux.md](./09-mobile-and-responsive-ux.md) — **มาตรฐาน UX บนมือถือและแท็บเล็ต**
  - โครงสร้าง 2 ส่วนหลัก: Main Navbar + Workspace Layout
  - Mobile Navbar Floating Active Column Pill (`[ To Do | 14 ]`)
  - Mobile Bottom Floating Navigation Bar (ปุ่มสลับคอลัมน์ `<` `>`, Find, Filters, Mobile Menu)
  - การปรับความกว้างการ์ดแบบ Responsive พอดีหน้าจอมือถือทุกขนาด (`w-full` พร้อม CSS Snap Carousel)
