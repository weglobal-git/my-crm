"use server";

import prisma from "@/lib/prisma";
import { requireOpportunityAccess } from "@/lib/pipeline-security";
import { aiGateway } from "@/lib/ai/gateway";
import { GoogleGeminiAdapter } from "@/lib/ai/adapters/gemini";

// Ensure Gemini adapter is registered
aiGateway.registerAdapter("GOOGLE_GEMINI", new GoogleGeminiAdapter());

export interface DealSummaryData {
  overview?: string;
  keyHighlights?: string[];
  blockers?: string[];
  nextSteps?: string[];
  [key: string]: unknown;
}

export interface DealSummaryUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  costThb: number;
}

export interface DealSummaryResponse {
  success: boolean;
  data?: DealSummaryData;
  generatedAt?: string;
  isOutdated?: boolean;
  newerActivitiesCount?: number;
  usage?: DealSummaryUsage;
  error?: string;
  message?: string;
}

function calculateGeminiCost(inputTokens: number, outputTokens: number) {
  const USD_TO_THB = 35.5;
  // Gemini 1.5 / 2.5 Flash pricing: $0.075 / 1M input tokens, $0.30 / 1M output tokens
  const inputCostUsd = (inputTokens / 1_000_000) * 0.075;
  const outputCostUsd = (outputTokens / 1_000_000) * 0.30;
  const costUsd = inputCostUsd + outputCostUsd;
  const costThb = costUsd * USD_TO_THB;
  return { costUsd, costThb };
}

async function recordMonthlyAiUsage(inputTokens: number, outputTokens: number, totalTokens: number, costUsd: number, costThb: number) {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;
  const configId = `ai_monthly_usage_${yearMonth}`;

  try {
    const existing = await prisma.systemConfig.findUnique({ where: { id: configId } });
    let data = {
      yearMonth,
      totalCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      costThb: 0,
      budgetLimitUsd: 1.00,
      updatedAt: now.toISOString(),
    };

    if (existing?.googleRefreshToken) {
      try {
        data = { ...data, ...JSON.parse(existing.googleRefreshToken) };
      } catch {}
    }

    data.totalCalls += 1;
    data.inputTokens += inputTokens;
    data.outputTokens += outputTokens;
    data.totalTokens += totalTokens;
    data.costUsd += costUsd;
    data.costThb += costThb;
    data.updatedAt = now.toISOString();

    await prisma.systemConfig.upsert({
      where: { id: configId },
      update: { googleRefreshToken: JSON.stringify(data) },
      create: { id: configId, googleRefreshToken: JSON.stringify(data) },
    });
  } catch (err) {
    console.error("[AI Usage] Failed to record monthly usage:", err);
  }
}

async function checkAiBudget(): Promise<{ allowed: boolean; monthlyCostUsd: number; budgetLimitUsd: number }> {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;
  const configId = `ai_monthly_usage_${yearMonth}`;

  let budgetLimitUsd = 1.00;
  try {
    const globalCfg = await prisma.systemConfig.findUnique({ where: { id: "ai_budget_limit" } });
    if (globalCfg?.googleRefreshToken) {
      const parsed = JSON.parse(globalCfg.googleRefreshToken);
      if (typeof parsed.limitUsd === "number") budgetLimitUsd = parsed.limitUsd;
    }
  } catch {}

  try {
    const existing = await prisma.systemConfig.findUnique({ where: { id: configId } });
    if (existing?.googleRefreshToken) {
      const data = JSON.parse(existing.googleRefreshToken);
      const monthlyCostUsd = data.costUsd || 0;
      const effectiveLimit = budgetLimitUsd || data.budgetLimitUsd || 1.00;
      if (monthlyCostUsd >= effectiveLimit) {
        return { allowed: false, monthlyCostUsd, budgetLimitUsd: effectiveLimit };
      }
      return { allowed: true, monthlyCostUsd, budgetLimitUsd: effectiveLimit };
    }
  } catch {}

  return { allowed: true, monthlyCostUsd: 0, budgetLimitUsd };
}

const DEFAULT_DEAL_SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    overview: {
      type: "string",
      description: "สรุปภาพรวม 2-4 บรรทัด ว่าปัจจุบันดีลนี้กำลังดำเนินถึงขั้นไหน มีความคืบหน้าอย่างไร"
    },
    keyHighlights: {
      type: "array",
      items: { type: "string" },
      description: "ข้อตกลง ตัวเลข หรือประเด็นสำคัญล่าสุด 2-4 ข้อ"
    },
    blockers: {
      type: "array",
      items: { type: "string" },
      description: "ปัญหา อุปสรรค หรือสิ่งที่กำลังรอคอย (ถ้าไม่มีให้ระบุข้อความว่าไม่มีข้อติดขัดสำคัญ)"
    },
    nextSteps: {
      type: "array",
      items: { type: "string" },
      description: "สิ่งที่เซลล์หรือทีมควรดำเนินการต่อไป 2-3 ข้อ"
    }
  },
  required: ["overview", "keyHighlights", "blockers", "nextSteps"]
};

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const DEFAULT_SYSTEM_INSTRUCTION = `คุณคือ AI ผู้ช่วยวิเคราะห์และสรุปสถานะงานและโครงการ (CRM Deal & Project Summarizer) สำหรับทีมงานและทีมขาย
หน้าที่ของคุณคืออ่านข้อมูลงาน/ดีล ประวัติกิจกรรมล่าสุด คำตอบจากทีมงาน และเป้าหมายของงาน แล้วสรุปภาพรวมออกมาเป็นภาษาไทยที่กระชับ ตรงไปตรงมา และนำไปปฏิบัติจริงได้ทันที

กฎเกณฑ์สำคัญ:
1. ตอบเป็นภาษาไทยเท่านั้น
2. สรุปเฉพาะข้อเท็จจริงที่มีระบุในข้อมูล ห้ามแต่งเติมข้อมูล ยอดเงิน วันที่ หรือผลลัพธ์เองโดยเด็ดขาด
3. ปรับบริบทตามประเภทของงาน:
   - หากเป็นงานขาย (Sales Deal): มุ่งเน้นสถานะการเจรจา ยอดเงิน ข้อตกลง และการปิดการขาย
   - หากเป็นงานภายใน/โปรเจกต์ (Internal Task): มุ่งเน้นขั้นตอนการดำเนินงาน ความคืบหน้า สิ่งที่ต้องส่งมอบ และผู้รับผิดชอบ
4. ถ้าประวัติยังไม่มีรายละเอียดมากพอ ให้ระบุสถานะตามข้อมูลที่มีอย่างตรงไปตรงมา
5. แยกปัญหา/อุปสรรค (Blockers) และ สิ่งที่ต้องทำต่อ (Next Steps) ให้ชัดเจนเป็นข้อๆ`;

const DEFAULT_TASK_INSTRUCTION = `กรุณาวิเคราะห์ข้อมูลการ์ด ประวัติกิจกรรม และข้อมูลยืนยันล่าสุด แล้วสรุปผลลัพธ์ออกเป็น 4 มิติสำคัญตาม JSON Schema:
1. ภาพรวมสถานะ (Overview): สรุปว่าปัจจุบันงาน/ดีลนี้กำลังดำเนินถึงขั้นไหน มีความคืบหน้าอย่างไร (2-4 บรรทัด)
2. ประเด็นสำคัญ (Key Highlights): ข้อตกลง ตัวเลข วันส่งมอบ หรือข้อมูลสำคัญล่าสุด (1-4 ข้อ)
3. ปัญหาหรืออุปสรรค (Blockers & Risks): ข้อติดขัด ความล่าช้า หรือความเสี่ยงที่ต้องระวัง (ถ้าไม่มีให้ระบุว่าไม่มีข้อติดขัดสำคัญ)
4. สิ่งที่ควรทำต่อไป (Recommended Next Steps): แอ็กชันที่ผู้รับผิดชอบหรือทีมควรดำเนินการต่อไปเพื่อบรรลุเป้าหมาย (1-3 ข้อ)`;

export async function getDefaultPromptConfig(): Promise<{ systemInstruction: string; taskInstruction: string; customInstruction: string }> {
  return {
    systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
    taskInstruction: DEFAULT_TASK_INSTRUCTION,
    customInstruction: "",
  };
}

export async function getDefaultSystemInstruction(): Promise<string> {
  return DEFAULT_SYSTEM_INSTRUCTION;
}

export interface DealSummaryPromptConfig {
  systemInstruction: string;
  taskInstruction: string;
  customInstruction: string;
  jsonSchema: string;
  isCustom: boolean;
}

/**
 * ดึงการตั้งค่า Prompt ของ Deal Summary (ถ้าไม่มีการตั้งค่าไว้จะคืนค่า Default)
 */
export async function getDealSummaryPromptConfig(): Promise<DealSummaryPromptConfig> {
  const configRow = await prisma.systemConfig.findUnique({
    where: { id: "deal_summary_prompt" },
  });

  if (configRow?.googleRefreshToken) {
    try {
      const val = JSON.parse(configRow.googleRefreshToken);
      if (val && typeof val === "object" && !val.isReset) {
        return {
          systemInstruction: val.systemInstruction || DEFAULT_SYSTEM_INSTRUCTION,
          taskInstruction: val.taskInstruction || DEFAULT_TASK_INSTRUCTION,
          customInstruction: val.customInstruction || "",
          jsonSchema: val.jsonSchema || JSON.stringify(DEFAULT_DEAL_SUMMARY_SCHEMA, null, 2),
          isCustom: true,
        };
      }
    } catch {
      // fallback to default
    }
  }

  return {
    systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
    taskInstruction: DEFAULT_TASK_INSTRUCTION,
    customInstruction: "",
    jsonSchema: JSON.stringify(DEFAULT_DEAL_SUMMARY_SCHEMA, null, 2),
    isCustom: false,
  };
}

/**
 * บันทึกการตั้งค่า Prompt (เฉพาะ ADMIN เท่านั้น)
 */
export async function saveDealSummaryPromptConfig(data: { 
  systemInstruction: string; 
  taskInstruction?: string; 
  customInstruction: string;
  jsonSchema?: string;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || session.user.role !== "ADMIN") {
    throw new Error("Unauthorized: Only ADMIN can configure AI prompts.");
  }

  // ตรวจสอบความถูกต้องของ JSON Schema ถ้ามีการส่งมา
  let validatedJsonSchema = JSON.stringify(DEFAULT_DEAL_SUMMARY_SCHEMA, null, 2);
  if (data.jsonSchema?.trim()) {
    try {
      const parsed = JSON.parse(data.jsonSchema);
      if (!parsed || typeof parsed !== "object") {
        throw new Error("JSON Schema ต้องเป็น Object");
      }
      validatedJsonSchema = JSON.stringify(parsed, null, 2);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "รูปแบบ JSON ไม่ถูกต้อง";
      throw new Error(`Invalid JSON Schema: ${msg}`);
    }
  }

  const payload = {
    systemInstruction: data.systemInstruction.trim(),
    taskInstruction: (data.taskInstruction || DEFAULT_TASK_INSTRUCTION).trim(),
    customInstruction: data.customInstruction.trim(),
    jsonSchema: validatedJsonSchema,
    isReset: false,
  };

  await prisma.systemConfig.upsert({
    where: { id: "deal_summary_prompt" },
    update: { googleRefreshToken: JSON.stringify(payload) },
    create: { id: "deal_summary_prompt", googleRefreshToken: JSON.stringify(payload) },
  });

  return { success: true, message: "Prompt configuration saved successfully." };
}

/**
 * คืนค่า Prompt เป็นค่าเริ่มต้นจากระบบ (เฉพาะ ADMIN เท่านั้น)
 */
export async function resetDealSummaryPromptConfig() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || session.user.role !== "ADMIN") {
    throw new Error("Unauthorized: Only ADMIN can reset AI prompts.");
  }

  await prisma.systemConfig.deleteMany({
    where: { id: "deal_summary_prompt" },
  });

  return {
    success: true,
    message: "Prompt reset to default successfully.",
    data: {
      systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
      taskInstruction: DEFAULT_TASK_INSTRUCTION,
      customInstruction: "",
      jsonSchema: JSON.stringify(DEFAULT_DEAL_SUMMARY_SCHEMA, null, 2),
      isCustom: false,
    },
  };
}

/**
 * ดึงบทสรุป AI ล่าสุดของดีลนี้ที่มีบันทึกไว้ในระบบ
 */
export async function getLatestDealSummary(dealId: string): Promise<DealSummaryResponse> {
  try {
    await requireOpportunityAccess(dealId);

    const summaryRow = await prisma.systemConfig.findUnique({
      where: { id: `deal_summary_${dealId}` },
    });

    if (summaryRow?.googleRefreshToken) {
      try {
        const payload = JSON.parse(summaryRow.googleRefreshToken);
        if (payload && payload.summaryData) {
          const generatedAt = payload.generatedAt || summaryRow.updatedAt.toISOString();
          const genDate = new Date(generatedAt);

          // ตรวจสอบว่ามีกิจกรรมหรือคอมเมนต์ใหม่หลังจากสร้างบทสรุปหรือไม่
          const newerActivitiesCount = await prisma.activityLog.count({
            where: {
              opportunityId: dealId,
              createdAt: { gt: genDate },
            },
          });

          // ตรวจสอบว่าตัวดีลมีการอัปเดตข้อมูลหลังจากสร้างสรุปหรือไม่
          const deal = await prisma.opportunity.findUnique({
            where: { id: dealId },
            select: { updatedAt: true },
          });

          const isDealUpdatedAfter = deal?.updatedAt ? deal.updatedAt.getTime() > genDate.getTime() + 1000 : false;
          const isOutdated = newerActivitiesCount > 0 || isDealUpdatedAfter;

          let usage = payload.usage;
          if (!usage && payload.summaryData) {
            const approxTokens = Math.round(JSON.stringify(payload.summaryData).length / 2.5) + 1200;
            const { costUsd, costThb } = calculateGeminiCost(approxTokens - 400, 400);
            usage = {
              inputTokens: approxTokens - 400,
              outputTokens: 400,
              totalTokens: approxTokens,
              costUsd,
              costThb,
            };
          }

          return {
            success: true,
            data: payload.summaryData,
            generatedAt,
            isOutdated,
            newerActivitiesCount,
            usage,
          };
        }
      } catch {
        // fallback
      }
    }

    return { success: true, data: undefined };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load summary";
    return { success: false, error: "UNAUTHORIZED", message: msg };
  }
}

/**
 * สั่งให้ AI วิเคราะห์และสร้างบทสรุปของดีลนี้แบบ One-Click
 */
export async function generateDealSummary(dealId: string): Promise<DealSummaryResponse> {
  try {
    await requireOpportunityAccess(dealId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    return { success: false, error: "UNAUTHORIZED", message: msg };
  }

  // ตรวจสอบงบประมาณ AI รายเดือนก่อนเรียกใช้งาน
  const budgetCheck = await checkAiBudget();
  if (!budgetCheck.allowed) {
    return {
      success: false,
      error: "BUDGET_EXCEEDED",
      message: `การใช้งาน AI เกินงบประมาณรายเดือนที่กำหนด ($${budgetCheck.budgetLimitUsd.toFixed(2)} USD) แล้ว กรุณาตรวจสอบในหน้า General Settings`,
    };
  }

  // 1. ดึงข้อมูลดีล
  const deal = await prisma.opportunity.findUnique({
    where: { id: dealId },
    include: {
      stage: true,
      company: true,
      owner: true,
    },
  });

  if (!deal) {
    return { success: false, error: "DEAL_NOT_FOUND", message: "ไม่พบข้อมูลดีลนี้ในระบบ" };
  }

  // 2. ดึงประวัติกิจกรรมและคอมเมนต์ล่าสุด
  const logs = await prisma.activityLog.findMany({
    where: { opportunityId: dealId },
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  // 3. ตรวจสอบ API Key
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";

  if (!apiKey.trim()) {
    return {
      success: false,
      error: "NO_API_KEY",
      message: "ยังไม่ได้ตั้งค่า Gemini API Key กรุณาระบุ GOOGLE_GEMINI_API_KEY ในไฟล์ .env",
    };
  }

  // 4. ประกอบ Prompt
  const dealTypeLabel = deal.type === 'INTERNAL_TASK' ? 'งานภายใน/โปรเจกต์ (Internal Task)' : 'งานขาย (Sales Deal)';
  const dealInfo = [
    `ชื่อดีล/หัวข้อ: ${deal.topic}`,
    `ประเภทงาน: ${dealTypeLabel}`,
    `สถานะ: ${deal.status}`,
    `ขั้นตอนใน Pipeline (Stage): ${deal.stage?.name || "ไม่ระบุ"}`,
    `มูลค่าดีล: ${deal.value ? `${deal.value.toLocaleString()} ${deal.currency || "THB"}` : "ไม่ระบุ"}`,
    `บริษัท/ลูกค้า: ${deal.company?.name || "ไม่ระบุ"}`,
    `ผู้รับผิดชอบ: ${deal.owner?.name || "ไม่ระบุ"}`,
    `กำหนดส่ง (Due Date): ${deal.dueDate ? new Date(deal.dueDate).toLocaleDateString("th-TH") : "ไม่ระบุ"}`,
  ].join("\n");

  const activityInfo = logs.length === 0
    ? "ยังไม่มีบันทึกกิจกรรมหรือคอมเมนต์ในการ์ดนี้"
    : logs.map((log: { user?: { name: string | null } | null; type: string; createdAt: Date | string; content: string | null }) => {
        const author = log.user?.name || (log.type === "SYSTEM_UPDATE" ? "ระบบ" : "ผู้ใช้");
        const time = new Date(log.createdAt).toLocaleDateString("th-TH", {
          day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
        });
        return `[${time}] ${author}: ${log.content?.trim() || ""}`;
      }).reverse().join("\n");

  const promptConfig = await getDealSummaryPromptConfig();
  const effectiveSystemInstruction = promptConfig.systemInstruction || DEFAULT_SYSTEM_INSTRUCTION;
  const effectiveTaskInstruction = promptConfig.taskInstruction || DEFAULT_TASK_INSTRUCTION;

  // ดึงข้อมูลคำตอบจาก AI Accelerators (ถ้ามี)
  let acceleratorContext = "";
  try {
    const accRow = await prisma.systemConfig.findUnique({
      where: { id: `deal_accelerators_${dealId}` },
    });
    if (accRow?.googleRefreshToken) {
      const accState = JSON.parse(accRow.googleRefreshToken);
      const parts: string[] = [];
      if (accState.targetGoal) {
        parts.push(`เป้าหมายหลักของการ์ดนี้ (Target Goal): ${accState.targetGoal}`);
      }
      type AccQuestionItem = { status?: string; question?: string; answer?: string; answeredBy?: string };
      const answered = (accState.questions || []).filter((q: AccQuestionItem) => q.status === "ANSWERED");
      if (answered.length > 0) {
        parts.push("ข้อมูลยืนยันล่าสุดจากผู้รับผิดชอบงาน (AI Deal Accelerators):");
        answered.forEach((q: AccQuestionItem) => {
          parts.push(`- คำถาม: ${q.question} => คำตอบที่ยืนยันแล้ว: "${q.answer}" (ยืนยันโดย ${q.answeredBy})`);
        });
      }
      if (parts.length > 0) {
        acceleratorContext = `\n\nข้อมูลเป้าหมายและคำตอบยืนยันล่าสุด (AI Deal Accelerators):\n${parts.join("\n")}`;
      }
    }
  } catch (err) {
    console.warn("[Deal Summary] Failed to load accelerator context:", err);
  }

  let prompt = `ข้อมูลดีล:
${dealInfo}

ประวัติกิจกรรมและคอมเมนต์ล่าสุด:
${activityInfo}${acceleratorContext}

${effectiveTaskInstruction}`;

  if (promptConfig.customInstruction?.trim()) {
    prompt += `\n\nคำสั่งพิเศษเพิ่มเติมจากผู้ดูแลระบบ:\n${promptConfig.customInstruction.trim()}`;
  }

  // 5. เตรียม Schema และเรียก AI Gateway
  let effectiveSchema: Record<string, unknown> = DEFAULT_DEAL_SUMMARY_SCHEMA;
  if (promptConfig.jsonSchema?.trim()) {
    try {
      effectiveSchema = JSON.parse(promptConfig.jsonSchema);
    } catch (e) {
      console.warn("[Deal Summary] Failed to parse custom jsonSchema, fallback to default", e);
    }
  }

  try {
    const adapter = aiGateway.getAdapter("GOOGLE_GEMINI");
    
    // ลองใช้ gemini-2.5-flash ก่อน ถ้าไม่สำเร็จลอง gemini-1.5-flash
    let aiResult;
    try {
      aiResult = await adapter.generateStructured<DealSummaryData>({
        providerKey: "GOOGLE_GEMINI",
        modelId: "gemini-2.5-flash",
        secretKey: apiKey,
        systemInstruction: effectiveSystemInstruction,
        prompt,
        schema: effectiveSchema,
        temperature: 0.2,
        timeoutMs: 25000,
      });
    } catch (firstErr) {
      console.warn("[Deal Summary] gemini-2.5-flash failed, falling back to gemini-1.5-flash:", firstErr);
      aiResult = await adapter.generateStructured<DealSummaryData>({
        providerKey: "GOOGLE_GEMINI",
        modelId: "gemini-1.5-flash",
        secretKey: apiKey,
        systemInstruction: effectiveSystemInstruction,
        prompt,
        schema: effectiveSchema,
        temperature: 0.2,
        timeoutMs: 25000,
      });
    }

    const summaryData = aiResult.data;
    const now = new Date();

    // 6. คำนวณ Token และต้นทุน
    const inputTokens = aiResult.usage?.inputTokens || 0;
    const outputTokens = aiResult.usage?.outputTokens || 0;
    const totalTokens = aiResult.usage?.totalTokens || (inputTokens + outputTokens);
    const { costUsd, costThb } = calculateGeminiCost(inputTokens, outputTokens);

    const usage: DealSummaryUsage = {
      inputTokens,
      outputTokens,
      totalTokens,
      costUsd,
      costThb,
    };

    // 7. บันทึกยอดใช้งานสะสมรายเดือน
    await recordMonthlyAiUsage(inputTokens, outputTokens, totalTokens, costUsd, costThb);

    // 8. บันทึกผลลัพธ์ลงใน SystemConfig (Key: deal_summary_${dealId})
    await prisma.systemConfig.upsert({
      where: { id: `deal_summary_${dealId}` },
      update: {
        googleRefreshToken: JSON.stringify({
          summaryData,
          generatedAt: now.toISOString(),
          usage,
        }),
      },
      create: {
        id: `deal_summary_${dealId}`,
        googleRefreshToken: JSON.stringify({
          summaryData,
          generatedAt: now.toISOString(),
          usage,
        }),
      },
    });

    return {
      success: true,
      data: summaryData,
      generatedAt: now.toISOString(),
      isOutdated: false,
      newerActivitiesCount: 0,
      usage,
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI";
    console.error("[Deal Summary] Error generating summary:", errorMessage);
    return {
      success: false,
      error: "AI_CALL_FAILED",
      message: `ไม่สามารถสร้างบทสรุปได้: ${errorMessage}`,
    };
  }
}
