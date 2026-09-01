---
name: crm-realtime-optimistic-ui
description: >
  Strategy for making the CRM feel instant and real-time across all users.
  **TRIGGER CODE WORD: "ไม่สด"** — When the user says "ไม่สด" (meaning "not fresh / not realtime"),
  activate this skill and apply the 4-pillar fix strategy to the component or action they are referring to.
  Also activate when the user mentions: "ไม่อัพเดท", "ต้อง refresh", "ช้า", "ไม่ realtime", "not updating", "stale UI".
license: MIT
metadata:
  author: agent
  version: "1.0"
---

# CRM Realtime & Optimistic UI Strategy

> **รหัสลับ: `ไม่สด`**
> เมื่อผู้ใช้พิมพ์ "ไม่สด" พร้อมระบุจุดที่มีปัญหา → Agent ต้องวิเคราะห์และลงมือแก้ไขตาม 4 Pillars ด้านล่างนี้ทันที

---

## สถาปัตยกรรมปัจจุบัน (Architecture Context)

| Layer | Technology | File |
|-------|-----------|------|
| Real-time Push | **Pusher** (WebSocket) | `src/lib/pusher.ts` |
| Server Actions | Next.js Server Actions | `src/lib/actions/*.ts` |
| Client State | **SWR** / `useSWRInfinite` | Component-level hooks |
| Notifications | Prisma `Notification` model + Pusher private channels | `src/lib/actions/notification.ts` |
| Pipeline Board | Pusher `pipeline` channel → SWR `mutate()` | `src/components/pipeline/KanbanBoard.tsx` |
| User Notifications | Pusher `private-user-{id}` channel | `src/components/layout/Header.tsx` |

### ช่องทาง Pusher ที่มีอยู่

```
pipeline                    → event: 'pipeline-updated'     (KanbanBoard listens)
private-user-{userId}       → event: 'new-notification'     (Header listens)
presence-global             → events: member_added/removed  (Header listens)
```

---

## 🏛️ 4 Pillars — กลยุทธ์หลัก

### Pillar 1: Optimistic UI (ทำให้ UI เร็วทันตา)

**หลักการ:** อัปเดตหน้าจอ **ทันที** ก่อนที่ Server จะตอบกลับ ถ้า Server ล้มเหลว → Revert กลับ

**Pattern:**
```typescript
const handleAction = async () => {
  // ✅ STEP 1: Optimistic — อัปเดต UI ทันที
  setLocalState(prev => [...prev, optimisticData]);

  try {
    // ✅ STEP 2: Fire server action (อาจ await หรือ fire-and-forget)
    await serverAction();
    
    // ✅ STEP 3: Mutate SWR cache (ไม่ใช่ router.refresh!)
    mutate();
    
  } catch (e) {
    // ✅ STEP 4: Revert ถ้า fail
    setLocalState(originalState);
    toast({ title: "Error", description: e.message, type: "error" });
  }
};
```

**❌ Anti-pattern (ห้ามทำ):**
```typescript
// ❌ WRONG: Sequential await + router.refresh
await addTeamMember(dealId, userId);
await addSystemLog(dealId, message, sessionUserId);  // รอ round-trip ที่ 2
router.refresh();  // รอ round-trip ที่ 3 — ดึงข้อมูลทั้งหน้าใหม่
```

**✅ Best Practice:**
```typescript
// ✅ RIGHT: Optimistic + Parallel + No router.refresh
setLocalTeamMembers(prev => [...prev, userToAdd]); // ทันที

try {
  // Fire-and-forget สิ่งที่ไม่กระทบ UI
  addTeamMember(dealId, userId);
  addSystemLog(dealId, msg, uid); // ไม่ต้อง await
  // ไม่ต้อง router.refresh() — ใช้ SWR mutate แทน
} catch (e) {
  setLocalTeamMembers(deal.teamMembers || []); // Revert
}
```

---

### Pillar 2: ห้ามใช้ `router.refresh()` — ใช้ SWR `mutate()` แทน

**ทำไม `router.refresh()` แย่:**
- มันสั่งให้ Next.js **ดึง Server Components ใหม่ทั้งหน้า** (full re-render)
- ทำให้ Scroll position หาย, Panel state reset, หน้าจอกระพริบ
- เป็น round-trip ใหญ่มาก (อาจ 500ms-2s บน production)

**วิธีแก้:** ใช้ SWR `mutate()` เพื่ออัปเดตเฉพาะข้อมูลที่เปลี่ยน

```typescript
// ✅ ถ้า component ใช้ useSWR → เรียก mutate() ของ hook นั้น
const { mutate } = useSWR(['key', id], fetcher);
// ...after action...
mutate(); // re-fetch เฉพาะ data ที่เกี่ยว

// ✅ ถ้าต้อง mutate จาก component อื่น → ใช้ global mutate
import { mutate } from 'swr';
mutate(['activity-logs', dealId]); // invalidate specific key
```

**Checklist เวลาเจอ `router.refresh()`:**
1. หา `router.refresh()` ในไฟล์ที่มีปัญหา
2. ระบุว่า data ตัวไหนที่ต้อง update จริง
3. แทนที่ด้วย SWR `mutate()` หรือ local state update
4. ถ้ามี Pusher → ส่ง event ให้ client อื่นเรียก `mutate()` เอง

---

### Pillar 3: Real-time Push ด้วย Pusher (Multi-user Sync)

**หลักการ:** เมื่อ User A ทำ action → Server ยิง Pusher event → User B/C/D เห็นทันทีโดยไม่ต้อง refresh

**Pattern สำหรับ Server Action:**
```typescript
// ใน src/lib/actions/*.ts
export async function someAction(...) {
  const result = await prisma.someModel.update({...});
  
  // ✅ Push real-time event (fire-and-forget)
  notifyPipelineUpdate(); // ไม่ต้อง await
  
  // ✅ ถ้า action นี้ต้องส่ง Notification ถึง user เฉพาะ
  triggerNotification(targetUserId, notificationData); // ไม่ต้อง await
  
  revalidatePath('/pipeline');
  return result;
}
```

**Checklist — ต้องมี Pusher push ใน action เหล่านี้:**

| Server Action | Pusher Event | ใครต้องเห็น |
|---|---|---|
| `addTeamMember` | `pipeline-updated` + `new-notification` | ทุกคนในหน้า Pipeline + คนถูกเชิญ |
| `removeTeamMember` | `pipeline-updated` | ทุกคนในหน้า Pipeline |
| `addActivityLog` | `pipeline-updated` | ทุกคนในหน้า Pipeline |
| `addSystemLog` | `pipeline-updated` | ทุกคนในหน้า Pipeline |
| `editActivityLog` | `pipeline-updated` | ทุกคนในหน้า Pipeline |
| `deleteActivityLog` | `pipeline-updated` | ทุกคนในหน้า Pipeline |
| `updateDueDateWithLog` | `pipeline-updated` | ทุกคนในหน้า Pipeline (มีแล้ว ✅) |
| `createOpportunity` | `pipeline-updated` | ทุกคนในหน้า Pipeline (มีแล้ว ✅) |
| `moveOpportunityStage` | `pipeline-updated` | ทุกคนในหน้า Pipeline (มีแล้ว ✅) |
| `deleteOpportunity` | `pipeline-updated` | ทุกคนในหน้า Pipeline (มีแล้ว ✅) |

---

### Pillar 4: Fire-and-Forget (ไม่ต้อง await สิ่งที่ไม่กระทบ UI)

**หลักการ:** Action ที่ไม่ส่งผลต่อ UI ของ user ปัจจุบัน ให้ยิงไปเลยแบบไม่รอ

**สิ่งที่ต้อง fire-and-forget (ไม่ต้อง `await`):**
- `addSystemLog()` — User ไม่ได้เห็น System Log ตอนทำ action
- `notifyPipelineUpdate()` — Pusher event สำหรับคนอื่น
- `triggerNotification()` — Notification สำหรับคนอื่น
- `revalidatePath()` — ไม่ต้อง await (Next.js ทำ async อยู่แล้ว)

**สิ่งที่ต้อง `await` (กระทบ UI):**
- `addTeamMember()` — ต้องรู้ว่าสำเร็จหรือไม่ เพื่อ revert ถ้า fail
- `addActivityLog()` — ต้องได้ ID กลับมา render
- `createOpportunity()` — ต้องได้ deal object กลับมา

**Pattern:**
```typescript
const handleAddMember = async (userId: string) => {
  // Optimistic
  setLocalTeamMembers(prev => [...prev, userToAdd]);
  setIsUpdatingTeam(false); // ✅ ปลดล็อค UI ทันที — กดเชิญคนต่อได้เลย

  try {
    await addTeamMember(dealId, userId); // ✅ await เฉพาะตัวหลัก

    // ✅ Fire-and-forget — ไม่ต้อง await
    addSystemLog(dealId, `Invited ${name} to the team`, sessionUserId);
    
    // ✅ ไม่ต้อง router.refresh()

  } catch (e) {
    setLocalTeamMembers(deal.teamMembers || []); // Revert
  }
};
```

---

## 🔧 วิธีใช้ Skill นี้ (สำหรับ AI Agent)

เมื่อ User พิมพ์ **"ไม่สด"** + ระบุจุดที่มีปัญหา:

### Step 1: วิเคราะห์ (Diagnose)
1. หา Server Action ที่เกี่ยวข้อง (ใน `src/lib/actions/*.ts`)
2. หา Component ที่เรียก action นั้น
3. ตรวจสอบว่ามี `router.refresh()` หรือไม่
4. ตรวจสอบว่ามี `notifyPipelineUpdate()` หรือไม่
5. ตรวจสอบว่ามี Optimistic UI หรือไม่

### Step 2: แก้ไข (Fix) — Apply 4 Pillars
1. **เพิ่ม Optimistic UI** ถ้ายังไม่มี
2. **แทนที่ `router.refresh()`** ด้วย SWR `mutate()`
3. **เพิ่ม `notifyPipelineUpdate()`** ใน Server Action (fire-and-forget)
4. **เพิ่ม Notification** ถ้า action กระทบ user อื่น (เช่น เชิญคน)
5. **เปลี่ยน sequential `await`** เป็น fire-and-forget สำหรับ non-critical tasks

### Step 3: ทดสอบ (Verify)
1. Build ไม่พัง (`npm run build`)
2. Action ทำงานเร็วขึ้น (ไม่มี delay ที่ user เห็น)
3. User อื่น (ถ้ามี) เห็นการเปลี่ยนแปลงทันทีผ่าน Pusher
4. ถ้า server fail → UI revert กลับสถานะเดิม

---

## 📁 ไฟล์สำคัญที่ต้องรู้

| ไฟล์ | หน้าที่ |
|------|---------|
| `src/lib/pusher.ts` | Pusher server & client config |
| `src/lib/actions/opportunity.ts` | Server Actions ทั้งหมดของ Pipeline (CRUD, Team, Logs) |
| `src/lib/actions/notification.ts` | Notification CRUD + `triggerNotification()` + `requestTeamInvite()` |
| `src/components/pipeline/KanbanBoard.tsx` | ฟัง Pusher `pipeline-updated` → `mutate()` SWR |
| `src/components/pipeline/EditDealPanel.tsx` | Deal panel — Activity Log, Team, Due Date |
| `src/components/layout/Header.tsx` | ฟัง Pusher `new-notification` + presence |

---

## 🚨 Known Issues (จุดที่ยัง "ไม่สด")

จุดที่ยังต้องแก้ไข (เรียงตามความสำคัญ):

1. **`addTeamMember`** — ❌ ไม่มี `notifyPipelineUpdate()`, ❌ ไม่ส่ง Notification ให้คนถูกเชิญ
2. **`removeTeamMember`** — ❌ ไม่มี `notifyPipelineUpdate()`
3. **`addActivityLog`** — ❌ ไม่มี `notifyPipelineUpdate()` (Pusher push)
4. **`addSystemLog`** — ❌ ไม่มี `notifyPipelineUpdate()`
5. **`editActivityLog`** — ❌ ไม่มี `notifyPipelineUpdate()`
6. **`deleteActivityLog`** — ❌ ไม่มี `notifyPipelineUpdate()`
7. **`handleAddMember` (UI)** — ⚠️ ใช้ `router.refresh()` + sequential `await`
8. **`handleRemoveMember` (UI)** — ⚠️ ใช้ `router.refresh()` + sequential `await`
9. **`handleAddLog` (UI)** — ⚠️ ใช้ `router.refresh()`
