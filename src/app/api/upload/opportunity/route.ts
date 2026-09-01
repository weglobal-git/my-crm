import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import prisma from "@/lib/prisma";
import { requireOpportunityAccess } from "@/lib/pipeline-security";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { fileBase64, fileName, fileType, size, opportunityId } = body;

    if (!fileBase64 || !opportunityId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const { actor } = await requireOpportunityAccess(opportunityId);

    // Use auto to let Cloudinary determine the best resource type (treats PDF as image)
    const resourceType = "auto";
    
    // Generate a unique identifier to prevent overwriting
    const uniqueSuffix = Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
    const safeFileName = fileName.replace(/\.[^/.]+$/, ""); // strip extension
    const publicId = `${safeFileName}_${uniqueSuffix}`;

    // Upload to Cloudinary
    const uploadResponse = await cloudinary.uploader.upload(fileBase64, {
      folder: `weglobal/opportunities/${opportunityId}`,
      resource_type: resourceType,
      public_id: publicId,
    });

    // Save to Database
    const attachment = await prisma.attachment.create({
      data: {
        fileName,
        fileType,
        size,
        cloudinaryUrl: uploadResponse.secure_url,
        cloudinaryPublicId: uploadResponse.public_id,
        opportunityId,
        uploaderId: actor.id,
      }
    });

    return NextResponse.json({ 
      success: true, 
      attachment
    });

  } catch (error: unknown) {
    console.error("Cloudinary upload error:", error);
    const message = error instanceof Error ? error.message : "Upload failed";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
