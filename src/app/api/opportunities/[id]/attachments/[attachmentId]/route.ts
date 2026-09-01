import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { v2 as cloudinary } from "cloudinary";
import { getDriveService } from "@/lib/google";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string, attachmentId: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: opportunityId, attachmentId } = await params;

    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId, opportunityId }
    });

    if (!attachment) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    // Delete from Cloudinary if it exists there
    if (attachment.cloudinaryPublicId) {
      try {
        const resourceType = attachment.fileType.startsWith("image/") ? "image" : "raw";
        await cloudinary.uploader.destroy(attachment.cloudinaryPublicId, {
          resource_type: resourceType
        });
      } catch (err) {
        console.error("Cloudinary delete error:", err);
      }
    }

    // Delete from Google Drive if archived
    if (attachment.googleDriveFileId) {
      try {
        const config = await prisma.systemConfig.findUnique({ where: { id: "global" } });
        if (config?.googleRefreshToken) {
          const drive = getDriveService(config.googleRefreshToken);
          await drive.files.delete({ fileId: attachment.googleDriveFileId });
        }
      } catch (err) {
        console.error("Google Drive delete error:", err);
      }
    }

    // Delete from database
    await prisma.attachment.delete({
      where: { id: attachmentId }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete attachment:", error);
    return NextResponse.json({ error: "Failed to delete attachment" }, { status: 500 });
  }
}
