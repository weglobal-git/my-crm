import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { imageBase64, productId } = body;

    if (!imageBase64) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // Fallback if Cloudinary is not configured
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY) {
      return NextResponse.json({ success: true, url: imageBase64 });
    }

    // Upload to Cloudinary with automatic optimization
    const publicId = productId ? `prod_${productId}_${Date.now()}` : `prod_${Date.now()}`;
    const uploadResponse = await cloudinary.uploader.upload(imageBase64, {
      folder: "weglobal/products",
      public_id: publicId,
      overwrite: true,
      transformation: [
        { width: 800, height: 800, crop: "limit", fetch_format: "auto", quality: "auto" }
      ]
    });

    return NextResponse.json({
      success: true,
      url: uploadResponse.secure_url,
    });
  } catch (error) {
    console.error("Product image upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
