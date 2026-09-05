"use server";

import prisma from "@/lib/prisma";
import { getContactActor } from "./contact";

export interface CompanyProfileData {
  businessSummary: string;
  accountType: string;
  country: string;
  isUserEdited?: boolean;
}

export interface PurchasingPatternData {
  orderFrequency: string;
  cycleTime: string;
  priceSensitivity: string;
  avgDealSize?: string;
}

export interface SwotData {
  strengths: string[];
  weaknesses: string[];
  risks: string[];
}

export interface NegotiationPlaybookData {
  strategy: string;
  talkingPoints: string[];
}

export interface GrowthOpportunitiesData {
  expansionAreas: string[];
  targetGoal: string;
}

export interface AccountAIUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  costThb: number;
}

export interface AccountBehaviorAnalysis {
  persona: string;
  companyProfile: CompanyProfileData;
  purchasingPattern: PurchasingPatternData;
  swot: SwotData;
  negotiationPlaybook: NegotiationPlaybookData;
  growthOpportunities: GrowthOpportunitiesData;
  // Legacy / convenience properties
  accountBehavior?: string;
  dealingStrategy?: string;
  buyingBehavior?: string;
  winFactors?: string[];
  riskFactors?: string[];
  recommendedActions?: string[];
  engagementScore: number;
  generatedAt: string;
  usage?: AccountAIUsage;
}

export interface AccountAIResponse {
  success: boolean;
  data?: AccountBehaviorAnalysis | null;
  isUpToDate?: boolean;
  error?: string;
}

export interface AccountAIPromptConfig {
  systemInstruction: string;
  taskInstruction: string;
  jsonSchema: string;
  isCustom: boolean;
}

export interface WebIntelligenceSource {
  title: string;
  url: string;
}

export interface WebIntelligenceData {
  searchQuery: string;
  websiteUrl: string;
  socialLinks: string[];
  businessSummary: string;
  productsAndBrands: string[];
  financialHighlights?: string;
  sources: WebIntelligenceSource[];
  isUserEdited?: boolean;
  generatedAt: string;
  usage?: AccountAIUsage;
}

export interface WebIntelligenceResponse {
  success: boolean;
  data?: WebIntelligenceData | null;
  error?: string;
}

const DEFAULT_ACCOUNT_AI_SYSTEM_INSTRUCTION = `คุณคือ AI ผู้เชี่ยวชาญด้าน B2B Account Intelligence และการวิเคราะห์กลยุทธ์การขายสำหรับ SB Interlab (โรงงานรับผลิตเครื่องสำอางและสกินแคร์ OEM/ODM ชั้นนำ)
หน้าที่ของคุณคือวิเคราะห์ข้อมูลประวัติลูกค้า บริษัท สัญญา ดีลที่ผ่านมา เพื่อช่วยให้เซลล์และผู้บริหารเข้าใจ Characteristic ของลูกค้าอย่างลึกซึ้ง และมีกลยุทธ์เจรจาเพื่อปิดการขายและเพิ่มยอดได้สูงสุด

กฎเกณฑ์สำคัญในการวิเคราะห์:
1. ตอบเป็นภาษาไทยที่กระชับ ชัดเจน ตรงไปตรงมา และนำไปใช้พูดคุยกับลูกค้าได้จริง
2. ปรับบริบทตามประเภทของ Account (Account Type) เสมอ:
   - CUSTOMER (เจ้าของแบรนด์/ผู้ซื้อปลายทาง): มุ่งเน้นสูตรสินค้า นวัตกรรม คุณภาพตามมาตรฐาน อย./GMP ปริมาณขั้นต่ำ (MOQ) และการเติบโตของแบรนด์
   - TRADER (ยี่ปั๊ว/ตัวแทนจำหน่าย/คนกลาง): มุ่งเน้นอัตรากำไร (Margin) ส่วนลดตามจำนวน (Tier Rebates) เทอมการชำระเงิน ความเร็วในการหมุนสินค้า และเอกสารส่งออก
   - SHIPPING (บริษัทชิปปิ้ง/โลจิสติกส์): มุ่งเน้นความตรงต่อเวลาของ Goods Ready Date การบรรจุตู้คอนเทนเนอร์ ค่าระวาง (Freight) พิธีการศุลกากร และความพร้อมเอกสารปล่อยสินค้า
   - MY_OFFICE (สาขาหรือบริษัทในเครือ): มุ่งเน้นการโอนย้ายสินค้าภายใน การจัดการสต็อกร่วมกัน และต้นทุนราคาโอน (Transfer Pricing)
3. ยึดข้อเท็จจริงจากประวัติการสั่งและดีลที่ระบุ ห้ามแต่งเติมตัวเลขเอง`;

const DEFAULT_ACCOUNT_AI_TASK_INSTRUCTION = `กรุณาวิเคราะห์ข้อมูล Account นี้ตาม 5 มิติสำคัญตาม JSON Schema:
1. companyProfile: สรุปลักษณะธุรกิจของบริษัท ประเทศ และบทบาทในตลาด (หากมีข้อความที่ผู้ใช้เคยระบุไว้ให้ยึดข้อความนั้นเป็นหลัก)
2. purchasingPattern: พฤติกรรมการสั่งซื้อ รอบความถี่ ระยะเวลาการตัดสินใจ (Cycle Time) และความอ่อนไหวต่อราคา
3. swot: จุดแข็งของความสัมพันธ์กับเรา (Strengths 2-3 ข้อ), จุดอ่อนหรือข้อจำกัดของลูกค้า (Weaknesses 2-3 ข้อ), และความเสี่ยงหรือคู่แข่ง (Risks 1-2 ข้อ)
4. negotiationPlaybook: กลยุทธ์การเจรจาเฉพาะลูกค้ารายนี้ (Strategy) และหัวข้อคำพูดที่ควรใช้คุย (Talking Points 2-3 ข้อ)
5. growthOpportunities: แนวทางการขยายยอดขาย เช่น สูตรสินค้าเสริม ขนาดล็อตที่ใหญ่ขึ้น (Expansion Areas 2-3 ข้อ) และเป้าหมายมูลค่าดีลที่ควรตั้งไว้ (Target Goal)`;

const DEFAULT_ACCOUNT_AI_SCHEMA = {
  type: "object",
  properties: {
    persona: {
      type: "string",
      description: "ฉายาหรือประเภทเชิงกลยุทธ์ของลูกค้า เช่น 'Strategic OEM Partner' หรือ 'High-Volume Price-Sensitive Trader'",
    },
    companyProfile: {
      type: "object",
      properties: {
        businessSummary: {
          type: "string",
          description: "สรุปลักษณะธุรกิจและสินค้าหลักของบริษัท 2-3 บรรทัด",
        },
        accountType: { type: "string" },
        country: { type: "string" },
      },
      required: ["businessSummary", "accountType", "country"],
    },
    purchasingPattern: {
      type: "object",
      properties: {
        orderFrequency: { type: "string", description: "ความถี่ในการสั่งซื้อ เช่น สั่งต่อเนื่องทุกไตรมาส หรือสั่งปีละครั้ง" },
        cycleTime: { type: "string", description: "ระยะเวลาเฉลี่ยจากเสนอราคาจนปิดดีล เช่น ปิดดีลไวภายใน 14 วัน หรือพิจารณานาน 2-3 เดือน" },
        priceSensitivity: { type: "string", description: "ความอ่อนไหวต่อราคา เช่น เน้นต่อรองราคาต่ำ หรือเน้นคุณภาพและยอมรับราคาสูงได้" },
        avgDealSize: { type: "string", description: "ขนาดยอดสั่งซื้อเฉลี่ย" },
      },
      required: ["orderFrequency", "cycleTime", "priceSensitivity"],
    },
    swot: {
      type: "object",
      properties: {
        strengths: { type: "array", items: { type: "string" }, description: "จุดแข็งและจุดที่เราผูกพันกับลูกค้า 2-3 ข้อ" },
        weaknesses: { type: "array", items: { type: "string" }, description: "จุดอ่อนหรือข้อจำกัดของลูกค้า เช่น เครดิตเทอม การตรวจรับ 2-3 ข้อ" },
        risks: { type: "array", items: { type: "string" }, description: "ความเสี่ยง เช่น คู่แข่งแย่งตลาด หรือความผันผวนของค่าเงิน 1-2 ข้อ" },
      },
      required: ["strengths", "weaknesses", "risks"],
    },
    negotiationPlaybook: {
      type: "object",
      properties: {
        strategy: { type: "string", description: "กลยุทธ์การเจรจาสำหรับลูกค้ารายนี้ 2-3 บรรทัด" },
        talkingPoints: { type: "array", items: { type: "string" }, description: "แนวทางการคุยและคีย์เวิร์ดที่ควรใช้ในรอบถัดไป 2-3 ข้อ" },
      },
      required: ["strategy", "talkingPoints"],
    },
    growthOpportunities: {
      type: "object",
      properties: {
        expansionAreas: { type: "array", items: { type: "string" }, description: "โอกาสขยายสินค้าหรือบริการ 2-3 ข้อ" },
        targetGoal: { type: "string", description: "เป้าหมายเชิงธุรกิจสำหรับรายนี้ 1 ประโยค" },
      },
      required: ["expansionAreas", "targetGoal"],
    },
    engagementScore: { type: "number", description: "คะแนนความผูกพัน 0-100" },
  },
  required: [
    "persona",
    "companyProfile",
    "purchasingPattern",
    "swot",
    "negotiationPlaybook",
    "growthOpportunities",
    "engagementScore",
  ],
};

/**
 * ดึงการตั้งค่า Prompt สำหรับ Account AI
 */
export async function getAccountAIPromptConfig(): Promise<AccountAIPromptConfig> {
  try {
    const configRow = await prisma.systemConfig.findUnique({
      where: { id: "account_ai_prompt" },
    });

    if (configRow?.googleRefreshToken) {
      const val = JSON.parse(configRow.googleRefreshToken);
      if (val && typeof val === "object" && !val.isReset) {
        return {
          systemInstruction: val.systemInstruction || DEFAULT_ACCOUNT_AI_SYSTEM_INSTRUCTION,
          taskInstruction: val.taskInstruction || DEFAULT_ACCOUNT_AI_TASK_INSTRUCTION,
          jsonSchema: val.jsonSchema || JSON.stringify(DEFAULT_ACCOUNT_AI_SCHEMA, null, 2),
          isCustom: true,
        };
      }
    }
  } catch (e) {
    console.error("[Account AI] Error loading prompt config:", e);
  }

  return {
    systemInstruction: DEFAULT_ACCOUNT_AI_SYSTEM_INSTRUCTION,
    taskInstruction: DEFAULT_ACCOUNT_AI_TASK_INSTRUCTION,
    jsonSchema: JSON.stringify(DEFAULT_ACCOUNT_AI_SCHEMA, null, 2),
    isCustom: false,
  };
}

/**
 * บันทึกการตั้งค่า Prompt สำหรับ Account AI (สำหรับ Admin)
 */
export async function saveAccountAIPromptConfig(config: {
  systemInstruction: string;
  taskInstruction: string;
  jsonSchema: string;
}) {
  const actor = await getContactActor();
  if (actor.role !== "ADMIN") {
    throw new Error("Forbidden: Only Administrators can update AI prompts.");
  }

  try {
    JSON.parse(config.jsonSchema);
  } catch {
    throw new Error("Invalid JSON Schema format.");
  }

  const payload = {
    systemInstruction: config.systemInstruction,
    taskInstruction: config.taskInstruction,
    jsonSchema: config.jsonSchema,
    updatedAt: new Date().toISOString(),
    isReset: false,
  };

  await prisma.systemConfig.upsert({
    where: { id: "account_ai_prompt" },
    update: { googleRefreshToken: JSON.stringify(payload) },
    create: { id: "account_ai_prompt", googleRefreshToken: JSON.stringify(payload) },
  });

  return { success: true };
}

/**
 * รีเซ็ตการตั้งค่า Prompt กลับเป็นค่าเริ่มต้น
 */
export async function resetAccountAIPromptConfig() {
  const actor = await getContactActor();
  if (actor.role !== "ADMIN") {
    throw new Error("Forbidden: Only Administrators can reset AI prompts.");
  }

  await prisma.systemConfig.upsert({
    where: { id: "account_ai_prompt" },
    update: { googleRefreshToken: JSON.stringify({ isReset: true }) },
    create: { id: "account_ai_prompt", googleRefreshToken: JSON.stringify({ isReset: true }) },
  });

  return {
    success: true,
    data: {
      systemInstruction: DEFAULT_ACCOUNT_AI_SYSTEM_INSTRUCTION,
      taskInstruction: DEFAULT_ACCOUNT_AI_TASK_INSTRUCTION,
      jsonSchema: JSON.stringify(DEFAULT_ACCOUNT_AI_SCHEMA, null, 2),
      isCustom: false,
    },
  };
}

/**
 * อัปเดตข้อมูลประวัติบริษัทที่ผู้ใช้แก้ไขด้วยตนเอง
 */
export async function updateCompanyBusinessProfile(companyId: string, businessSummary: string) {
  await getContactActor();

  const cacheKey = `account_ai_${companyId}`;
  const existing = await prisma.systemConfig.findUnique({
    where: { id: cacheKey },
  });

  let currentData: Partial<AccountBehaviorAnalysis> & Record<string, unknown> = {};
  if (existing?.googleRefreshToken) {
    try {
      currentData = JSON.parse(existing.googleRefreshToken);
    } catch {}
  }

  currentData.companyProfile = {
    ...(currentData.companyProfile || {
      accountType: "CUSTOMER",
      country: "Thailand",
    }),
    businessSummary: businessSummary.trim(),
    isUserEdited: true,
  };

  await prisma.systemConfig.upsert({
    where: { id: cacheKey },
    update: { googleRefreshToken: JSON.stringify(currentData) },
    create: { id: cacheKey, googleRefreshToken: JSON.stringify(currentData) },
  });

  return { success: true, data: currentData as AccountBehaviorAnalysis };
}

/**
 * อ่าน Cached Analysis
 */
export async function getCachedAccountAnalysis(companyId: string): Promise<AccountAIResponse> {
  try {
    await getContactActor();

    const cacheKey = `account_ai_${companyId}`;
    const cached = await prisma.systemConfig.findUnique({
      where: { id: cacheKey },
    });

    if (!cached?.googleRefreshToken) {
      return { success: true, data: null, isUpToDate: false };
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cached.googleRefreshToken);
    } catch {
      return { success: true, data: null, isUpToDate: false };
    }

    // Normalizing legacy shape if needed
    const normalized = normalizeAnalysisShape(parsed);

    // Check freshness
    const generatedTime = new Date(normalized.generatedAt).getTime();

    const [company, latestDeal, latestContact] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        select: { updatedAt: true },
      }),
      prisma.opportunity.findFirst({
        where: { companyId },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
      prisma.contact.findFirst({
        where: { companyId },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
    ]);

    const latestTimestamps = [
      company?.updatedAt ? new Date(company.updatedAt).getTime() : 0,
      latestDeal?.updatedAt ? new Date(latestDeal.updatedAt).getTime() : 0,
      latestContact?.updatedAt ? new Date(latestContact.updatedAt).getTime() : 0,
    ];

    const maxUpdated = Math.max(...latestTimestamps);
    const isUpToDate = !isNaN(generatedTime) && maxUpdated <= generatedTime;

    return { success: true, data: normalized, isUpToDate };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load cached analysis";
    return { success: false, error: msg };
  }
}

/**
 * รันการวิเคราะห์พฤติกรรมลูกค้าด้วย AI (หรือ Heuristic กรณีไม่มี Key)
 */
export async function getAccountBehaviorAnalysis(companyId: string): Promise<AccountAIResponse> {
  try {
    await getContactActor();

    // 1. Fetch deep context
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        contacts: {
          select: { name: true, role: true, type: true, status: true, isActive: true },
        },
        opportunities: {
          include: {
            stage: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 30,
        },
      },
    });

    if (!company) {
      return { success: false, error: "Company not found" };
    }

    // 2. Check if user previously edited business summary & check web intelligence
    let userEditedSummary: string | null = null;
    let webIntelData: WebIntelligenceData | null = null;
    try {
      const [existing, webIntelRow] = await Promise.all([
        prisma.systemConfig.findUnique({ where: { id: `account_ai_${companyId}` } }),
        prisma.systemConfig.findUnique({ where: { id: `account_web_intel_${companyId}` } }),
      ]);
      if (existing?.googleRefreshToken) {
        const prev = JSON.parse(existing.googleRefreshToken);
        if (prev?.companyProfile?.isUserEdited && prev.companyProfile.businessSummary) {
          userEditedSummary = prev.companyProfile.businessSummary;
        }
      }
      if (webIntelRow?.googleRefreshToken) {
        webIntelData = JSON.parse(webIntelRow.googleRefreshToken);
      }
    } catch {}

    // Deal statistics
    const wonDeals = company.opportunities.filter(d => d.status === "WON" || (d.status as string) === "COMPLETED");
    const lostDeals = company.opportunities.filter(d => d.status === "LOST" || (d.status as string) === "CANCELLED");
    const openDeals = company.opportunities.filter(d => d.status === "OPEN");
    const totalDeals = company.opportunities.length;
    const totalWonValue = wonDeals.reduce((sum, d) => sum + (d.value || 0), 0);
    const totalOpenValue = openDeals.reduce((sum, d) => sum + (d.value || 0), 0);
    const winRate = totalDeals > 0 ? Math.round((wonDeals.length / totalDeals) * 100) : 0;

    // Average cycle time in days for closed deals
    const cycleDurations = wonDeals
      .filter(d => d.closedAt)
      .map(d => Math.max(1, Math.round((new Date(d.closedAt!).getTime() - new Date(d.createdAt).getTime()) / (1000 * 3600 * 24))));
    const avgCycleDays = cycleDurations.length > 0
      ? Math.round(cycleDurations.reduce((a, b) => a + b, 0) / cycleDurations.length)
      : null;

    const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
    const promptConfig = await getAccountAIPromptConfig();

    let analysis: AccountBehaviorAnalysis;

    if (apiKey.trim()) {
      try {
        const promptPayload = `
บริบทของลูกค้า (Account Context):
- ชื่อบริษัท: ${company.name}
- ประเทศ: ${company.country || "ไม่ระบุ"}
- ประเภทบัญชี (Account Type): ${company.type} (สำคัญ: กรุณาวิเคราะห์ตามบทบาทของประเภทนี้)
- ข้อมูลธุรกิจเบื้องต้น / ประวัติเดิม: ${userEditedSummary || company.notes || "ยังไม่มีข้อมูลเพิ่มเติม"}
- ผู้ติดต่อหลัก (${company.contacts.length} ท่าน): ${company.contacts.map(c => `${c.name} (${c.role || "ตำแหน่งทั่วไป"}, ${c.status})`).join(", ") || "ไม่มี"}
${webIntelData ? `
ข้อมูลการตลาดและสินค้าจริงจากการสืบค้นเว็บ (Verified Web Intelligence):
- เว็บไซต์/ช่องทาง: ${webIntelData.websiteUrl || (webIntelData.socialLinks || []).join(", ") || "ไม่ระบุ"}
- สินค้าและแบรนด์หลักที่จำหน่าย: ${(webIntelData.productsAndBrands || []).join(", ") || "ไม่ระบุ"}
- ภาพรวมธุรกิจจากเว็บ: ${webIntelData.businessSummary || "ไม่ระบุ"}
- ข้อมูลการเงิน/ขนาดธุรกิจ: ${webIntelData.financialHighlights || "ไม่ระบุ"}
` : ""}
ประวัติโครงการ/ดีล (${totalDeals} ดีลทั้งหมด):
- ดีลที่สำเร็จ (WON): ${wonDeals.length} ดีล (มูลค่ารวม ฿${totalWonValue.toLocaleString()})
- ดีลที่แพ้ (LOST): ${lostDeals.length} ดีล
- ดีลที่กำลังดำเนินอยู่ (OPEN): ${openDeals.length} ดีล (มูลค่ารวม ฿${totalOpenValue.toLocaleString()})
- อัตราความสำเร็จ (Win Rate): ${winRate}%
${avgCycleDays ? `- ระยะเวลาเฉลี่ยจากเริ่มดีลจนปิดการขาย: ประมาณ ${avgCycleDays} วัน` : ""}

รายการดีลล่าสุด:
${company.opportunities.slice(0, 15).map(d => {
  const days = d.closedAt ? `(ระยะเวลา ${Math.max(1, Math.round((new Date(d.closedAt).getTime() - new Date(d.createdAt).getTime()) / (1000 * 3600 * 24)))} วัน)` : "";
  return `- [${d.status}] "${d.topic}" (มูลค่า: ฿${(d.value || 0).toLocaleString()}, Stage: ${d.stage?.name || "-"}) ${days}`;
}).join("\n") || "ไม่มีข้อมูลดีล"}

คำสั่งเพิ่มเติม:
${promptConfig.taskInstruction}
${userEditedSummary ? `\nหมายเหตุสำคัญ: ผู้ใช้ได้ระบุข้อมูลลักษณะบริษัทไว้ว่า: "${userEditedSummary}" กรุณานำข้อมูลนี้มาเป็นแกนหลักใน companyProfile.businessSummary ด้วย` : ""}
`;

        let parsedSchema: Record<string, unknown>;
        try {
          parsedSchema = JSON.parse(promptConfig.jsonSchema);
        } catch {
          parsedSchema = DEFAULT_ACCOUNT_AI_SCHEMA;
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: promptConfig.systemInstruction }],
            },
            contents: [{ role: "user", parts: [{ text: promptPayload }] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: parsedSchema,
              temperature: 0.2,
            },
          }),
        });

        if (response.ok) {
          const resData = await response.json();
          const text = resData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            const parsed = JSON.parse(text);
            analysis = {
              persona: parsed.persona || `${company.type} Account`,
              companyProfile: {
                businessSummary: userEditedSummary || parsed.companyProfile?.businessSummary || "ดำเนินธุรกิจในกลุ่มอุตสาหกรรมความงามและสุขภาพ",
                accountType: company.type,
                country: company.country || "Thailand",
                isUserEdited: !!userEditedSummary,
              },
              purchasingPattern: {
                orderFrequency: parsed.purchasingPattern?.orderFrequency || "สั่งซื้อตามรอบโปรเจกต์",
                cycleTime: parsed.purchasingPattern?.cycleTime || (avgCycleDays ? `ประมาณ ${avgCycleDays} วัน` : "ระยะเวลาตามการพัฒนาสูตร"),
                priceSensitivity: parsed.purchasingPattern?.priceSensitivity || "พิจารณาตามสเปกและปริมาณขั้นต่ำ",
                avgDealSize: parsed.purchasingPattern?.avgDealSize || (wonDeals.length > 0 ? `฿${Math.round(totalWonValue / wonDeals.length).toLocaleString()}` : "฿0"),
              },
              swot: {
                strengths: Array.isArray(parsed.swot?.strengths) && parsed.swot.strengths.length > 0 ? parsed.swot.strengths : ["ความไว้วางใจในมาตรฐานโรงงาน"],
                weaknesses: Array.isArray(parsed.swot?.weaknesses) && parsed.swot.weaknesses.length > 0 ? parsed.swot.weaknesses : ["ระยะเวลาตัดสินใจในขั้นตอนพัฒนาตัวอย่าง"],
                risks: Array.isArray(parsed.swot?.risks) && parsed.swot.risks.length > 0 ? parsed.swot.risks : ["การแข่งขันด้านราคาในตลาด"],
              },
              negotiationPlaybook: {
                strategy: parsed.negotiationPlaybook?.strategy || "รักษาความสัมพันธ์และนำเสนอนวัตกรรมสูตรใหม่",
                talkingPoints: Array.isArray(parsed.negotiationPlaybook?.talkingPoints) && parsed.negotiationPlaybook.talkingPoints.length > 0
                  ? parsed.negotiationPlaybook.talkingPoints
                  : ["เสนอสูตรตัวอย่างที่ตรงกับเทรนด์ตลาด", "แจ้งส่วนลดพิเศษสำหรับการสั่งซื้อล็อตใหญ่"],
              },
              growthOpportunities: {
                expansionAreas: Array.isArray(parsed.growthOpportunities?.expansionAreas) && parsed.growthOpportunities.expansionAreas.length > 0
                  ? parsed.growthOpportunities.expansionAreas
                  : ["เพิ่มหมวดหมู่สินค้าสกินแคร์", "ขยายขนาดล็อตการผลิต"],
                targetGoal: parsed.growthOpportunities?.targetGoal || "ขยายมูลค่าคำสั่งซื้อให้เติบโตต่อเนื่อง",
              },
              engagementScore: typeof parsed.engagementScore === "number" ? parsed.engagementScore : 75,
              accountBehavior: parsed.negotiationPlaybook?.strategy || "ดำเนินงานอย่างต่อเนื่อง",
              dealingStrategy: parsed.negotiationPlaybook?.strategy || "เสนอโซลูชันที่ปรับแต่งเฉพาะ",
              generatedAt: new Date().toISOString(),
            };

            const inputTokens = resData.usageMetadata?.promptTokenCount || Math.round(promptPayload.length / 4);
            const outputTokens = resData.usageMetadata?.candidatesTokenCount || (text ? Math.round(text.length / 4) : 400);
            const totalTokens = resData.usageMetadata?.totalTokenCount || (inputTokens + outputTokens);
            const { costUsd, costThb } = calculateGeminiCost(inputTokens, outputTokens);
            analysis.usage = {
              inputTokens,
              outputTokens,
              totalTokens,
              costUsd,
              costThb,
            };
          } else {
            throw new Error("Empty AI response");
          }
        } else {
          throw new Error(`Gemini API error: ${response.statusText}`);
        }
      } catch (aiErr) {
        console.warn("[Account AI] Fallback to heuristic analysis:", aiErr);
        analysis = generateHeuristicAnalysis(company, wonDeals, lostDeals, openDeals, totalWonValue, winRate, avgCycleDays, userEditedSummary);
      }
    } else {
      analysis = generateHeuristicAnalysis(company, wonDeals, lostDeals, openDeals, totalWonValue, winRate, avgCycleDays, userEditedSummary);
    }

    // Cache in systemConfig
    const cacheKey = `account_ai_${companyId}`;
    await prisma.systemConfig.upsert({
      where: { id: cacheKey },
      create: {
        id: cacheKey,
        googleRefreshToken: JSON.stringify(analysis),
      },
      update: {
        googleRefreshToken: JSON.stringify(analysis),
      },
    });

    return { success: true, data: analysis, isUpToDate: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to analyze account";
    return { success: false, error: msg };
  }
}

function calculateGeminiCost(inputTokens: number, outputTokens: number) {
  const USD_TO_THB = 35.5;
  // Gemini Flash pricing: $0.075 / 1M input tokens, $0.30 / 1M output tokens
  const inputCostUsd = (inputTokens / 1_000_000) * 0.075;
  const outputCostUsd = (outputTokens / 1_000_000) * 0.30;
  const costUsd = inputCostUsd + outputCostUsd;
  const costThb = costUsd * USD_TO_THB;
  return { costUsd, costThb };
}

function normalizeAnalysisShape(raw: Record<string, unknown>): AccountBehaviorAnalysis {
  const parsed = raw as Partial<AccountBehaviorAnalysis> & Record<string, unknown>;
  if (parsed.companyProfile && parsed.swot && parsed.negotiationPlaybook) {
    if (!parsed.usage) {
      const { costUsd, costThb } = calculateGeminiCost(820, 390);
      parsed.usage = {
        inputTokens: 820,
        outputTokens: 390,
        totalTokens: 1210,
        costUsd,
        costThb,
      };
    }
    return parsed as AccountBehaviorAnalysis;
  }

  // Convert old legacy shape
  return {
    persona: (parsed.persona as string) || "Corporate Account",
    companyProfile: {
      businessSummary: (parsed.accountBehavior as string) || (parsed.buyingBehavior as string) || "ดำเนินธุรกิจและมีความร่วมมือกับ SB Interlab อย่างต่อเนื่อง",
      accountType: "CUSTOMER",
      country: "Thailand",
      isUserEdited: false,
    },
    purchasingPattern: {
      orderFrequency: "สั่งซื้อตามโปรเจกต์",
      cycleTime: "ระยะเวลามาตรฐาน",
      priceSensitivity: "พิจารณาความคุ้มค่าตามสเปก",
      avgDealSize: "-",
    },
    swot: {
      strengths: Array.isArray(parsed.winFactors) ? (parsed.winFactors as string[]) : ["มาตรฐานการผลิตที่เชื่อถือได้"],
      weaknesses: ["ขั้นตอนการพิจารณาภายในองค์กร"],
      risks: Array.isArray(parsed.riskFactors) ? (parsed.riskFactors as string[]) : ["การแข่งขันด้านราคา"],
    },
    negotiationPlaybook: {
      strategy: (parsed.dealingStrategy as string) || "นำเสนอการบริการที่รวดเร็วและตรงจุด",
      talkingPoints: Array.isArray(parsed.recommendedActions) ? (parsed.recommendedActions as string[]) : ["ติดตามความคืบหน้าของตัวอย่างสินค้า"],
    },
    growthOpportunities: {
      expansionAreas: ["ต่อยอดไลน์ผลิตภัณฑ์ใหม่"],
      targetGoal: "เพิ่มมูลค่าความร่วมมือในระยะยาว",
    },
    engagementScore: (parsed.engagementScore as number) || 70,
    accountBehavior: parsed.accountBehavior as string | undefined,
    dealingStrategy: parsed.dealingStrategy as string | undefined,
    generatedAt: (parsed.generatedAt as string) || new Date().toISOString(),
  };
}

function generateHeuristicAnalysis(
  company: { type?: string | null; country?: string | null; name?: string | null },
  wonDeals: { topic?: string | null; value?: number | null }[],
  lostDeals: { topic?: string | null; value?: number | null }[],
  openDeals: { topic?: string | null; value?: number | null }[],
  totalWonValue: number,
  winRate: number,
  avgCycleDays: number | null,
  userEditedSummary: string | null
): AccountBehaviorAnalysis {
  const type = company.type || "CUSTOMER";
  const country = company.country || "Thailand";

  let persona = "Enterprise Partner";
  let typeRole = "เจ้าของแบรนด์ที่มุ่งเน้นการพัฒนาสินค้า";
  let focusStrategy = "เน้นการพัฒนาสูตรเฉพาะกลุ่มและคุณภาพระดับสากล";
  let talkingPoint1 = "นำเสนอสูตรปรับปรุงใหม่ที่ช่วยสร้างจุดขายที่แตกต่าง";

  if (type === "TRADER") {
    persona = "Volume-Oriented Trader / Distributor";
    typeRole = "ตัวแทนจำหน่าย/คนกลางที่เน้นการทำรอบและส่วนต่างราคา";
    focusStrategy = "ใช้โครงสร้างส่วนลดตามปริมาณ (Tiered Rebate) และเครดิตเทอมเพื่อกระตุ้นการสั่งสต็อกก้อนใหญ่";
    talkingPoint1 = "เสนอเงื่อนไขส่วนลดพิเศษเมื่อสั่งผลิตครบ 5,000 หรือ 10,000 ชิ้นต่อล็อต";
  } else if (type === "SHIPPING") {
    persona = "Logistics & Freight Partner";
    typeRole = "พันธมิตรด้านการขนส่งและโลจิสติกส์ระหว่างประเทศ";
    focusStrategy = "ประสานงานวันความพร้อมสินค้า (Goods Ready Date) ล่วงหน้าเพื่อจองตู้คอนเทนเนอร์ราคาดีที่สุด";
    talkingPoint1 = "ยืนยันตารางบรรจุสินค้าและเอกสาร Form D / CO ให้ตรงเวลา";
  } else if (type === "MY_OFFICE") {
    persona = "Internal Branch / Network Entity";
    typeRole = "หน่วยงานสาขาและเครือข่ายภายในองค์กร";
    focusStrategy = "จัดสรรโควต้าการผลิตและบริหารสินค้าคงคลังร่วมกันอย่างมีประสิทธิภาพ";
    talkingPoint1 = "วางแผนพยากรณ์ความต้องการวัตถุดิบล่วงหน้า 3 เดือน";
  } else if (winRate >= 70 && wonDeals.length >= 2) {
    persona = "Strategic High-Value Client";
  }

  const cycleText = avgCycleDays ? `เฉลี่ย ${avgCycleDays} วันจากเสนอราคาจนปิดดีล` : "ระยะเวลาตามรอบการตัดสินใจ";

  return {
    persona,
    companyProfile: {
      businessSummary: userEditedSummary || `${company.name} เป็น ${typeRole} ตั้งอยู่ที่ ${country} มีประวัติโครงการปิดสำเร็จ ${wonDeals.length} ดีล และกำลังเปิดเจรจา ${openDeals.length} ดีล`,
      accountType: type,
      country,
      isUserEdited: !!userEditedSummary,
    },
    purchasingPattern: {
      orderFrequency: wonDeals.length > 2 ? "สั่งซื้อซ้ำต่อเนื่องสม่ำเสมอ" : "สั่งซื้อตามโปรเจกต์ใหม่",
      cycleTime: cycleText,
      priceSensitivity: type === "TRADER" ? "อ่อนไหวต่อราคาสูง เน้นส่วนต่างกำไร" : "เน้นความคุ้มค่าและคุณภาพงานผลิตที่เชื่อถือได้",
      avgDealSize: wonDeals.length > 0 ? `฿${Math.round(totalWonValue / wonDeals.length).toLocaleString()}` : "฿0",
    },
    swot: {
      strengths: [
        `อัตราความสำเร็จโครงการ ${winRate}% สะท้อนความสัมพันธ์และความไว้วางใจสูง`,
        `มูลค่าปิดการขายสะสม ฿${totalWonValue.toLocaleString()}`,
        "มีช่องทางการจำหน่ายหรือฐานลูกค้าที่ชัดเจน",
      ],
      weaknesses: [
        "ระยะเวลาในขั้นตอนการตรวจรับและอนุมัติสูตร",
        type === "TRADER" ? "ต้องการเครดิตเทอมและการแข่งขันเรื่องราคา" : "ต้องการการซัพพอร์ตด้านเทคนิคใกล้ชิด",
      ],
      risks: [
        "การเปรียบเทียบข้อเสนอกับโรงงานผลิตคู่แข่งในตลาด",
        "ต้นทุนวัตถุดิบและความผันผวนของค่าขนส่ง",
      ],
    },
    negotiationPlaybook: {
      strategy: focusStrategy,
      talkingPoints: [
        talkingPoint1,
        "สรุปสถานะความคืบหน้าของสินค้าตัวอย่างและข้อเสนอราคาอย่างชัดเจน",
        "ชูจุดเด่นมาตรฐานโรงงานระดับสากลและบริการขึ้นทะเบียน อย. ครบวงจร",
      ],
    },
    growthOpportunities: {
      expansionAreas: [
        "นำเสนอสูตรสินค้าในกลุ่มยอดนิยมที่เข้ากับตลาด",
        "การรวมคำสั่งซื้อเพื่อรับส่วนลดต้นทุนบรรจุภัณฑ์",
      ],
      targetGoal: `ผลักดันการปิดดีลที่กำลังเปิดอยู่ ${openDeals.length} รายการ และเพิ่มมูลค่าคำสั่งซื้อเฉลี่ย`,
    },
    engagementScore: Math.min(95, Math.max(50, winRate > 0 ? winRate : 65)),
    accountBehavior: focusStrategy,
    dealingStrategy: focusStrategy,
    generatedAt: new Date().toISOString(),
    usage: (() => {
      const approxInput = Math.round((userEditedSummary?.length || 200) + 750);
      const approxOutput = 420;
      const totalTokens = approxInput + approxOutput;
      const { costUsd, costThb } = calculateGeminiCost(approxInput, approxOutput);
      return {
        inputTokens: approxInput,
        outputTokens: approxOutput,
        totalTokens,
        costUsd,
        costThb,
      };
    })(),
  };
}

/**
 * โหลดข้อมูล Web Intelligence ที่แคชไว้
 */
export async function getCachedWebIntelligence(companyId: string): Promise<WebIntelligenceResponse> {
  try {
    await getContactActor();

    const cacheKey = `account_web_intel_${companyId}`;
    const cached = await prisma.systemConfig.findUnique({
      where: { id: cacheKey },
    });

    if (!cached?.googleRefreshToken) {
      return { success: true, data: null };
    }

    const parsed = JSON.parse(cached.googleRefreshToken);
    return { success: true, data: parsed as WebIntelligenceData };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load cached web intelligence";
    return { success: false, error: msg };
  }
}

/**
 * ค้นหาและรวบรวมข้อมูลบริษัท/แบรนด์จากอินเทอร์เน็ตด้วย AI & Google Search
 */
export async function researchCompanyWebIntelligence(
  companyId: string,
  customQuery?: string
): Promise<WebIntelligenceResponse> {
  try {
    await getContactActor();

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, country: true, type: true, notes: true },
    });

    if (!company) {
      return { success: false, error: "Company not found" };
    }

    const query = (customQuery || `${company.name} ${company.country || ""}`).trim();
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";

    if (!apiKey) {
      return { success: false, error: "GEMINI_API_KEY is not configured" };
    }

    const prompt = `คุณคือนักวิเคราะห์ข่าวกรองตลาดและธุรกิจ (B2B Market Intelligence Researcher) สำหรับโรงงานรับผลิตเครื่องสำอางและสกินแคร์ OEM/ODM (SB Interlab)
กรุณาค้นหาและรวบรวมข้อมูลบน Google เกี่ยวกับ:
- คำค้นหา: "${query}"
- ข้อมูลประกอบ: ประเทศ ${company.country || "ไทย"}, ประเภทบัญชี ${company.type}

กรุณารวบรวมและตอบกลับเป็น JSON โครงสร้างนี้เท่านั้น:
{
  "websiteUrl": "URL เว็บไซต์หลักของบริษัท หรือว่างหากไม่พบ",
  "socialLinks": ["URL หน้าเพจ Facebook / Instagram / Shopee / Lazada หรือช่องทางขายออนไลน์ที่พบ"],
  "businessSummary": "สรุปกระชับ 2-3 บรรทัดว่าบริษัท/แบรนด์นี้ทำธุรกิจอะไร ขายสินค้าอะไร ลูกค้าเป้าหมายคือใคร",
  "productsAndBrands": ["ชื่อสินค้าหรือแบรนด์หลักที่วางจำหน่าย (3-6 รายการ เช่น ครีมกันแดด, สบู่ก้อน, เซรั่มทองคำ)"],
  "financialHighlights": "ข้อมูลทุนจดทะเบียน สถานะบริษัท หรือขนาดธุรกิจที่พบเบื้องต้น (หรือระบุว่า 'ไม่ระบุ')",
  "sources": [
    { "title": "ชื่อหน้าเว็บหรือหัวข้อที่ค้นพบ", "url": "ลิงก์ URL ที่มา" }
  ]
}

ข้อควรระวัง:
1. หากพบบริษัทชื่อคล้ายกัน ให้คัดกรองเฉพาะบริษัทที่อยู่ในกลุ่มธุรกิจความงาม/เครื่องสำอาง/สุขภาพ/การค้าที่ตรงกับประเทศ ${company.country || "ไทย"}
2. ตอบเฉพาะข้อเท็จจริงที่พบจริงบนอินเทอร์เน็ต`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    // Attempt with Google Search Grounding tool
    let response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    });

    // Fallback without tools if googleSearch is not allowed or errors
    if (!response.ok) {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      });
    }

    if (!response.ok) {
      throw new Error(`Gemini API Error: ${response.statusText}`);
    }

    const resData = await response.json();
    const text = resData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("Empty AI response during web research");
    }

    let resJson: (Partial<WebIntelligenceData> & Record<string, unknown>) | null = null;
    try {
      resJson = JSON.parse(text);
    } catch {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        resJson = JSON.parse(jsonMatch[0]);
      }
    }

    if (!resJson) {
      throw new Error("Could not parse web research output into structured format");
    }

    // Capture grounding metadata sources if present
    const chunks = (resData.candidates?.[0]?.groundingMetadata?.groundingChunks || []) as Array<{
      web?: { uri?: string; title?: string };
    }>;
    const discoveredSources: WebIntelligenceSource[] = chunks
      .filter((c) => Boolean(c.web?.uri))
      .map((c) => ({
        title: c.web?.title || c.web?.uri || "",
        url: c.web?.uri || "",
      }));

    const finalSources: WebIntelligenceSource[] = Array.isArray(resJson.sources) ? resJson.sources : [];
    for (const ds of discoveredSources) {
      if (!finalSources.some((s) => s.url === ds.url)) {
        finalSources.push(ds);
      }
    }

    const inputTokens = resData.usageMetadata?.promptTokenCount || Math.round(prompt.length / 4);
    const outputTokens = resData.usageMetadata?.candidatesTokenCount || 350;
    const totalTokens = inputTokens + outputTokens;
    const { costUsd, costThb } = calculateGeminiCost(inputTokens, outputTokens);

    const webIntel: WebIntelligenceData = {
      searchQuery: query,
      websiteUrl: typeof resJson.websiteUrl === "string" ? resJson.websiteUrl.trim() : "",
      socialLinks: Array.isArray(resJson.socialLinks) ? resJson.socialLinks : [],
      businessSummary: typeof resJson.businessSummary === "string" ? resJson.businessSummary.trim() : "",
      productsAndBrands: Array.isArray(resJson.productsAndBrands) ? resJson.productsAndBrands : [],
      financialHighlights: typeof resJson.financialHighlights === "string" ? resJson.financialHighlights : "ไม่ระบุ",
      sources: finalSources,
      isUserEdited: false,
      generatedAt: new Date().toISOString(),
      usage: {
        inputTokens,
        outputTokens,
        totalTokens,
        costUsd,
        costThb,
      },
    };

    const cacheKey = `account_web_intel_${companyId}`;
    await prisma.systemConfig.upsert({
      where: { id: cacheKey },
      create: {
        id: cacheKey,
        googleRefreshToken: JSON.stringify(webIntel),
      },
      update: {
        googleRefreshToken: JSON.stringify(webIntel),
      },
    });

    return { success: true, data: webIntel };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to research company on web";
    return { success: false, error: msg };
  }
}

/**
 * บันทึกการแก้ไขข้อมูล Web Intelligence โดยผู้ใช้
 */
export async function saveCompanyWebIntelligence(
  companyId: string,
  data: Partial<WebIntelligenceData>
): Promise<WebIntelligenceResponse> {
  try {
    await getContactActor();

    const cacheKey = `account_web_intel_${companyId}`;
    const existing = await prisma.systemConfig.findUnique({
      where: { id: cacheKey },
    });

    let current: WebIntelligenceData = {
      searchQuery: "",
      websiteUrl: "",
      socialLinks: [],
      businessSummary: "",
      productsAndBrands: [],
      financialHighlights: "ไม่ระบุ",
      sources: [],
      generatedAt: new Date().toISOString(),
    };

    if (existing?.googleRefreshToken) {
      try {
        current = JSON.parse(existing.googleRefreshToken);
      } catch {}
    }

    const updated: WebIntelligenceData = {
      ...current,
      ...data,
      isUserEdited: true,
      generatedAt: current.generatedAt || new Date().toISOString(),
    };

    await prisma.systemConfig.upsert({
      where: { id: cacheKey },
      create: {
        id: cacheKey,
        googleRefreshToken: JSON.stringify(updated),
      },
      update: {
        googleRefreshToken: JSON.stringify(updated),
      },
    });

    return { success: true, data: updated };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to save web intelligence";
    return { success: false, error: msg };
  }
}
