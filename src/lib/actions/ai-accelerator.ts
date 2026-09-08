"use server";

import prisma from "@/lib/prisma";
import { requireOpportunityAccess, notifyPrivatePipelineUpdate } from "@/lib/pipeline-security";
import { aiGateway } from "@/lib/ai/gateway";
import { GoogleGeminiAdapter } from "@/lib/ai/adapters/gemini";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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
      description: "คำถามเจาะจงจุดคอขวดที่ยังขาดหาย 1-2 ข้อ เพื่อช่วยให้บรรลุเป้าหมายได้เร็วขึ้น (ถ้าข้อมูลครบถ้วนแล้วสามารถเป็นอาร์เรย์ว่างได้)",
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
      await requireOpportunityAccess(dealId);
    }

    const configRow = await prisma.systemConfig.findUnique({
      where: { id: `deal_accelerators_${dealId}` },
    });

    if (configRow?.googleRefreshToken) {
      try {
        const state: DealAcceleratorsState = JSON.parse(configRow.googleRefreshToken);
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
      const access = await requireOpportunityAccess(dealId);
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
3. ตั้งคำถาม 1-2 ข้อที่เฉียบคมและตรงประเด็นที่สุด พร้อมสร้างตัวเลือก Choice 2-3 ตัวเลือกสั้นๆ ที่ให้ผู้รับผิดชอบงานกดตอบได้ทันทีใน 1 วินาที

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
    const newQuestions: AcceleratorQuestion[] = (aiResult.data.questions || []).map((q, idx) => ({
      id: `acc_ai_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      question: q.question,
      reason: q.reason,
      choices: q.choices && q.choices.length > 0 ? q.choices : ["ยืนยันเรียบร้อย", "ยังค้างอยู่", "เลื่อนกำหนด"],
      status: "PENDING",
      createdAt: now,
      source: "AI",
      askedBy: "AI Assistant",
    }));

    // 4. ทำความสะอาด ActivityLog ของคำถาม AI เดิมที่ค้างอยู่และยังไม่ถูกตอบ เพื่อไม่ให้ซ้ำซ้อน
    if (previousPendingAiIds.length > 0) {
      await prisma.activityLog.deleteMany({
        where: {
          opportunityId: dealId,
          OR: previousPendingAiIds.map(id => ({
            content: { startsWith: `[URGENT_CALL:${id}]` },
          })),
        },
      }).catch(err => {
        console.warn("[AI Accelerator] Failed to clean up old AI questions ActivityLogs:", err);
      });
    }

    // 5. บันทึกคำถาม AI ใหม่ลงใน ActivityLog เพื่อให้แสดงในหน้า Activity Tab ทันทีเหมือน Manager Call
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

    // รวมคำถามใหม่ + คำถามเก่าที่ตอบแล้ว + Manager Call เดิมที่ยังค้าง
    const combinedQuestions: AcceleratorQuestion[] = [
      ...previousAnswered,
      ...previousPendingManager,
      ...newQuestions,
    ];

    const state: DealAcceleratorsState = {
      targetGoal: savedGoal || aiResult.data.targetGoal || `บรรลุเป้าหมายการ์ด ${deal.topic}`,
      goalSource: savedGoal ? "USER_OVERRIDE" : "AI_INFERRED",
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
      questions: newQuestions,
    }).catch(err => {
      console.warn("[AI Accelerator] Pusher notify error:", err);
    });

    return { success: true, data: state };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to generate accelerators";
    console.error("[AI Accelerator] generateDealAccelerators error:", msg);
    return { success: false, error: msg };
  }
}

/**
 * บันทึกคำตอบของเซลล์ / ผู้ใช้งาน สำหรับคำถามของ AI Accelerator หรือ Manager Call (1-Click Answer)
 * อนุญาตเฉพาะ Admin หรือ Card Owner เท่านั้น
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
    if (!options?.bypassAuth) {
      // ตรวจสอบสิทธิ์: ต้องเป็น Admin หรือ Card Owner เท่านั้น
      await requireOpportunityAccess(dealId, { ownerOrAdmin: true });
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
    const targetQ = state.questions.find(q => q.id === questionId);
    if (!targetQ) {
      return { success: false, error: "ไม่พบคำถามที่ระบุ" };
    }

    const isPreviousAnswered = targetQ.status === "ANSWERED" && Boolean(targetQ.answer);
    if (isPreviousAnswered) {
      targetQ.isEdited = true;
      targetQ.editedAt = new Date().toISOString();
    }

    targetQ.answer = answer;
    targetQ.answeredBy = userName;
    targetQ.answeredByImage = userImage;
    targetQ.answeredAt = new Date().toISOString();
    targetQ.status = "ANSWERED";
    state.updatedAt = new Date().toISOString();

    await prisma.systemConfig.update({
      where: { id: `deal_accelerators_${dealId}` },
      data: { googleRefreshToken: JSON.stringify(state) },
    });

    // ลบ ActivityLog ของ Urgent Call นี้ออก เพื่อไม่ให้ค้างใน Activity feed หลังจากตอบแล้ว
    await prisma.activityLog.deleteMany({
      where: {
        opportunityId: dealId,
        content: { startsWith: `[URGENT_CALL:${questionId}]` },
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
      questionId,
      answeredQuestion: targetQ,
    }).catch(err => {
      console.warn("[AI Accelerator] Pusher notify error:", err);
    });

    return { success: true, data: state };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to answer accelerator";
    if (msg === "Forbidden") {
      return { success: false, error: "เฉพาะเจ้าของดีล (Card Owner) หรือ Admin เท่านั้นที่สามารถตอบคำถามนี้ได้" };
    }
    return { success: false, error: msg };
  }
}

/**
 * สร้างคำถามด่วนจากฝ่ายบริหาร (Manager Call)
 */
export async function createManagerCallQuestion(
  dealId: string,
  question: string
): Promise<{ success: boolean; data?: DealAcceleratorsState; error?: string }> {
  try {
    const { actor } = await requireOpportunityAccess(dealId);
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
    const newQuestionId = `acc_mgr_${Date.now()}`;
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

    if (configRow?.googleRefreshToken) {
      state = JSON.parse(configRow.googleRefreshToken);
      state.questions = [...(state.questions || []), newQuestion];
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

    // บันทึกลงใน ActivityLog ด้วย เพื่อให้แสดงผลใน Activity Tab
    await prisma.activityLog.create({
      data: {
        content: `[URGENT_CALL:${newQuestionId}] ${question.trim()}`,
        type: "COMMENT",
        opportunityId: dealId,
        userId: actor.id,
      },
    }).catch(err => {
      console.warn("[AI Accelerator] Failed to create ActivityLog for Manager Call:", err);
    });

    const pendingCount = state.questions.filter(q => q.status === "PENDING").length;

    // Await Pusher broadcast so all users get the event reliably
    await notifyPrivatePipelineUpdate(dealId, {
      action: "DEAL_ACCELERATORS_UPDATED",
      dealId,
      state,
      pendingCount,
      question: newQuestion,
    }).catch(err => {
      console.warn("[AI Accelerator] Pusher notify error:", err);
    });

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
    const { actor } = await requireOpportunityAccess(dealId);
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
    state.questions = (state.questions || []).filter(q => q.id !== questionId);
    state.updatedAt = new Date().toISOString();

    await prisma.systemConfig.update({
      where: { id: `deal_accelerators_${dealId}` },
      data: { googleRefreshToken: JSON.stringify(state) },
    });

    // ลบ ActivityLog ที่เกี่ยวข้องออก
    await prisma.activityLog.deleteMany({
      where: {
        opportunityId: dealId,
        content: { startsWith: `[URGENT_CALL:${questionId}]` },
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
      await requireOpportunityAccess(dealId);
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
        const pendingQuestions = (state.questions || []).filter(q => q.status === "PENDING");
        if (pendingQuestions.length > 0) {
          const dealId = row.id.replace("deal_accelerators_", "");
          let earliestPendingAt: string | null = null;
          for (const q of pendingQuestions) {
            if (q.createdAt) {
              if (!earliestPendingAt || new Date(q.createdAt) < new Date(earliestPendingAt)) {
                earliestPendingAt = q.createdAt;
              }
            }
          }
          result[dealId] = {
            count: pendingQuestions.length,
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
