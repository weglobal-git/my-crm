import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: opportunityId } = await params;

    const attachments = await prisma.attachment.findMany({
      where: { opportunityId },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ success: true, attachments });
  } catch (error) {
    console.error("Failed to fetch attachments:", error);
    return NextResponse.json({ error: "Failed to fetch attachments" }, { status: 500 });
  }
}
