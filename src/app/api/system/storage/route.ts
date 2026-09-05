import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

let cachedStorageUsage: { data: Record<string, unknown>; timestamp: number } | null = null;
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes cache

export async function GET() {
  const now = Date.now();
  if (cachedStorageUsage && now - cachedStorageUsage.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cachedStorageUsage.data);
  }

  try {
    const usage = await cloudinary.api.usage();
    
    const payload = {
      success: true,
      storage: {
        usage: usage.storage?.usage || 0,
        limit: usage.storage?.limit || 26843545600, // Default 25GB if not found
        used_percent: usage.storage?.used_percent || 0
      },
      bandwidth: {
        usage: usage.bandwidth?.usage || 0,
        limit: usage.bandwidth?.limit || 26843545600,
        used_percent: usage.bandwidth?.used_percent || 0
      }
    };

    cachedStorageUsage = { data: payload, timestamp: now };
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Failed to fetch cloudinary usage:", error);
    if (cachedStorageUsage) {
      // Fallback to stale cache if available
      return NextResponse.json(cachedStorageUsage.data);
    }
    return NextResponse.json(
      { success: false, error: "Failed to fetch storage usage" },
      { status: 500 }
    );
  }
}
