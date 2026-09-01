import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireOpportunityAccess } from "@/lib/pipeline-security";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: opportunityId } = await params;
    await requireOpportunityAccess(opportunityId);

    const attachments = await prisma.attachment.findMany({
      where: { opportunityId },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ success: true, attachments });
  } catch (error: unknown) {
    console.error("Failed to fetch attachments:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch attachments";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
