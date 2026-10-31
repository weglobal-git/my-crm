"use server";

import prisma from "@/lib/prisma";
import { requireOpportunityAccess, notifyPrivatePipelineUpdate } from "@/lib/pipeline-security";
import { aiGateway } from "@/lib/ai/gateway";
import { GoogleGeminiAdapter } from "@/lib/ai/adapters/gemini";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { dispatchNotification } from "@/lib/notification-dispatcher";
import { dispatchDashboardInvalidation } from "@/lib/dashboard/dashboard-realtime-server";
import {
  encodeTierPrefix,
  hasVerifiableProofSignal,
  parseTierPrefix,
  type UpdateGrade,
} from "@/lib/pipeline-update-quality";

// Ensure Gemini adapter is registered
aiGateway.registerAdapter("GOOGLE_GEMINI", new GoogleGeminiAdapter());

export interface AcceleratorQuestion {
  id: string;
  question: string;
  reason?: string;
  choices?: string[];
  answer?: string | null;
  answeredBy?: string | null;
  answeredByImage?: string | null;
  answeredAt?: string | null;
  isEdited?: boolean;
  editedAt?: string | null;
  createdAt?: string | null;
  status: "PENDING" | "ANSWERED" | "DISMISSED";
  source?: "AI" | "MANAGER";
  askedBy?: string | null;
  askedByImage?: string | null;
  askedByUserId?: string | null;
  urgentLogId?: string | null;
}

export interface PendingAcceleratorInfo {
  count: number;
  earliestPendingAt: string | null;
}

export interface DealAcceleratorsState {
  targetGoal: string;
  goalSource: "AI_INFERRED" | "USER_OVERRIDE";
  questions: AcceleratorQuestion[];
  lastGeneratedAt?: string;
  updatedAt?: string;
}

const ACCELERATOR_SCHEMA = {
  type: "object",
  properties: {
    targetGoal: {
      type: "string",
      description: "เป้าหมายหลักที่สำคัญที่สุดของการ์ด/ดีลนี้ 1 ประโยคชัดเจน (เช่น 'ผลิตและจัดส่ง OEM Vitamin E Cream 1,200 ชิ้นให้ทันก่อน 13 เม.ย.' หรือ 'เตรียมใบเสนอราคาและปิดการขาย')"
    },
    questions: {
      type: "array",
      description: "คำถามเจาะจงจุดคอขวดที่สำคัญที่สุดเพียง 1 ข้อเท่านั้น (ห้ามเกิน 1 ข้อเด็ดขาด) เพื่อช่วยให้บรรลุเป้าหมายได้เร็วขึ้น (ถ้าข้อมูลครบถ้วนแล้วสามารถเป็นอาร์เรย์ว่างได้)",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          question: {
            type: "string",
            description: "คำถามตรงประเด็น สุภาพ และเข้าใจง่าย ไม่ถามกว้างๆ และไม่ถามซ้ำเรื่องที่มีระบุไว้ในประวัติแล้ว"
          },
          reason: {
            type: "string",
            description: "เหตุผลสั้นๆ ที่ถาม เช่น 'ตรวจพบยอดค้างชำระในบันทึกเมื่อ 25/08 ยังไม่มีการบันทึกยืนยัน'"
          },
          choices: {
            type: "array",
            items: { type: "string" },
            description: "ตัวเลือกคำตอบ 2-3 ตัวเลือกสั้นๆ ที่ครอบคลุมสถานการณ์หน้างานจริง ให้เซลล์กดตอบได้ใน 1 วินาที เช่น ['ชำระเงินครบแล้ว', 'ยังค้างชำระจริง', 'ลูกค้านัดจ่ายสัปดาห์หน้า']"
          }
        },
        "required": ["id", "question", "reason", "choices"]
      }
    }
  },
  "required": ["targetGoal", "questions"]
};

/**
 * ดึงสถานะ AI Deal Accelerators สำหรับดีลที่ระบุ
 */
export async function getDealAccelerators(
  dealId: string,
  options?: { bypassAuth?: boolean }
): Promise<{ success: boolean; data?: DealAcceleratorsState; error?: string }> {
  try {
    if (!options?.bypassAuth) {
      await requireOpportunityAccess(dealId, { capability: 'deal:view' });
    }

    const configRow = await prisma.systemConfig.findUnique({
      where: { id: `deal_accelerators_${dealId}` },
    });

    if (configRow?.googleRefreshToken) {
      try {
        const state: DealAcceleratorsState = JSON.parse(configRow.googleRefreshToken);
        if (state && Array.isArray(state.questions)) {
          // Self-heal historic duplicate or orphaned questions
          const answeredTexts = new Set(
            state.questions
              .filter(q => q.status === "ANSWERED" && Boolean(q.answer))
              .map(q => q.question.trim().toLowerCase())
          );
          let stateModified = false;
          // If a question is pending, but an answered question with the exact same text already exists,
          // prune the pending duplicate
          state.questions = state.questions.filter(q => {
            if (q.status === "PENDING" && answeredTexts.has(q.question.trim().toLowerCase())) {
              stateModified = true;
              return false; // Remove zombie duplicate
            }
            return true;
          });

          // Also deduplicate answered questions with same text (keep latest answered)
          const seenAnswered = new Set<string>();
          state.questions = state.questions.filter(q => {
            if (q.status === "ANSWERED") {
              const key = q.question.trim().toLowerCase();
              if (seenAnswered.has(key)) {
                stateModified = true;
                return false;
              }
              seenAnswered.add(key);
            }
            return true;
          });

          // Deduplicate pending questions with same text (keep latest)
          const seenPending = new Set<string>();
          state.questions = state.questions.filter(q => {
            if (q.status === "PENDING") {
              const key = q.question.trim().toLowerCase();
              if (seenPending.has(key)) {
                stateModified = true;
                return false;
              }
              seenPending.add(key);
            }
            return true;
          });

          if (stateModified) {
            // Persist healed state asynchronously in background
            void prisma.systemConfig.update({
              where: { id: `deal_accelerators_${dealId}` },
              data: { googleRefreshToken: JSON.stringify(state) },
            }).catch(() => {});
          }
        }
        return { success: true, data: state };
      } catch (err) {
        console.warn("[AI Accelerator] Failed to parse existing state:", err);
      }
    }

    return { success: true, data: undefined };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load accelerators";
    return { success: false, error: msg };
  }
}

/**
 * สร้างหรืออัปเดต AI Deal Accelerators และวิเคราะห์เป้าหมายของการ์ดด้วย Gemini
 */
export async function generateDealAccelerators(
  dealId: string,
  customGoal?: string,
  options?: { bypassAuth?: boolean }
): Promise<{ success: boolean; data?: DealAcceleratorsState; error?: string }> {
  try {
    let actorId: string | undefined;
    if (!options?.bypassAuth) {
      const access = await requireOpportunityAccess(dealId, { capability: 'deal:interact' });
      actorId = access.actor.id;
    }
    if (!actorId) {
      const session = await getServerSession(authOptions);
      actorId = session?.user?.id;
    }

    // 1. ดึงข้อมูลดีลและบริบททั้งหมด (เฉพาะฟิลด์ที่จำเป็น)
    const deal = await prisma.opportunity.findUnique({
      where: { id: dealId },
      select: {
        id: true,
        topic: true,
        type: true,
        status: true,
        value: true,
        currency: true,
        dueDate: true,
        stage: { select: { name: true } },
        company: { select: { name: true } },
        owner: { select: { id: true, name: true } },
        teamMembers: { select: { id: true } },
      },
    });

    if (!deal) {
      return { success: false, error: "ไม่พบข้อมูลดีลนี้ในระบบ" };
    }

    if (!actorId) {
      actorId = deal.owner?.id;
    }

    const logs = await prisma.activityLog.findMany({
      where: { opportunityId: dealId },
      select: {
        id: true,
        content: true,
        type: true,
        createdAt: true,
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    });

    const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
    if (!apiKey.trim()) {
      return { success: false, error: "ยังไม่ได้ตั้งค่า GOOGLE_GEMINI_API_KEY ในไฟล์ .env" };
    }

    // 2. ดึงประวัติ Accelerators เดิม (ถ้ามีคำถามที่ตอบแล้ว หรือ Manager Call ค้างอยู่ ให้เก็บไว้)
    const existingRow = await prisma.systemConfig.findUnique({
      where: { id: `deal_accelerators_${dealId}` },
    });
    let previousAnswered: AcceleratorQuestion[] = [];
    let previousPendingManager: AcceleratorQuestion[] = [];
    let previousPendingAiIds: string[] = [];
    let savedGoal = customGoal;

    if (existingRow?.googleRefreshToken) {
      try {
        const prev: DealAcceleratorsState = JSON.parse(existingRow.googleRefreshToken);
        if (prev.questions) {
          previousAnswered = prev.questions.filter(q => q.status === "ANSWERED");
          previousPendingManager = prev.questions.filter(q => q.status === "PENDING" && q.source === "MANAGER");
          previousPendingAiIds = prev.questions
            .filter(q => q.status === "PENDING" && q.source !== "MANAGER")
            .map(q => q.id);
        }
        if (!savedGoal && prev.goalSource === "USER_OVERRIDE") {
          savedGoal = prev.targetGoal;
        }
      } catch {}
    }

    // 3. เตรียม Prompt สำหรับ AI Manager Persona
    const typeLabel = deal.type === "INTERNAL_TASK" ? "Internal Task (งานภายใน)" : (deal.type === "PARTNERSHIP" ? "Partnership (ความร่วมมือ)" : "Sales Deal (การขาย)");
    const dealInfo = [
      `ชื่อการ์ด/หัวข้อ: ${deal.topic}`,
      `ประเภทงาน: ${typeLabel}`,
      `สถานะ: ${deal.status}`,
      `ขั้นตอนปัจจุบัน (Stage): ${deal.stage?.name || "ไม่ระบุ"}`,
      `มูลค่า: ${deal.value ? `${deal.value.toLocaleString()} ${deal.currency || "THB"}` : "ไม่ระบุ"}`,
      `ลูกค้า/บริษัท: ${deal.company?.name || "ไม่ระบุ"}`,
      `ผู้รับผิดชอบ: ${deal.owner?.name || "ไม่ระบุ"}`,
      `กำหนดส่ง (Due Date): ${deal.dueDate ? new Date(deal.dueDate).toLocaleDateString("th-TH") : "ไม่ระบุ"}`,
    ].join("\n");

    const activityInfo = logs.length === 0
      ? "ยังไม่มีบันทึกกิจกรรมในดีลนี้"
      : logs.map((log: { user?: { name: string | null } | null; type: string; createdAt: Date | string; content: string | null }) => {
          const author = log.user?.name || (log.type === "SYSTEM_UPDATE" ? "ระบบ" : "ผู้ใช้");
          const time = new Date(log.createdAt).toLocaleDateString("th-TH", {
            day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
          });
          return `[${time}] ${author}: ${log.content?.trim() || ""}`;
        }).reverse().join("\n");

    const answeredContext = previousAnswered.length > 0
      ? `\nคำถามที่เคยตอบแล้วก่อนหน้านี้ (ห้ามถามซ้ำเรื่องเหล่านี้เด็ดขาด):\n` +
        previousAnswered.map(q => `- คำถาม: ${q.question} => คำตอบ: ${q.answer} (โดย ${q.answeredBy})`).join("\n")
      : "";

    const userGoalInstruction = savedGoal
      ? `\nผู้ใช้ได้ระบุเป้าหมายที่ต้องการไว้ชัดเจนแล้วคือ: "${savedGoal}" (ให้ยึดเป้าหมายนี้เป็นหลัก)`
      : `\nกรุณาวิเคราะห์และระบุเป้าหมายที่แท้จริงของการ์ดนี้ 1 ประโยคชัดเจน`;

    const systemInstruction = `คุณคือ "AI Sales Coach & Project Manager" ผู้ช่วยผู้จัดการคอยตรวจงานและเร่งปิดดีล/งานให้สำเร็จลุล่วง
เป้าหมายของคุณคือ:
1. วิเคราะห์เป้าหมายสำคัญที่สุดของการ์ดนี้ (Target Goal)
2. กวาดสายตาดูประวัติการทำงาน และค้นหาว่า "มีจุดคอขวดอะไรที่ยังตกหล่นหรือขาดข้อมูลสำคัญ" ที่จะทำให้งานสะดุดหรือไม่บรรลุเป้าหมาย
3. ตั้งคำถามเจาะจงจุดคอขวดที่สำคัญที่สุดเพียง 1 ข้อเท่านั้น (ห้ามสร้างเกิน 1 ข้อเด็ดขาด) ที่เฉียบคมและตรงประเด็นที่สุด พร้อมสร้างตัวเลือก Choice 2-3 ตัวเลือกสั้นๆ ที่ให้ผู้รับผิดชอบงานกดตอบได้ทันทีใน 1 วินาที

กฎเหล็ก:
- ห้ามถามเรื่องที่มีคำตอบชัดเจนในประวัติกิจกรรมอยู่แล้ว (Negative Fact Checking)
- ห้ามถามคำถามปลายเปิดกว้างๆ เช่น "ขออัปเดตงานหน่อยครับ"
- ให้ถามแบบมีเป้าหมาย เช่น เรื่องการชำระเงิน, วันส่งมอบ, ผลการทดสอบตัวอย่าง, หรือเอกสารที่ยังขาด
- ตัวเลือก Choice ต้องเป็นภาษาไทย กระชับ และเป็นสถานการณ์ที่พบได้จริงหน้างาน`;

    const prompt = `ข้อมูลการ์ดงาน:
${dealInfo}

ประวัติกิจกรรมล่าสุด:
${activityInfo}
${answeredContext}
${userGoalInstruction}

กรุณาวิเคราะห์และส่งผลลัพธ์เป็น JSON ตาม Schema`;

    const adapter = aiGateway.getAdapter("GOOGLE_GEMINI");
    let aiResult;
    try {
      aiResult = await adapter.generateStructured<{ targetGoal: string; questions: Array<{ id: string; question: string; reason: string; choices: string[] }> }>({
        providerKey: "GOOGLE_GEMINI",
        modelId: "gemini-2.5-flash",
        secretKey: apiKey,
        systemInstruction,
        prompt,
        schema: ACCELERATOR_SCHEMA,
        temperature: 0.2,
        timeoutMs: 25000,
      });
    } catch (err) {
      console.warn("[AI Accelerator] fallback to gemini-1.5-flash:", err);
      aiResult = await adapter.generateStructured<{ targetGoal: string; questions: Array<{ id: string; question: string; reason: string; choices: string[] }> }>({
        providerKey: "GOOGLE_GEMINI",
        modelId: "gemini-1.5-flash",
        secretKey: apiKey,
        systemInstruction,
        prompt,
        schema: ACCELERATOR_SCHEMA,
        temperature: 0.2,
        timeoutMs: 25000,
      });
    }

    const now = new Date().toISOString();
    // บังคับจำกัดให้มีคำถาม AI ได้มากที่สุดเพียง 1 ข้อเท่านั้นตามข้อกำหนด
    const rawQuestions = (aiResult.data.questions || []).slice(0, 1);
    const newQuestions: AcceleratorQuestion[] = rawQuestions.map((q, idx) => ({
      id: `acc_ai_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      question: q.question,
      reason: q.reason,
      choices: q.choices && q.choices.length > 0 ? q.choices : ["ยืนยันเรียบร้อย", "ยังค้างอยู่", "เลื่อนกำหนด"],
      status: "PENDING",
      createdAt: now,
      source: "AI",
      askedBy: "AI Assistant",
    }));

    // 4. Re-fetch fresh state immediately before saving to prevent overwriting answers/questions submitted during AI generation
    const freshRow = await prisma.systemConfig.findUnique({
      where: { id: `deal_accelerators_${dealId}` },
    });

    let currentAnswered: AcceleratorQuestion[] = [];
    let currentPendingManager: AcceleratorQuestion[] = [];
    let currentPendingAiIds: string[] = [];
    let effectiveGoal = savedGoal;

    if (freshRow?.googleRefreshToken) {
      try {
        const freshState: DealAcceleratorsState = JSON.parse(freshRow.googleRefreshToken);
        if (freshState.questions) {
          currentAnswered = freshState.questions.filter(q => q.status === "ANSWERED");
          currentPendingManager = freshState.questions.filter(q => q.status === "PENDING" && q.source === "MANAGER");
          currentPendingAiIds = freshState.questions
            .filter(q => q.status === "PENDING" && q.source !== "MANAGER")
            .map(q => q.id);
        }
        if (!effectiveGoal && freshState.goalSource === "USER_OVERRIDE") {
          effectiveGoal = freshState.targetGoal;
        }
      } catch (e) {
        console.warn("[AI Accelerator] Failed to parse fresh state before merge:", e);
      }
    } else {
      currentAnswered = previousAnswered;
      currentPendingManager = previousPendingManager;
      currentPendingAiIds = previousPendingAiIds;
    }

    // 5. ทำความสะอาด ActivityLog ของคำถาม AI เดิมที่ค้างอยู่และยังไม่ถูกตอบ เพื่อไม่ให้ซ้ำซ้อน
    if (currentPendingAiIds.length > 0) {
      await prisma.activityLog.deleteMany({
        where: {
          opportunityId: dealId,
          OR: currentPendingAiIds.map(id => ({
            content: { startsWith: `[URGENT_CALL:${id}]` },
          })),
        },
      }).catch(err => {
        console.warn("[AI Accelerator] Failed to clean up old AI questions ActivityLogs:", err);
      });
    }

    // 6. บันทึกคำถาม AI ใหม่ลงใน ActivityLog เพื่อให้แสดงในหน้า Activity Tab ทันทีเหมือน Manager Call
    if (actorId) {
      for (const q of newQuestions) {
        await prisma.activityLog.create({
          data: {
            content: `[URGENT_CALL:${q.id}] ${q.question}`,
            type: "COMMENT",
            opportunityId: dealId,
            userId: actorId,
          },
        }).catch(err => {
          console.warn("[AI Accelerator] Failed to create ActivityLog for AI question:", err);
        });
      }
    }

    // รวมคำถามใหม่ + คำถามล่าสุดที่ตอบแล้ว + Manager Call ล่าสุดที่ยังค้าง (Atomic Merge)
    const combinedQuestions: AcceleratorQuestion[] = [
      ...currentAnswered,
      ...currentPendingManager,
      ...newQuestions,
    ];

    const state: DealAcceleratorsState = {
      targetGoal: effectiveGoal || aiResult.data.targetGoal || `บรรลุเป้าหมายการ์ด ${deal.topic}`,
      goalSource: effectiveGoal ? "USER_OVERRIDE" : "AI_INFERRED",
      questions: combinedQuestions,
      lastGeneratedAt: now,
      updatedAt: now,
    };

    // บันทึกลง SystemConfig
    await prisma.systemConfig.upsert({
      where: { id: `deal_accelerators_${dealId}` },
      update: { googleRefreshToken: JSON.stringify(state) },
      create: { id: `deal_accelerators_${dealId}`, googleRefreshToken: JSON.stringify(state) },
    });

    const pendingCount = combinedQuestions.filter(q => q.status === "PENDING").length;

    // แจ้งเตือน real-time ผ่าน Pusher พร้อมส่ง payload ให้ client อัปเดตทันที
    await notifyPrivatePipelineUpdate(dealId, {
      action: 'DEAL_ACCELERATORS_UPDATED',
      dealId,
      state,
      pendingCount,
      question: newQuestions[0] || undefined,
      questions: newQuestions,
    }).catch(err => {
      console.warn("[AI Accelerator] Pusher notify error:", err);
    });

    // ส่งการแจ้งเตือน (Notification Bell) ไปยังเจ้าของดีลและทีมเมื่อ AI สร้างคำถามใหม่ (Awaited with Idempotency)
    if (newQuestions.length > 0 && deal) {
      try {
        const recipientIds = new Set<string>();
        if (deal.owner?.id) recipientIds.add(deal.owner.id);
        for (const m of deal.teamMembers || []) {
          if (m.id) recipientIds.add(m.id);
        }
        if (actorId) recipientIds.delete(actorId);

        if (recipientIds.size > 0) {
          // Idempotency: filter out recipients who received an alert for this deal in the last 15 minutes
          const recentAlerts = await prisma.notification.findMany({
            where: {
              referenceId: dealId,
              type: "SYSTEM_ALERT",
              recipientId: { in: [...recipientIds] },
              createdAt: { gt: new Date(Date.now() - 15 * 60 * 1000) },
            },
            select: { recipientId: true },
          });
          const recentRecipientIds = new Set(recentAlerts.map(a => a.recipientId));
          const targetRecipientIds = [...recipientIds].filter(id => !recentRecipientIds.has(id));

          if (targetRecipientIds.length > 0) {
            const notifData = targetRecipientIds.map(recipientId => ({
              type: "SYSTEM_ALERT" as const,
              senderId: actorId || null,
              recipientId,
              referenceId: dealId,
              title: "AI Accelerator (มีคำถามเร่งด่วน)",
              message: `AI ผู้ช่วยได้วิเคราะห์งานและส่งคำถามเร่งด่วนในการ์ด "${deal.topic}": "${newQuestions[0].question}"`,
            }));

            const createdNotifs = await prisma.$transaction(
              notifData.map(data => 
                prisma.notification.create({ 
                  data, 
                  include: { 
                    sender: {
                      select: { id: true, name: true, image: true, role: true }
                    } 
                  } 
                })
              )
            );
            await Promise.all(
              createdNotifs.map(n => dispatchNotification(n.recipientId, n))
            );
          }
        }
      } catch (notifErr) {
        console.warn("[AI Accelerator] Failed to send bell notifications for AI questions:", notifErr);
      }
    }


    return { success: true, data: state };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to generate accelerators";
    console.error("[AI Accelerator] generateDealAccelerators error:", msg);
    return { success: false, error: msg };
  }
}

/**
 * บันทึกคำตอบของเซลล์ / ผู้ใช้งาน สำหรับคำถามของ AI Accelerator หรือ Manager Call (1-Click Answer)
 * อนุญาตให้ใครก็ได้ในกลุ่ม/ทีมที่มีสิทธิ์เข้าถึงดีลนี้สามารถตอบคำถามได้
 */
export async function answerDealAccelerator(
  dealId: string,
  questionId: string,
  answer: string,
  options?: { bypassAuth?: boolean; userName?: string; userImage?: string }
): Promise<{ success: boolean; data?: DealAcceleratorsState; error?: string }> {
  try {
    let userName = options?.userName || "ผู้ใช้งาน";
    let userImage = options?.userImage;
    let currentActorId = "";
    if (!options?.bypassAuth) {
      // ตรวจสอบสิทธิ์: อนุญาตให้ทุกคนที่มีสิทธิ์เข้าถึงดีลนี้ (เช่น อยู่ในกลุ่ม/ทีม, เจ้าของดีล, ผู้จัดการ, Admin) ตอบได้
      const { actor } = await requireOpportunityAccess(dealId, { capability: 'deal:interact' });
      currentActorId = actor.id;
      const session = await getServerSession(authOptions);
      userName = session?.user?.name || options?.userName || "ผู้ใช้งาน";
      userImage = session?.user?.image || userImage;
    }

    const configRow = await prisma.systemConfig.findUnique({
      where: { id: `deal_accelerators_${dealId}` },
    });

    if (!configRow?.googleRefreshToken) {
      return { success: false, error: "ไม่พบชุดคำถามนี้" };
    }

    const state: DealAcceleratorsState = JSON.parse(configRow.googleRefreshToken);

    // 1. ค้นหา targetQ: เริ่มจาก ID ก่อน ถ้าไม่พบให้ fallback หาคำถามที่ยัง PENDING และมีข้อความตรงกัน
    let targetQ = (state.questions || []).find(q => q.id === questionId);
    if (!targetQ) {
      targetQ = (state.questions || []).find(
        q => q.status === "PENDING" && (q.question.trim().toLowerCase() === questionId.trim().toLowerCase() || q.id.includes(questionId) || questionId.includes(q.id))
      );
    }
    if (!targetQ) {
      // Fallback 2: ถ้ามีคำถามค้างอยู่เพียง 1 ข้อ ให้เลือกข้อนั้นเลย
      const pendingQuestions = (state.questions || []).filter(q => q.status === "PENDING");
      if (pendingQuestions.length === 1) {
        targetQ = pendingQuestions[0];
      }
    }

    if (!targetQ) {
      return { success: false, error: "ไม่พบคำถามที่ระบุ" };
    }

    const now = new Date().toISOString();
    const cleanAnswer = answer.trim();
    const targetText = targetQ.question.trim().toLowerCase();

    // 2. อัปเดต targetQ เป็น ANSWERED
    const isPreviousAnswered = targetQ.status === "ANSWERED" && Boolean(targetQ.answer);
    if (isPreviousAnswered) {
      targetQ.isEdited = true;
      targetQ.editedAt = now;
    }

    targetQ.answer = cleanAnswer;
    targetQ.answeredBy = userName;
    targetQ.answeredByImage = userImage;
    targetQ.answeredAt = now;
    targetQ.status = "ANSWERED";

    // 3. กำจัดคำถามซ้ำซ้อน (Deduplication): หากมีคำถามอื่นใน state ที่มีข้อความเดียวกัน
    // ให้มาร์กเป็น ANSWERED ด้วย เพื่อไม่ให้มีคำถามตกค้างใน Pending Calls
    state.questions = (state.questions || []).map(q => {
      if (q.id === targetQ!.id) return targetQ!;
      if (q.question.trim().toLowerCase() === targetText) {
        return {
          ...q,
          answer: cleanAnswer,
          answeredBy: userName,
          answeredByImage: userImage,
          answeredAt: now,
          status: "ANSWERED" as const,
        };
      }
      return q;
    });

    // กรองคำถามที่ตอบแล้วให้เหลือเพียง 1 รายการต่อข้อความ เพื่อไม่ให้ Answered History บวมด้วยคำถามซ้ำ
    const seenAnsweredText = new Set<string>();
    const deduplicatedQuestions: AcceleratorQuestion[] = [];
    for (const q of state.questions) {
      if (q.status === "ANSWERED") {
        const textKey = q.question.trim().toLowerCase();
        if (seenAnsweredText.has(textKey)) {
          continue;
        }
        seenAnsweredText.add(textKey);
      }
      deduplicatedQuestions.push(q);
    }
    state.questions = deduplicatedQuestions;
    state.updatedAt = now;

    await prisma.systemConfig.update({
      where: { id: `deal_accelerators_${dealId}` },
      data: { googleRefreshToken: JSON.stringify(state) },
    });

    // 4. ลบ ActivityLog ของ Urgent Call นี้ออก เพื่อไม่ให้ค้างใน Activity feed หลังจากตอบแล้ว
    await prisma.activityLog.deleteMany({
      where: {
        opportunityId: dealId,
        OR: [
          { content: { startsWith: `[URGENT_CALL:${questionId}]` } },
          { content: { startsWith: `[URGENT_CALL:${targetQ.id}]` } },
          {
            AND: [
              { content: { startsWith: `[URGENT_CALL:` } },
              { content: { contains: targetQ.question.trim() } },
            ]
          }
        ],
      },
    }).catch(err => {
      console.warn("[AI Accelerator] Failed to prune answered ActivityLog:", err);
    });

    const pendingCount = state.questions.filter(q => q.status === "PENDING").length;

    // Await Pusher update for real-time multi-user sync with full payload
    await notifyPrivatePipelineUpdate(dealId, {
      action: 'DEAL_ACCELERATORS_UPDATED',
      dealId,
      state,
      pendingCount,
      questionId: targetQ.id,
      answeredQuestion: targetQ,
    }).catch(err => {
      console.warn("[AI Accelerator] Pusher notify error:", err);
    });

    // หากเป็นการตอบคำถามของ Manager Call ให้ส่งการแจ้งเตือน (Notification Bell) ไปยังผู้จัดการที่ส่งคำถามนี้ด้วย
    if (targetQ.source === "MANAGER" && targetQ.askedByUserId && targetQ.askedByUserId !== currentActorId) {
      const deal = await prisma.opportunity.findUnique({
        where: { id: dealId },
        select: { topic: true },
      });
      const notif = await prisma.notification.create({
        data: {
          type: "DEAL_COMMENT",
          senderId: currentActorId || null,
          recipientId: targetQ.askedByUserId,
          referenceId: dealId,
          title: "Manager Call ได้รับคำตอบแล้ว",
          message: `${userName} ได้ตอบคำถามเร่งด่วนในดีล "${deal?.topic || ''}": "${cleanAnswer}"`,
        },
        include: { sender: true },
      }).catch(err => {
        console.warn("[AI Accelerator] Failed to create notification for manager:", err);
        return null;
      });

      if (notif) {
        void dispatchNotification(targetQ.askedByUserId, notif);
      }
    }

    return { success: true, data: state };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to answer accelerator";
    if (msg === "Forbidden") {
      return { success: false, error: "คุณไม่มีสิทธิ์เข้าถึงดีลนี้" };
    }
    return { success: false, error: msg };
  }
}

/**
 * สร้างคำถามด่วนจากฝ่ายบริหาร (Manager Call)
 */
export async function createManagerCallQuestion(
  dealId: string,
  question: string,
  clientGeneratedId?: string
): Promise<{ success: boolean; data?: DealAcceleratorsState; error?: string }> {
  try {
    const { actor } = await requireOpportunityAccess(dealId, { capability: 'deal:interact' });
    if (actor.role !== "ADMIN" && actor.role !== "MANAGEMENT") {
      return { success: false, error: "Only Admin or Management can send Manager Calls" };
    }

    const session = await getServerSession(authOptions);
    const userName = session?.user?.name || "Manager";
    const userImage = session?.user?.image || null;

    const configRow = await prisma.systemConfig.findUnique({
      where: { id: `deal_accelerators_${dealId}` },
    });

    let state: DealAcceleratorsState;
    const now = new Date().toISOString();
    const newQuestionId = clientGeneratedId || `acc_mgr_${Date.now()}`;
    const newQuestion: AcceleratorQuestion = {
      id: newQuestionId,
      question: question.trim(),
      reason: "คำถามด่วนจากฝ่ายบริหาร (Manager Call)",
      status: "PENDING",
      createdAt: now,
      source: "MANAGER",
      askedBy: userName,
      askedByImage: userImage,
      askedByUserId: actor.id,
    };

    const cleanQuestionText = question.trim();
    if (configRow?.googleRefreshToken) {
      state = JSON.parse(configRow.googleRefreshToken);
      // ตรวจสอบว่ามีคำถามเร่งด่วนที่ยัง PENDING และมีข้อความเดียวกันอยู่แล้วหรือไม่
      const existingPendingIndex = (state.questions || []).findIndex(
        q => q.status === "PENDING" && q.question.trim().toLowerCase() === cleanQuestionText.toLowerCase()
      );

      if (existingPendingIndex !== -1) {
        // อัปเดตคำถามเดิม แทนที่จะสร้างคำถามใหม่ซ้ำซ้อน
        state.questions[existingPendingIndex] = {
          ...state.questions[existingPendingIndex],
          id: newQuestionId,
          question: cleanQuestionText,
          createdAt: now,
          askedBy: userName,
          askedByImage: userImage,
          askedByUserId: actor.id,
        };
      } else {
        state.questions = [...(state.questions || []), newQuestion];
      }
      state.updatedAt = now;
    } else {
      state = {
        targetGoal: "บรรลุเป้าหมายการ์ด",
        goalSource: "AI_INFERRED",
        questions: [newQuestion],
        updatedAt: now,
      };
    }

    await prisma.systemConfig.upsert({
      where: { id: `deal_accelerators_${dealId}` },
      update: { googleRefreshToken: JSON.stringify(state) },
      create: { id: `deal_accelerators_${dealId}`, googleRefreshToken: JSON.stringify(state) },
    });

    // ทำความสะอาด ActivityLog ของคำถามเร่งด่วนเดิมที่มีข้อความเดียวกัน เพื่อไม่ให้มีกล่องซ้ำใน Activity feed
    await prisma.activityLog.deleteMany({
      where: {
        opportunityId: dealId,
        AND: [
          { content: { startsWith: `[URGENT_CALL:` } },
          { content: { contains: cleanQuestionText } },
        ],
      },
    }).catch(err => {
      console.warn("[AI Accelerator] Failed to clean up duplicate Manager Call ActivityLogs:", err);
    });

    // บันทึกลงใน ActivityLog เพื่อให้แสดงผลใน Activity Tab
    await prisma.activityLog.create({
      data: {
        content: `[URGENT_CALL:${newQuestionId}] ${cleanQuestionText}`,
        type: "COMMENT",
        opportunityId: dealId,
        userId: actor.id,
      },
    }).catch(err => {
      console.warn("[AI Accelerator] Failed to create ActivityLog for Manager Call:", err);
    });

    const pendingCount = (state.questions || []).filter(q => q.status === "PENDING").length;
    console.log(`[MGR-CALL-SERVER] Created Manager Call questionId="${newQuestionId}" for deal="${dealId}", pendingCount=${pendingCount}. Calling notifyPrivatePipelineUpdate...`);

    // Await Pusher broadcast so all users get the event reliably
    await notifyPrivatePipelineUpdate(dealId, {
      action: "DEAL_ACCELERATORS_UPDATED",
      dealId,
      state,
      pendingCount,
      question: newQuestion,
      questions: [newQuestion],
    }).catch(err => {
      console.warn("[AI Accelerator] Pusher notify error:", err);
    });

    // ส่งการแจ้งเตือน (Notification Bell) ไปยังเจ้าของดีลและสมาชิกทีมที่รับผิดชอบ (Fire-and-forget ตาม Pillar 4)
    void (async () => {
      try {
        const deal = await prisma.opportunity.findUnique({
          where: { id: dealId },
          select: { topic: true, ownerId: true, teamMembers: { select: { id: true } } },
        });

        if (deal) {
          const recipientIds = new Set<string>();
          if (deal.ownerId) recipientIds.add(deal.ownerId);
          for (const m of deal.teamMembers) {
            if (m.id) recipientIds.add(m.id);
          }
          recipientIds.delete(actor.id);
          console.log(`[MGR-CALL-NOTIF] Sending bell notification to ${recipientIds.size} users:`, [...recipientIds]);

          if (recipientIds.size > 0) {
            const notifData = [...recipientIds].map(recipientId => ({
              type: "SYSTEM_ALERT" as const,
              senderId: actor.id,
              recipientId,
              referenceId: dealId,
              title: "Manager Call (ด่วน)",
              message: `${userName} ได้ส่งคำถามด่วนในดีล "${deal.topic}": ${question.trim()}`,
            }));

            const createdNotifs = await prisma.$transaction(
              notifData.map(data => prisma.notification.create({ data, include: { sender: true } }))
            );
            console.log(`[MGR-CALL-NOTIF] Created ${createdNotifs.length} notification records. Triggering Pusher private-user channels...`);
            await Promise.all(
              createdNotifs.map(n => {
                console.log(`[MGR-CALL-NOTIF] Triggering private-user-${n.recipientId} for notification id=${n.id}`);
                return dispatchNotification(n.recipientId, n);
              })
            );
          }
        }
      } catch (notifErr) {
        console.warn("[AI Accelerator] Failed to send bell notifications for Manager Call:", notifErr);
      }
    })();

    return { success: true, data: state };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create manager call";
    return { success: false, error: msg };
  }
}

/**
 * ลบคำถามเร่งงาน (ทั้งของ Manager Call หรือ AI)
 */
export async function deleteDealAcceleratorQuestion(
  dealId: string,
  questionId: string
): Promise<{ success: boolean; data?: DealAcceleratorsState; error?: string }> {
  try {
    const { actor } = await requireOpportunityAccess(dealId, { capability: 'deal:interact' });
    if (actor.role !== "ADMIN" && actor.role !== "MANAGEMENT") {
      return { success: false, error: "Only Admin or Management can delete questions" };
    }

    const configRow = await prisma.systemConfig.findUnique({
      where: { id: `deal_accelerators_${dealId}` },
    });

    if (!configRow?.googleRefreshToken) {
      return { success: false, error: "Question not found" };
    }

    const state: DealAcceleratorsState = JSON.parse(configRow.googleRefreshToken);
    const targetQ = (state.questions || []).find(q => q.id === questionId);
    const questionText = targetQ?.question?.trim();

    state.questions = (state.questions || []).filter(
      q => q.id !== questionId && (!questionText || q.question.trim().toLowerCase() !== questionText.toLowerCase())
    );
    state.updatedAt = new Date().toISOString();

    await prisma.systemConfig.update({
      where: { id: `deal_accelerators_${dealId}` },
      data: { googleRefreshToken: JSON.stringify(state) },
    });

    // ลบ ActivityLog ที่เกี่ยวข้องออก
    await prisma.activityLog.deleteMany({
      where: {
        opportunityId: dealId,
        OR: [
          { content: { startsWith: `[URGENT_CALL:${questionId}]` } },
          ...(questionText ? [{
            AND: [
              { content: { startsWith: `[URGENT_CALL:` } },
              { content: { contains: questionText } },
            ]
          }] : []),
        ],
      },
    }).catch(err => {
      console.warn("[AI Accelerator] Failed to delete ActivityLog for question:", err);
    });

    const pendingCount = state.questions.filter(q => q.status === "PENDING").length;

    await notifyPrivatePipelineUpdate(dealId, {
      action: "DEAL_ACCELERATORS_UPDATED",
      dealId,
      state,
      pendingCount,
      deletedQuestionId: questionId,
    }).catch(err => {
      console.warn("[AI Accelerator] Pusher notify error:", err);
    });

    return { success: true, data: state };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to delete question";
    return { success: false, error: msg };
  }
}

/**
 * อัปเดตเป้าหมายของการ์ด (Target Goal) แบบ Manual โดย User
 */
export async function updateDealTargetGoal(
  dealId: string,
  targetGoal: string,
  options?: { bypassAuth?: boolean }
): Promise<{ success: boolean; data?: DealAcceleratorsState; error?: string }> {
  try {
    if (!options?.bypassAuth) {
      await requireOpportunityAccess(dealId, { capability: 'deal:interact' });
    }

    const configRow = await prisma.systemConfig.findUnique({
      where: { id: `deal_accelerators_${dealId}` },
    });

    let state: DealAcceleratorsState;
    const now = new Date().toISOString();

    if (configRow?.googleRefreshToken) {
      state = JSON.parse(configRow.googleRefreshToken);
      state.targetGoal = targetGoal.trim();
      state.goalSource = "USER_OVERRIDE";
      state.updatedAt = now;
    } else {
      state = {
        targetGoal: targetGoal.trim(),
        goalSource: "USER_OVERRIDE",
        questions: [],
        updatedAt: now,
      };
    }

    await prisma.systemConfig.upsert({
      where: { id: `deal_accelerators_${dealId}` },
      update: { googleRefreshToken: JSON.stringify(state) },
      create: { id: `deal_accelerators_${dealId}`, googleRefreshToken: JSON.stringify(state) },
    });

    const pendingCount = state.questions.filter(q => q.status === "PENDING").length;

    // Await Pusher update for real-time multi-user sync
    await notifyPrivatePipelineUpdate(dealId, {
      action: 'DEAL_ACCELERATORS_UPDATED',
      dealId,
      state,
      pendingCount,
    }).catch(err => {
      console.warn("[AI Accelerator] Pusher notify error:", err);
    });

    return { success: true, data: state };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update target goal";
    return { success: false, error: msg };
  }
}

/**
 * ดึงสถานะจำนวนคำถามที่ยังค้างตอบ สำหรับรายการ Deal IDs ที่ระบุ (เพื่อแสดงป้าย ? บน Kanban Card)
 */
export async function getPendingAcceleratorsMap(
  dealIds: string[]
): Promise<Record<string, PendingAcceleratorInfo>> {
  if (!dealIds || dealIds.length === 0) return {};

  try {
    const ids = dealIds.map(id => `deal_accelerators_${id}`);
    const rows = await prisma.systemConfig.findMany({
      where: { id: { in: ids } },
      select: { id: true, googleRefreshToken: true },
    });

    const result: Record<string, PendingAcceleratorInfo> = {};

    for (const row of rows) {
      if (!row.googleRefreshToken) continue;
      try {
        const state: DealAcceleratorsState = JSON.parse(row.googleRefreshToken);
        const answeredTexts = new Set(
          (state.questions || [])
            .filter(q => q.status === "ANSWERED" && Boolean(q.answer))
            .map(q => q.question.trim().toLowerCase())
        );
        const seenPending = new Set<string>();
        const validPending = (state.questions || []).filter(q => {
          if (q.status !== "PENDING") return false;
          const textKey = q.question.trim().toLowerCase();
          if (answeredTexts.has(textKey) || seenPending.has(textKey)) return false;
          seenPending.add(textKey);
          return true;
        });

        if (validPending.length > 0) {
          const dealId = row.id.replace("deal_accelerators_", "");
          let earliestPendingAt: string | null = null;
          for (const q of validPending) {
            if (q.createdAt) {
              if (!earliestPendingAt || new Date(q.createdAt) < new Date(earliestPendingAt)) {
                earliestPendingAt = q.createdAt;
              }
            }
          }
          result[dealId] = {
            count: validPending.length,
            earliestPendingAt,
          };
        }
      } catch {}
    }

    return result;
  } catch (err) {
    console.error("[AI Accelerator] Failed to get pending map:", err);
    return {};
  }
}

const ACTIVITY_AUTO_GRADE_SCHEMA = {
  type: "object",
  properties: {
    grade: {
      type: "string",
      enum: ["BRIEF_9H", "OUTREACH_27H", "PROGRESS_27H"],
      description:
        "BRIEF_9H = missed call / unanswered phone / vague claim without message text or outcome. OUTREACH_27H = real verbatim message sent to customer OR two-way contact where deal is waiting/blocked. PROGRESS_27H = concrete forward milestone, customer agreement/meeting, document/quote/sample/order completed.",
    },
    reason: {
      type: "string",
      description: "Concise 1-sentence English explanation of the assigned grade.",
    },
  },
  required: ["grade", "reason"],
};

const DUE_DATE_REASON_GRADE_SCHEMA = {
  type: "object",
  properties: {
    classification: {
      type: "string",
      enum: ["STALLING_ONLY", "OUTREACH_ONLY", "PROGRESS_VERIFIED"],
      description:
        "STALLING_ONLY = hollow verbose filler pushing date with zero real contact or action. OUTREACH_ONLY = real message sent or customer asked to hold/wait without advancing a milestone. PROGRESS_VERIFIED = concrete completed task/milestone reported alongside scheduling the next date.",
    },
  },
  required: ["classification"],
};

async function generateStructuredWithRetry<T>(
  run: () => Promise<{ data: T }>
): Promise<{ data: T }> {
  try {
    return await run();
  } catch (err) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return await run().catch(() => {
      throw err;
    });
  }
}

/**
 * Asynchronous v2.2 Zero-Button AI Auto-Grader (`gemini-2.5-flash`).
 * Runs strictly inside `after()` / background job — 0ms latency on chat submission.
 * Evaluates every top-level update that passed deterministic Gate 1 (>= 12 chars, non-boilerplate, non-duplicate)
 * and upgrades/downgrades its `[TIER:...]` tag in real time via Pusher without nagging notifications:
 * - `BRIEF_9H` (`[TIER:9H]` / `[TIER:9H:XX]`): Unanswered phone call or vague unproven status claim (+9h, 0 Progress)
 * - `OUTREACH_27H` (`[TIER:27H:OUTREACH]`): Real verbatim message sent to silent client OR two-way contact while blocked (+27h, 0 Progress)
 * - `PROGRESS_27H` (`[TIER:27H:PROGRESS]`): Concrete forward deal/task milestone (+27h + Genuine Card Progress)
 */
export async function gradeActivityCommentWithAi(params: {
  dealId: string;
  logId: string;
  rawContent: string;
  authorId?: string;
  priorCeilingHours?: number;
}): Promise<void> {
  const { dealId, logId, rawContent, priorCeilingHours } = params;
  try {
    const apiKey =
      process.env.GOOGLE_GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      "";
    if (!apiKey.trim()) return;

    const [deal, currentLog, recentLogs] = await Promise.all([
      prisma.opportunity.findUnique({
        where: { id: dealId },
        select: {
          id: true,
          topic: true,
          type: true,
          stage: { select: { name: true } },
        },
      }),
      prisma.activityLog.findUnique({
        where: { id: logId },
        select: { id: true, content: true },
      }),
      prisma.activityLog.findMany({
        where: {
          opportunityId: dealId,
          parentId: null,
          type: "COMMENT",
          id: { not: logId },
          NOT: [
            { content: { startsWith: "[URGENT_" } },
            { content: { startsWith: "[DUE DATE:" } },
          ],
        },
        select: { content: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 3,
      }),
    ]);

    if (
      !deal ||
      !currentLog ||
      currentLog.content.startsWith("[TIER:0H]") ||
      currentLog.content.startsWith("[DUE DATE:") ||
      currentLog.content.startsWith("[URGENT_")
    ) {
      return;
    }

    const parsedCurrent = parseTierPrefix(currentLog.content);
    const cleanSubmitted = parsedCurrent.cleanContent.trim();
    if (!cleanSubmitted) return;

    // Skip if comment was already edited to something different before this background job started
    const expectedClean = parseTierPrefix(rawContent).cleanContent.trim();
    if (expectedClean && cleanSubmitted !== expectedClean) {
      return;
    }

    const hasProofSignal = hasVerifiableProofSignal(cleanSubmitted);
    const recentHistory =
      recentLogs.length === 0
        ? "None"
        : recentLogs
            .map((l) => `- ${parseTierPrefix(l.content).cleanContent.trim().slice(0, 280)}`)
            .join("\n");

    const systemInstruction = `You are an objective, fair CRM Activity Auto-Grader classifying a Pipeline update into 1 of 3 grades (Sales Deal or Internal Task: ${deal.type}):
1. BRIEF_9H (+9h timer, 0 Progress):
   - Unanswered call / line busy / unreachable (e.g. "โทรหาไม่รับสาย พรุ่งนี้โทรใหม่", "Called buyer, no answer"), OR
   - Vague unproven claim ("ทักไลน์ตามงานลูกค้าแล้ว รอตอบกลับ", "กำลังประสานงานอยู่ครับ") with NO actual message text, NO attachment/link/number, and NO customer reply or completed step.
2. OUTREACH_27H (+27h full 3-workday timer, 0 Card Progress):
   - REAL OUTBOUND MESSAGE TO SILENT CUSTOMER: The user pasted/quoted the actual substantive follow-up message or email sent (e.g. "09:01 สวัสดีครับคุณฝน เป็นอย่างไรบ้างครับ มีได้ลองใช้สินค้าดูบ้างมั้ยครับ", "Dear John, checking in on your sample feedback...") OR attached a file/chat screenshot with caption — grant OUTREACH_27H even if the customer has NOT replied yet so reps are never forced to pester silent B2B clients daily!
   - TWO-WAY CONTACT / EXTERNAL HOLD: Spoke with customer/vendor and learned why the deal is waiting (e.g. "คุณฝนแจ้งว่าของตัวอย่างเพิ่งขึ้นตู้ต้นเดือน July", "ลูกค้าขอรอประชุมบอร์ดสัปดาห์หน้า"), without a new forward milestone yet.
3. PROGRESS_27H (+27h full timer + Genuine Card Progress):
   - Concrete forward milestone achieved: customer accepted/scheduled a meeting ("ลูกค้าตอบรับและนัดหมายเข้าพบวันศุกร์ บ่ายโมง"), confirmed specs/price/artwork/formula, requested or received quotation/sample/PI/PO/invoice, placed order, paid deposit, OR an internal task/admin/R&D/shipping step was completed.`;

    const prompt = `Card: ${deal.topic} (${deal.type}, Stage: ${deal.stage?.name || "N/A"})
ProofSignal: ${hasProofSignal}
Prior 3 updates:
${recentHistory}

New update to grade:
"${cleanSubmitted.slice(0, 1200)}"`;

    const adapter = aiGateway.getAdapter("GOOGLE_GEMINI");
    const aiResult = await generateStructuredWithRetry(() =>
      adapter.generateStructured<{
        grade: Exclude<UpdateGrade, "NOTE_0H">;
        reason: string;
      }>({
        providerKey: "GOOGLE_GEMINI",
        modelId: "gemini-2.5-flash",
        secretKey: apiKey,
        systemInstruction,
        prompt,
        schema: ACTIVITY_AUTO_GRADE_SCHEMA,
        temperature: 0.1,
        maxOutputTokens: 160,
        timeoutMs: 12000,
      })
    );

    const targetGrade = aiResult.data.grade;
    if (
      targetGrade !== "BRIEF_9H" &&
      targetGrade !== "OUTREACH_27H" &&
      targetGrade !== "PROGRESS_27H"
    ) {
      return;
    }

    const effectiveHoursFor9h =
      targetGrade === "BRIEF_9H"
        ? priorCeilingHours ??
          (parsedCurrent.tier === "9H" ? parsedCurrent.effectiveHours : undefined)
        : undefined;

    const nextContent = encodeTierPrefix(cleanSubmitted, targetGrade, effectiveHoursFor9h);
    if (nextContent === currentLog.content) {
      return;
    }

    // Optimistic concurrency guard: only update if log content was not concurrently edited
    const updateRes = await prisma.activityLog.updateMany({
      where: { id: logId, content: currentLog.content },
      data: { content: nextContent },
    });
    if (updateRes.count === 0) return;

    const updatedLog = await prisma.activityLog.findUnique({
      where: { id: logId },
      include: {
        user: true,
        replies: { include: { user: true }, orderBy: { createdAt: "asc" } },
      },
    });

    if (updatedLog) {
      await notifyPrivatePipelineUpdate(dealId, {
        action: "ACTIVITY_UPDATED",
        dealId,
        activityLog: updatedLog,
      }).catch(() => {});
    }

    void dispatchDashboardInvalidation({
      resources: ["leaderboard"],
    }).catch(() => {});
  } catch (err) {
    console.warn("[AI Auto-Grader] Non-blocking background grade skipped:", err);
  }
}

/**
 * Asynchronous AI Audit for long Due Date `Reason:` logs (`>= 22` compact chars)
 * so verbose stalling inside a Due Date change cannot farm Card Progress XP or bypass `Postponed x2+`.
 */
export async function gradeDueDateReasonWithAi(params: {
  dealId: string;
  logId: string;
  rawContent: string;
}): Promise<void> {
  const { dealId, logId } = params;
  try {
    const apiKey =
      process.env.GOOGLE_GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      "";
    if (!apiKey.trim()) return;

    const [deal, currentLog] = await Promise.all([
      prisma.opportunity.findUnique({
        where: { id: dealId },
        select: { id: true, topic: true, type: true },
      }),
      prisma.activityLog.findUnique({
        where: { id: logId },
        select: { id: true, content: true },
      }),
    ]);

    if (!deal || !currentLog || !currentLog.content.startsWith("[DUE DATE:")) return;
    const match = currentLog.content.match(/^(\[DUE DATE:\s*[^\]\n]+\]\s*\nReason:\s*)([\s\S]*)$/i);
    if (!match) return;

    const headerPrefix = match[1];
    const cleanReason = (match[2] || "")
      .replace(/^\[(?:STALLING_ONLY|OUTREACH_ONLY|PROGRESS_VERIFIED)\]\s*/i, "")
      .trim();
    if (!cleanReason) return;

    const systemInstruction = `Classify a CRM Due Date scheduling reason into 1 of 3 categories (${deal.type}):
- STALLING_ONLY: Verbose filler pushing the date forward with zero real customer message, zero external reason, and zero completed action (e.g. "ขอเลื่อนวันติดตามลูกค้าออกไปเป็นสัปดาห์หน้าเพื่อรอดำเนินการต่อ").
- OUTREACH_ONLY: Legitimate customer/factory hold or real outbound follow-up message sent, but no forward milestone completed yet (e.g. "ทักคุณฝนแล้ว แจ้งว่าของตัวอย่างเพิ่งขึ้นตู้ ขอนัดตามต้นเดือนหน้า", "ติดขั้นตอนพิจารณาเครื่องหมายการค้า กรมทรัพย์สินทางปัญญา").
- PROGRESS_VERIFIED: Reports a concrete completed step/deliverable/agreement AND schedules the next milestone (e.g. "ดึงใบเสร็จรอบ ต.ค. ส่งบัญชีครบแล้ว นัดรอบถัดไป พ.ย.", "ส่งตัวอย่างสูตร v2 ให้ลูกค้าแล้ว นัดฟังผลสัปดาห์หน้า").`;

    const adapter = aiGateway.getAdapter("GOOGLE_GEMINI");
    const aiResult = await generateStructuredWithRetry(() =>
      adapter.generateStructured<{
        classification: "STALLING_ONLY" | "OUTREACH_ONLY" | "PROGRESS_VERIFIED";
      }>({
        providerKey: "GOOGLE_GEMINI",
        modelId: "gemini-2.5-flash",
        secretKey: apiKey,
        systemInstruction,
        prompt: `Card: ${deal.topic}\nDue Date Reason: "${cleanReason.slice(0, 800)}"`,
        schema: DUE_DATE_REASON_GRADE_SCHEMA,
        temperature: 0.1,
        maxOutputTokens: 80,
        timeoutMs: 12000,
      })
    );

    const tag = aiResult.data.classification;
    if (tag !== "STALLING_ONLY" && tag !== "OUTREACH_ONLY" && tag !== "PROGRESS_VERIFIED") {
      return;
    }

    const nextContent = `${headerPrefix}[${tag}] ${cleanReason}`;
    if (nextContent === currentLog.content) return;

    const updateRes = await prisma.activityLog.updateMany({
      where: { id: logId, content: currentLog.content },
      data: { content: nextContent },
    });
    if (updateRes.count === 0) return;

    const updatedLog = await prisma.activityLog.findUnique({
      where: { id: logId },
      include: {
        user: true,
        replies: { include: { user: true }, orderBy: { createdAt: "asc" } },
      },
    });
    if (updatedLog) {
      await notifyPrivatePipelineUpdate(dealId, {
        action: "ACTIVITY_UPDATED",
        dealId,
        activityLog: updatedLog,
      }).catch(() => {});
    }

    void dispatchDashboardInvalidation({
      resources: ["leaderboard"],
    }).catch(() => {});
  } catch (err) {
    console.warn("[AI DueDate Grader] Non-blocking background check skipped:", err);
  }
}

/** Backwards-compatible alias for `gradeActivityCommentWithAi` */
export async function auditProgressCommentWithAi(params: {
  dealId: string;
  logId: string;
  rawContent: string;
  authorId: string;
}): Promise<void> {
  return gradeActivityCommentWithAi(params);
}
