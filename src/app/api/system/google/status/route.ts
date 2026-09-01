import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getDriveService } from "@/lib/google";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role?: string }).role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const config = await prisma.systemConfig.findUnique({
      where: { id: "global" }
    });

    if (!config?.googleRefreshToken) {
      return NextResponse.json({ success: true, isConnected: false });
    }

    const drive = getDriveService(config.googleRefreshToken);
    
    // Fetch storage quota and user info
    const about = await drive.about.get({ fields: "storageQuota, user" });
    const quota = about.data.storageQuota;
    const user = about.data.user;

    if (!quota) {
      return NextResponse.json({ success: true, isConnected: true, quota: null, email: user?.emailAddress || null });
    }

    const usage = Number(quota.usage || 0);
    const limit = Number(quota.limit || 1);
    
    return NextResponse.json({
      success: true,
      isConnected: true,
      email: user?.emailAddress || null,
      quota: {
        usage,
        limit,
        used_percent: (usage / limit) * 100
      }
    });

  } catch (error) {
    console.error("Failed to fetch GDrive status:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch Google Drive status", isConnected: false },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role?: string }).role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.systemConfig.update({
      where: { id: "global" },
      data: { googleRefreshToken: null }
    });

    return NextResponse.json({ success: true, isConnected: false });
  } catch (_error) {
    return NextResponse.json(
      { success: false, error: "Failed to disconnect Google Drive" },
      { status: 500 }
    );
  }
}
