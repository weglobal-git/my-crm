"use server";

import prisma from "@/lib/prisma";
import { requireOpportunityAccess } from "@/lib/pipeline-security";
import { aiGateway } from "@/lib/ai/gateway";
import { GoogleGeminiAdapter } from "@/lib/ai/adapters/gemini";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Ensure Gemini adapter is registered
aiGateway.registerAdapter("GOOGLE_GEMINI", new GoogleGeminiAdapter());

export interface AcceleratorQuestion {
  id: string;
  question: string;
  reason: string;
  choices: string[];
  answer?: string | null;
  answeredBy?: string | null;
  answeredByImage?: string | null;
  answeredAt?: string | null;
  isEdited?: boolean;
  editedAt?: string | null;
  createdAt?: string | null;
  status: "PENDING" | "ANSWERED" | "DISMISSED";
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
 * ดึงข้อมูล AI Accelerators และเป้าหมายของดีล
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
    if (!options?.bypassAuth) {
      await requireOpportunityAccess(dealId);
    }

    // 1. ดึงข้อมูลดีลและบริบททั้งหมด
    const deal = await prisma.opportunity.findUnique({
      where: { id: dealId },
      include: {
        stage: true,
        company: true,
        owner: true,
      },
    });

    if (!deal) {
      return { success: false, error: "ไม่พบข้อมูลดีลนี้ในระบบ" };
    }

    const logs = await prisma.activityLog.findMany({
      where: { opportunityId: dealId },
      include: { user: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    });

    const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
    if (!apiKey.trim()) {
      return { success: false, error: "ยังไม่ได้ตั้งค่า GOOGLE_GEMINI_API_KEY ในไฟล์ .env" };
    }

    // 2. ดึงประวัติ Accelerators เดิม (ถ้ามีคำถามที่ตอบแล้ว ให้เก็บไว้)
    const existingRow = await prisma.systemConfig.findUnique({
      where: { id: `deal_accelerators_${dealId}` },
    });
    let previousAnswered: AcceleratorQuestion[] = [];
    let savedGoal = customGoal;

    if (existingRow?.googleRefreshToken) {
      try {
        const prev: DealAcceleratorsState = JSON.parse(existingRow.googleRefreshToken);
        if (prev.questions) {
          previousAnswered = prev.questions.filter(q => q.status === "ANSWERED");
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
      id: q.id || `acc_${Date.now()}_${idx}`,
      question: q.question,
      reason: q.reason,
      choices: q.choices && q.choices.length > 0 ? q.choices : ["ยืนยันเรียบร้อย", "ยังค้างอยู่", "เลื่อนกำหนด"],
      status: "PENDING",
      createdAt: now,
    }));

    // รวมคำถามใหม่ กับคำถามเก่าที่ตอบแล้ว (รักษาสถิติคำตอบเดิมไว้)
    const combinedQuestions: AcceleratorQuestion[] = [...previousAnswered, ...newQuestions];

    const state: DealAcceleratorsState = {
      targetGoal: savedGoal || aiResult.data.targetGoal || `บรรลุเป้าหมายการ์ด ${deal.topic}`,
      goalSource: savedGoal ? "USER_OVERRIDE" : "AI_INFERRED",
      questions: combinedQuestions,
      lastGeneratedAt: now,
      updatedAt: now,
    };

    // บันทึกลง SystemConfig (ไม่แตะ ActivityLog เด็ดขาด เพื่อคงการ์ดแดงไว้)
    await prisma.systemConfig.upsert({
      where: { id: `deal_accelerators_${dealId}` },
      update: { googleRefreshToken: JSON.stringify(state) },
      create: { id: `deal_accelerators_${dealId}`, googleRefreshToken: JSON.stringify(state) },
    });

    return { success: true, data: state };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to generate accelerators";
    console.error("[AI Accelerator] generateDealAccelerators error:", msg);
    return { success: false, error: msg };
  }
}

/**
 * บันทึกคำตอบของเซลล์ / ผู้ใช้งาน สำหรับคำถามของ AI Accelerator (1-Click Answer)
 * อนุญาตเฉพาะ Admin หรือ Card Owner เท่านั้น
 * ไม่แตะ ActivityLog เด็ดขาดตามข้อกำหนดของผู้ใช้ เพื่อคงสีแดงของการ์ดไว้จนกว่างานจะเดินจริง
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

    return { success: true, data: state };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update target goal";
    return { success: false, error: msg };
  }
}

/**
 * ดึงสถานะจำนวนคำถามที่ยังค้างตอบ สำหรับรายการ Deal IDs ที่ระบุ (เพื่อแสดงป้าย ? บน Kanban Card)
 */
export async function getPendingAcceleratorsMap(dealIds: string[]): Promise<Record<string, number>> {
  if (!dealIds || dealIds.length === 0) return {};

  try {
    const ids = dealIds.map(id => `deal_accelerators_${id}`);
    const rows = await prisma.systemConfig.findMany({
      where: { id: { in: ids } },
      select: { id: true, googleRefreshToken: true },
    });

    const result: Record<string, number> = {};

    for (const row of rows) {
      if (!row.googleRefreshToken) continue;
      try {
        const state: DealAcceleratorsState = JSON.parse(row.googleRefreshToken);
        const pendingCount = (state.questions || []).filter(q => q.status === "PENDING").length;
        if (pendingCount > 0) {
          const dealId = row.id.replace("deal_accelerators_", "");
          result[dealId] = pendingCount;
        }
      } catch {}
    }

    return result;
  } catch (err) {
    console.error("[AI Accelerator] Failed to get pending map:", err);
    return {};
  }
}
