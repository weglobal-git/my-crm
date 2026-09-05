import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getDriveService } from "@/lib/google";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

let cachedGoogleStatus: { data: Record<string, unknown>; timestamp: number } | null = null;
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes cache

export async function GET() {
  const now = Date.now();
  if (cachedGoogleStatus && now - cachedGoogleStatus.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cachedGoogleStatus.data);
  }

  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role?: string }).role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const config = await prisma.systemConfig.findUnique({
      where: { id: "global" }
    });

    if (!config?.googleRefreshToken) {
      const payload = { success: true, isConnected: false };
      cachedGoogleStatus = { data: payload, timestamp: now };
      return NextResponse.json(payload);
    }

    const drive = getDriveService(config.googleRefreshToken);
    
    // Fetch storage quota and user info
    const about = await drive.about.get({ fields: "storageQuota, user" });
    const quota = about.data.storageQuota;
    const user = about.data.user;

    if (!quota) {
      const payload = { success: true, isConnected: true, quota: null, email: user?.emailAddress || null };
      cachedGoogleStatus = { data: payload, timestamp: now };
      return NextResponse.json(payload);
    }

    const usage = Number(quota.usage || 0);
    const limit = Number(quota.limit || 1);
    
    const payload = {
      success: true,
      isConnected: true,
      email: user?.emailAddress || null,
      quota: {
        usage,
        limit,
        used_percent: (usage / limit) * 100
      }
    };

    cachedGoogleStatus = { data: payload, timestamp: now };
    return NextResponse.json(payload);

  } catch (error) {
    console.error("Failed to fetch GDrive status:", error);
    if (cachedGoogleStatus) {
      return NextResponse.json(cachedGoogleStatus.data);
    }
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

    cachedGoogleStatus = null; // Invalidate cache immediately

    return NextResponse.json({ success: true, isConnected: false });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to disconnect Google Drive" },
      { status: 500 }
    );
  }
}
