import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contentType = (req.headers.get("content-type") || "").toLowerCase();
    let imageDataUri: string | null = null;
    let contactId: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");
      const rawContactId = formData.get("contactId");
      if (typeof rawContactId === "string" && rawContactId.trim()) {
        contactId = rawContactId.trim();
      }

      if (!(file instanceof File)) {
        return NextResponse.json({ error: "No image file provided" }, { status: 400 });
      }
      if (!file.type.startsWith("image/")) {
        return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
      }
      if (file.size > MAX_AVATAR_BYTES) {
        return NextResponse.json({ error: "Image must be smaller than 5MB" }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      imageDataUri = `data:${file.type};base64,${buffer.toString("base64")}`;
    } else {
      const body = await req.json();
      if (typeof body?.imageBase64 === "string" && body.imageBase64.trim()) {
        imageDataUri = body.imageBase64.trim();
      }
      if (typeof body?.contactId === "string" && body.contactId.trim()) {
        contactId = body.contactId.trim();
      }
    }

    if (!imageDataUri) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // Check Cloudinary config (including api_secret)
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      return NextResponse.json({ success: true, url: imageDataUri });
    }

    const publicId = contactId
      ? `contact_${contactId.replace(/[^a-zA-Z0-9_-]/g, "")}`
      : `contact_${Date.now()}`;
    const uploadResponse = await cloudinary.uploader.upload(imageDataUri, {
      folder: "weglobal/contacts",
      public_id: publicId,
      overwrite: true,
      transformation: [
        { width: 400, height: 400, crop: "fill", gravity: "face" },
      ],
    });

    return NextResponse.json({
      success: true,
      url: uploadResponse.secure_url,
    });
  } catch (error) {
    console.error("Contact avatar upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
