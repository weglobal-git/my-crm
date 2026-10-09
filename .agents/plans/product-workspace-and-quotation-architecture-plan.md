# Product Workspace & Quotation Architecture Plan

> **Status:** APPROVED FOR IMPLEMENTATION  
> **Target Date:** 2026-10-07  
> **Domain:** Product Catalog, Resource Workspace Architecture, B2B Quotation Engine  
> **Reference Specs:** `contact-action-performance-and-product-template-plan.md`, `crm-feature-architecture/SKILL.md`, `performance/SKILL.md`, `pusher-management/SKILL.md`

---

## 1. Executive Summary & Goals

ระบบจัดการสินค้า (`/product`) ถูกออกแบบขึ้นเพื่อเป็น **Resource Workspace มาตรฐานระดับพรีเมียม** สำหรับทีมขายและส่งออก (B2B Export) โดยนำสถาปัตยกรรมที่ผ่านการพิสูจน์แล้วจากหน้า **[`/contact`](file:///Users/light/my-crm/src/app/contact/page.tsx)** มาประยุกต์ใช้ พร้อมแก้ไขจุดอ่อนของโครงสร้างเดิมและวางรากฐานสู่ระบบ **ใบเสนอราคา (Quotation Engine)** อย่างสมบูรณ์แบบ

### 4 เสาหลักของแผนงาน (Core Pillars):
1. **UX/UI Parity with `/contact`**: หน้าจอธีม Dark Modern (`#252728`) แบ่ง 2 คอลัมน์ (Left Filter Sidebar + Right Card List) พร้อมแถบเครื่องมือ Toolbar, Status Tabs, และ Slide-over Drawer จากฝั่งขวา
2. **Speed & Latency Budget**: โหลดหน้าแรกทันทีแบบ 0ms flash ด้วย Server Preload, Intent Hover Prefetching, Split DTOs น้ำหนักเบา, และ Client Cache จัดการแบบ Operation-based (หลีกเลี่ยงการใช้ `revalidatePath` ที่ทำให้ทั้งหน้าช้าลง)
3. **2-Tier Database Architecture (`Product` + `ProductVariant`)**: แยกสินค้าหลัก (199 รายการ) ออกจากสูตร/สี/SKU (548 รายการ) จัดการปัญหา SKU ว่างและซ้ำซ้อนใน CSV อย่างเด็ดขาด
4. **Future-Proof Quotation Foundation**: วางรากฐานสำหรับระบบออกใบเสนอราคา B2B (Matrix/Grid bulk ordering, ระบบคำนวณ CBM/ตู้คอนเทนเนอร์ 20ft/40ft แบบ Realtime, และราคารายลูกค้า `CompanyPrice` 18 บริษัท)

---

## 2. การวิเคราะห์ข้อมูลและโครงสร้าง Database (`prisma/schema.prisma`)

### 2.1 ข้อมูลเชิงลึกจาก [`backup_old_code/csv/ Products.csv`](file:///Users/light/my-crm/backup_old_code/csv/%20Products.csv)
- **จำนวนแถวข้อมูลจริง**: 548 แถว
- **สินค้าหลัก (Parent Products)**: 199 สินค้า
- **สินค้าที่มีหลายสูตร/หลายสี (Multi-variants)**: 90 สินค้า (เช่น แชมพูปิดผมขาวมี 6 เฉดสี, ครีมฟอกสีผมมี 4 สูตร 3%, 6%, 9%, 12%)
- **สินค้าที่มีสูตรเดียว (Single variant)**: 109 สินค้า
- **ปัญหาข้อมูล SKU ใน CSV**: มีถึง **364 แถวที่ไม่มีรหัส SKU** และมี SKU ซ้ำกัน 2 รายการ (เช่น `HGFS-1000-06`, `SPCB-3000-09`) ดังนั้นฟิลด์ `sku` ต้องเป็น `String?` และห้ามบังคับ `@unique` ในระดับฐานข้อมูลแบบตรงๆ โดยไม่ทำ Fallback
- **ราคารายลูกค้า (Customer-specific prices)**: คอลัมน์ 39–56 มีราคารายลูกค้า 18 ราย (เช่น `Thuong Tin`, `Anna Trading`, `Namwhan`, ฯลฯ) ซึ่งตรงกับตาราง `Company` ในระบบ

### 2.2 โครงสร้าง Database Schema ที่ออกแบบ

```prisma
enum ProductStatus {
  AVAILABLE      // พร้อมจำหน่าย (Yes ใน CSV)
  UNAVAILABLE    // สินค้าหมดชั่วคราว (No ใน CSV)
  DISCONTINUED   // เลิกผลิต
}

// -----------------------------------------------------------------------------
// 1. Parent Product (199 รายการ) - เก็บข้อมูลร่วมของสินค้า
// -----------------------------------------------------------------------------
model Product {
  id               String           @id @default(cuid())
  name             String           // ชื่อสินค้าหลัก เช่น Carebeau Milky Developer Cream (1000ml)
  brand            String?          // แบรนด์ เช่น Carebeau, Deya, Enjoy (มี 24 แบรนด์)
  category         String?          // หมวดหมู่ เช่น Hair Bleaching, Body Lotion (มี 27 หมวด)
  description      String?          @db.Text
  websiteUrl       String?          @db.Text
  status           ProductStatus    @default(AVAILABLE)

  // ข้อมูลลัง & การขนส่ง (แชร์ร่วมกันทุกสูตร)
  hsCode           String?          // รหัสพิกัดศุลกากรสำหรับส่งออก
  cartonDimension  String?          // ขนาดกล่อง เช่น 35x45x30 cm
  cartonWidth      Float?           // ความกว้าง (cm)
  cartonLength     Float?           // ความยาว (cm)
  cartonHeight     Float?           // ความสูง (cm)
  cbm              Float?           // ปริมาตร CBM ต่อกล่อง (ใช้คำนวณตู้ 20ft/40ft อัตโนมัติในระบบ)
  cartonQuantity   Int?             // จำนวนชิ้นต่อกล่อง (packing size)

  // บันทึกเพิ่มเติม
  remark           String?          @db.Text // Service Remark

  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  variants         ProductVariant[]

  // Indexes เพื่อความเร็วระดับมิลลิวินาทีในการค้นหาและฟิลเตอร์
  @@index([status])
  @@index([brand])
  @@index([category])
  @@index([status, brand, category])
  @@index([name])
}

// -----------------------------------------------------------------------------
// 2. Product Variant (548 รายการ) - เก็บสูตร/สี/SKU และราคาเฉพาะ
// -----------------------------------------------------------------------------
model ProductVariant {
  id                String          @id @default(cuid())
  productId         String
  product           Product         @relation(fields: [productId], references: [id], onDelete: Cascade)

  sku               String?         // รหัส SKU (เช่น HGEJ-1000-07)
  fullName          String          // ชื่อเต็ม เช่น Carebeau Milky Developer Cream (1000ml) - 3% Concentrate
  thaiName          String?         // ชื่อภาษาไทย (Thai-Description ใน CSV)
  formula           String?         // สูตร/ขนาด/สี เช่น 3% Concentrate, Natural Black
  imageUrl          String?         @db.Text // ลิงก์รูปภาพเฉพาะสูตร/สีนั้น

  // โครงสร้างราคาเฉพาะสูตร (Pricing Architecture - Streamlined)
  price             Float           @default(0) // ราคาขายมาตรฐาน (Export-Price)
  productCost       Float?          // ต้นทุนสินค้า (Cost)
  priceCondition    String?         @db.Text // เงื่อนไขส่วนลด เช่น สั่งกี่ลัง ลดกี่ % (รองรับหลาย step)

  // น้ำหนัก
  netWeight         Float?          // NW (น้ำหนักสุทธิ)
  cartonGrossWeight Float?          // CTN-GW (น้ำหนักรวมกล่อง)

  isDefault         Boolean         @default(false) // เป็น Variant ตัวหลักที่จะใช้แสดงรูปบนการ์ดหรือไม่
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  customPrices      CompanyPrice[]  // เชื่อมโยงราคารายลูกค้า (18 บริษัท)
  quotationItems    QuotationItem[] // รายการสินค้าในใบเสนอราคา

  @@index([productId])
  @@index([sku])
  @@index([formula])
}

// -----------------------------------------------------------------------------
// 3. Company Price (ราคารายลูกค้า ผูกระดับ Variant)
// -----------------------------------------------------------------------------
model CompanyPrice {
  id        String          @id @default(cuid())
  price     Float
  variantId String
  companyId String
  company   Company         @relation(fields: [companyId], references: [id], onDelete: Cascade)
  variant   ProductVariant  @relation(fields: [variantId], references: [id], onDelete: Cascade)

  @@unique([variantId, companyId])
  @@index([companyId])
}

// -----------------------------------------------------------------------------
// 4. Quotation Item (รายการสินค้าในใบเสนอราคา)
// -----------------------------------------------------------------------------
model QuotationItem {
  id          String         @id @default(cuid())
  quantity    Int
  unitPrice   Float
  discount    Float          @default(0)
  totalPrice  Float
  totalWeight Float?
  totalCBM    Float?
  quotationId String
  variantId   String
  variant     ProductVariant @relation(fields: [variantId], references: [id])
  quotation   Quotation      @relation(fields: [quotationId], references: [id], onDelete: Cascade)

  @@index([quotationId])
  @@index([variantId])
}
```

---

## 3. การออกแบบ UX/UI: ถอดแบบแม่พิมพ์จาก `/contact`

```
+---------------------------------------------------------------------------------------------------+
|  MAIN-NAVBAR (Logo, Modules, Notifications, User Profile)                                         |
+------------------------------------+--------------------------------------------------------------+
|  LEFT FILTER SIDEBAR (Desktop)     |  WORKSPACE MAIN CONTENT                                      |
|                                    |                                                              |
|  [Search Categories / Brands...]   |  [ AVAILABLE (185) | UNAVAILABLE (14) ]   [ Search Product ]     |
|                                    |  [ Filters (2) ]                          [ + Add Product ]  |
|  CATEGORIES (27)                   +--------------------------------------------------------------+
|  [x] All Categories         (199)  |  PRODUCT CARDS LIST (Infinite Scroll / 199 Parent Items)     |
|  [ ] Hair Bleaching          (12)  |  +--------------------------------------------------------+  |
|  [ ] Body Lotion             (24)  |  | [IMG] Carebeau Milky Developer Cream (1000ml)          |  |
|  [ ] Facial Care             (15)  |  |       Brand: Carebeau | Cat: Hair Bleaching            |  |
|  ...                               |  |       [4 Formulas] [CBM: 0.042] | Price: ฿65.00 - 75.00|  |
|                                    |  +--------------------------------------------------------+  |
|  BRANDS (24)                       |  | [IMG] Carebeau Hair Color Shampoo (30ml)               |  |
|  [x] All Brands             (199)  |  |       Brand: Carebeau | Cat: Hair Shampoo              |  |
|  [ ] Carebeau               (120)  |  |       [6 Shades]   [CBM: 0.028] | Price: ฿30.00        |  |
|  [ ] Deya                    (25)  |  +--------------------------------------------------------+  |
|  ...                               |  ... Load More ...                                           |
+------------------------------------+--------------------------------------------------------------+
                                     |  >>> SLIDE-OVER DRAWER (EditProductPanel)                    |
                                     |  [Header: SKU / Name / Status Toggle / Close Button]         |
                                     |  [Tabs: Details | Variants (4) | Custom Prices | Logistics]  |
                                     +--------------------------------------------------------------+
```

### 3.1 องค์ประกอบ UI และการ Mapping กับ `/contact`

| องค์ประกอบ UI | ในหน้า `/contact` | นำมาปรับใช้ในหน้า `/product` |
| :--- | :--- | :--- |
| **Workspace Layout** | `<WorkspaceLayout scrollMode="hidden">` พื้นหลังสีเข้ม `#252728` | ใช้แบบเดียวกัน 100% สวยงาม กลมกลืนทั้งระบบ |
| **Left Sidebar (Desktop)** | กรองตาม `Type` และ `Country` พร้อมตัวเลขนับ | กรองตาม **`Category` (27 หมวด)** และ **`Brand` (24 แบรนด์)** พร้อมช่องค้นหาหมวดหมู่ย่อย |
| **Status Tabs (Header)** | `QUALIFIED` vs `UNQUALIFIED` | **`AVAILABLE` (พร้อมจำหน่าย)** vs **`UNAVAILABLE` (ไม่พร้อมจำหน่าย/เลิกผลิต)** พร้อม badge นับ |
| **Search Toolbar** | `AccountSearch` (Debounced 280ms) | `ProductSearch` ค้นหาชื่อสินค้า, SKU, สูตร, ชื่อไทย, หรือ HS-Code |
| **Action Buttons** | ปุ่ม `Filters` (Modal) และปุ่ม `+ Add` สีเขียว `#C7F33C` | ปุ่ม `Filters` (กรองช่วงราคา, มีรูป/ไม่มีรูป, CBM) และปุ่ม `+ Add Product` สี `#C7F33C` |
| **List Cards** | `AccountCardRow` แสดง Star, ชื่อ, โครงการ | `ProductCardRow` แสดง รูปภาพ Thumbnail, ชื่อสินค้าหลัก, แบรนด์, หมวดหมู่, ป้ายระบุจำนวนสูตร (เช่น `[4 Formulas]`), ช่วงราคา `฿65 - ฿75`, ขนาด CBM |
| **Intent Preloading** | `onPointerEnter` บนการ์ดโหลด `AccountOverview` ล่วงหน้า | `onPointerEnter` บนการ์ดสินค้าจะ preload `ProductOverviewDTO` ล่วงหน้า ทำให้เวลากดคลิกเปิด Drawer ได้ทันทีแบบ 0ms |
| **Slide-over Drawer** | `EditAccountPanel` แถบสลับแท็บจากขวา | `EditProductPanel` สไลด์เปิดจากขวา พร้อมแท็บข้อมูลเฉพาะสินค้า |
| **Mobile Integration** | ส่ง Search & Filter เข้า `SidebarContext` | รองรับทั้งโหมด Mobile Drawer และแท็บบน Navbar อัตโนมัติ |

### 3.2 รายละเอียดแท็บใน Slide-over Drawer (`EditProductPanel`)

1. **Tab 1: รายละเอียดทั่วไป (General Info)**
   - ชื่อสินค้าหลัก, ชื่อภาษาไทย, แบรนด์, หมวดหมู่, สเปก/คำอธิบาย
   - สถานะสินค้า (`AVAILABLE`, `UNAVAILABLE`, `DISCONTINUED`)
   - ลิงก์เว็บไซต์ และรหัสพิกัดศุลกากร (HS-Code)
2. **Tab 2: รายการสูตรและสี (Variants & Formulas)**
   - ตารางแสดงสูตรทั้งหมดของสินค้านั้น (เช่น 3%, 6%, 9%, 12%)
   - แต่ละแถวแสดง: รูปภาพ Thumbnail, รหัส SKU, ชื่อสูตร, ราคา Export, ต้นทุน, ราคาต่ำสุด, ปุ่มแก้ไข/เพิ่มสูตรใหม่
3. **Tab 3: ราคารายลูกค้า (Company-Specific Prices)**
   - แสดงตารางราคารายบริษัท (เช่น Thuong Tin, Anna Trading, Namwhan, ฯลฯ)
   - สามารถระบุราคาพิเศษแยกตามแต่ละบริษัทและแต่ละสูตรได้อย่างอิสระ
4. **Tab 4: มิติลังและการจำลองตู้คอนเทนเนอร์ (Packaging & Container Simulator)**
   - มิติกล่อง (กว้าง x ยาว x สูง cm), น้ำหนักสุทธิ (NW), น้ำหนักรวมลัง (GW)
   - ปริมาตรต่อกล่อง (CBM), จำนวนบรรจุต่อกล่อง (Carton Quantity)
   - เครื่องมือจำลองคำนวณจำนวนตู้คอนเทนเนอร์ 20ft / 40ft อัตโนมัติ
5. **Tab 5: บันทึกและประวัติ (Remarks & Audit Log)**
   - Service Remarks 1, 2, 3
   - ประวัติการแก้ไขข้อมูลและเวลาที่บันทึก

---

## 4. แผนงานด้าน Speed & Performance Optimization

ตามแนวปฏิบัติของ `performance/SKILL.md` และ `vercel-react-best-practices`:

```
User Click / Search / Filter
  ├── [1] React State Commit (<= 16ms, zero jank)
  ├── [2] Local Memory Match (Provisional Paint <= 50ms)
  └── [3] SWR / Server Action Request (<= 250ms)
        ├── Server Session & Menu Auth Resolution (<= 40ms)
        ├── Prisma Index-backed Query (<= 30ms)
        └── Lean DTO Transfer (<= 15KB per 20 items)
```

### กลยุทธ์การเพิ่มความเร็วระดับสูงสุด:
1. **Concurrent Server Preload ใน `page.tsx`**:
   - หน้า `/product/page.tsx` จะดึง session ตรวจสิทธิ์เมนู `product` แล้วสั่ง `Promise.all` โหลดสินค้า 20 รายการแรก, จำนวนสถิติสถานะ, รายชื่อหมวดหมู่ (`Category`), และรายชื่อแบรนด์ (`Brand`) พร้อมกัน ทำให้ตอน SSR ส่ง HTML ที่พร้อมแสดงผลทันทีโดยไม่มีกระพริบ
2. **Split DTO Architecture (ลด Bandwidth)**:
   - `ProductListItemDTO`: ส่งเฉพาะข้อมูลจำเป็นสำหรับการ์ดในรายการ (ขนาดเฉลี่ยเพียง ~0.8KB ต่อใบ)
   - `ProductDetailDTO`: โหลดแบบ On-demand เฉพาะตอนที่ผู้ใช้คลิกเปิด Drawer เท่านั้น
3. **Intent-Based Chunk & Data Preloading**:
   - เมื่อเมาส์ Hover หรือสัมผัสการ์ดสินค้า (`onPointerEnter`) ระบบจะสั่ง preload ข้อมูลของสินค้านั้น และ preload JS Chunk ของ `EditProductPanel` ล่วงหน้า ทำให้เมื่อคลิก การ์ดจะเด้งเปิด Drawer ทันทีในเวลา `< 50ms`
4. **Zero Full-Route Revalidation**:
   - ห้ามใช้ `revalidatePath('/product')` เมื่อมีการแก้ไขข้อมูลเล็กน้อย เช่น การแก้ราคาหรือเปลี่ยนสถานะ
   - ใช้ SWR Targeted Cache Update (`mutate(key, updatedData, false)`) ร่วมกับ Operation-based state update เพื่อให้ UI ตอบสนองทันที
5. **Database Indexing Strategy**:
   - วาง Index แบบผสม: `@@index([status, brand, category])` และ `@@index([name])` ทำให้การฟิลเตอร์และเสิร์ชในฐานข้อมูลรวดเร็วในระดับ `< 10ms`

---

## 5. การรองรับระบบใบเสนอราคาในอนาคต (Future Quotation Engine)

การออกแบบแยกระดับ Parent Product + ProductVariant ช่วยปลดล็อกขีดความสามารถในการออกใบเสนอราคา B2B อย่างสมบูรณ์แบบ:

### 5.1 B2B Bulk Matrix Ordering (การสั่งซื้อแบบกรอกตารางทีเดียว)
เมื่อพนักงานขายอยู่ในหน้าสร้างใบเสนอราคา:
* ค้นหาชื่อสินค้าหลัก เช่น *"Carebeau Milky Developer Cream"* ครั้งเดียว
* ระบบจะเปิด Modal เป็นตารางสูตรทั้งหมดขึ้นมาให้กรอกจำนวนลังได้พร้อมกัน:
  ```text
  [Carebeau Milky Developer Cream (1000ml)]
  - 3% Concentrate   [  50 ] กล่อง   @ ฿65.00   = ฿3,250.00
  - 6% Concentrate   [ 100 ] กล่อง   @ ฿65.00   = ฿6,500.00
  - 9% Concentrate   [ 100 ] กล่อง   @ ฿65.00   = ฿6,500.00
  - 12% Concentrate  [  20 ] กล่อง   @ ฿65.00   = ฿1,300.00
  -------------------------------------------------------------
  รวม 270 กล่อง (0.042 CBM/กล่อง = 11.34 CBM) -> [ + เพิ่มลงใบเสนอราคา ]
  ```
* เร็วกว่าเดิม 4 เท่า และไม่เกิดข้อผิดพลาดในการเลือกสูตร

### 5.2 ระบบคำนวณ CBM และตู้คอนเทนเนอร์แบบ Real-time (Container Capacity Engine)
* เมื่อเพิ่มสินค้าลงใบเสนอราคา ระบบจะนำ `cbm` และ `cartonGrossWeight` ของสินค้ามาคำนวณสะสมอัตโนมัติ
* แสดงแถบเกจวัดความจุตู้สินค้าด้านล่างของใบเสนอราคา:
  - **20ft Container (จุได้ ~28 CBM)**: `11.34 / 28 CBM (40.5%)`
  - **40ft Container (จุได้ ~58 CBM)**: `11.34 / 58 CBM (19.5%)`
* ช่วยให้เซลส์แนะนำลูกค้าได้ทันทีว่า "ตู้คอนเทนเนอร์ยังเหลือที่ว่างอีก 16.66 CBM สั่งเพิ่มอีกประมาณ 390 กล่องจะเต็มตู้พอดี คุ้มค่าส่งที่สุด"

### 5.3 ลำดับขั้นการดึงราคาอัตโนมัติ (Pricing Resolution Cascade)
เวลาออกใบเสนอราคาให้บริษัทใดบริษัทหนึ่ง ระบบจะหาลำดับราคาที่ดีที่สุดอัตโนมัติ:
```
1. ราคารายลูกค้าใน CompanyPrice (ถ้ามีบันทึกไว้สำหรับบริษัทนี้ เช่น ราคา Thuong Tin)
   └── ถ้าไม่มี -> 2. ราคาเจรจาต่อรอง (Negotiation Price ถ้ากำหนด)
         └── ถ้าไม่มี -> 3. ราคาขายส่งมาตรฐาน (Base Export Price)
```
พร้อมแจ้งเตือน Guardrail สีส้มทันทีหากเซลส์ใส่ราคาต่ำกว่า `minPrice` (ราคาลดต่ำสุด)

---

## 6. ลำดับขั้นตอนการดำเนินงาน (Implementation Roadmap)

```
[Phase 1: DB Schema & Data Migration]
  ├── ปรับปรุง prisma/schema.prisma (Product, ProductVariant, CompanyPrice)
  ├── รัน prisma migrate dev
  └── เขียนสคริปต์ src/scripts/migrateProducts.ts (Clean CSV + Map 18 Companies)

[Phase 2: Server Actions & DTO Contracts]
  ├── src/lib/actions/product.ts (getProductsWithFilters, getProductOverview)
  ├── src/lib/product/product-dto.ts (Lean DTOs, Cache Key helpers)
  └── จัดการ Permission (เฉพาะสิทธิ์เมนู 'product')

[Phase 3: Core Workspace UI Components]
  ├── src/components/product/ProductView.tsx (Main Orchestrator)
  ├── src/components/product/ProductFilterSidebar.tsx (Category & Brand)
  ├── src/components/product/ProductCardList.tsx & ProductCardRow.tsx
  └── src/components/product/ProductToolbar.tsx (Status Tabs, Search, Add)

[Phase 4: Slide-over Drawer & Panels]
  ├── src/components/product/EditProductPanel.tsx (Tabs: Info, Variants, Prices, Logistics)
  ├── src/components/product/CreateProductPanel.tsx (สร้างสินค้าหลักและสูตร)
  └── src/components/product/ProductFiltersDrawer.tsx (กรองละเอียดบน Mobile/Desktop)

[Phase 5: Verification & Production Polish]
  ├── ทดสอบการโหลดหน้าแรก (0ms flash, SSR)
  ├── ตรวจสอบ Intent Hover Preload (<50ms เปิด Drawer)
  ├── ทดสอบค้นหาและฟิลเตอร์หลายเงื่อนไขพร้อมกัน
  └── รัน npm run build และตรวจสอบ TypeScript errors ให้ผ่าน 100%
```

---

## 7. เกณฑ์การตรวจรับงาน (Acceptance Criteria)

1. ✅ หน้า `/product` มีดีไซน์และโครงสร้างสอดคล้องกับ `/contact` ครบถ้วน (Sidebar, Toolbar, Card List, Drawer)
2. ✅ ฐานข้อมูลแยก `Product` และ `ProductVariant` ได้อย่างถูกต้อง และนำเข้าข้อมูลจาก ` Products.csv` ครบ 548 รายการ
3. ✅ ตาราง `CompanyPrice` มีข้อมูลราคาพิเศษเชื่อมโยงกับบริษัทลูกค้าครบถ้วน
4. ✅ การเปิดหน้า `/product` โหลดเร็ว ตอบสนองต่อการคลิก/ค้นหาในเวลาน้อยกว่า 100ms
5. ✅ รัน `npm run build` ผ่าน 100% ปราศจาก TypeScript Error และ Lint Warnings
