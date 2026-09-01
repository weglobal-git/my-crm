import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function GET() {
  try {
    const usage = await cloudinary.api.usage();
    
    return NextResponse.json({
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
    });
  } catch (error) {
    console.error("Failed to fetch cloudinary usage:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch storage usage" },
      { status: 500 }
    );
  }
}
