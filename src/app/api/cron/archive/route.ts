import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getDriveService } from '@/lib/google';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function GET(request: Request) {
  // 1. Verify Vercel Cron Secret (Authentication)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 2. Find Opportunities closed > 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const oldOpportunities = await prisma.opportunity.findMany({
      where: {
        status: { in: ['WON', 'LOST'] },
        updatedAt: { lt: thirtyDaysAgo },
      },
      select: { id: true, topic: true }
    });

    if (oldOpportunities.length === 0) {
      return NextResponse.json({ success: true, message: 'No old opportunities to archive.' });
    }

    const oldOppIds = oldOpportunities.map(o => o.id);

    // 3. Fetch attachments that are still in Cloudinary (googleDriveFileId is null)
    const attachments = await prisma.attachment.findMany({
      where: {
        opportunityId: { in: oldOppIds },
        googleDriveFileId: null,
        cloudinaryPublicId: { not: null }
      }
    });

    if (attachments.length === 0) {
      return NextResponse.json({ success: true, message: 'No attachments to archive.' });
    }

    const config = await prisma.systemConfig.findUnique({ where: { id: "global" } });
    if (!config?.googleRefreshToken) {
      return NextResponse.json({ error: 'Google Drive not connected' }, { status: 400 });
    }

    const drive = getDriveService(config.googleRefreshToken);
    let archivedCount = 0;

    for (const attachment of attachments) {
      try {
        // a. Download from Cloudinary
        if (!attachment.cloudinaryUrl) throw new Error("No cloudinaryUrl");
        const response = await fetch(attachment.cloudinaryUrl);
        if (!response.ok) throw new Error(`Failed to fetch from Cloudinary: ${response.statusText}`);
        
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        const stream = new Readable();
        stream.push(buffer);
        stream.push(null);

        // b. Upload to Google Drive
        const driveRes = await drive.files.create({
          requestBody: {
            name: `[Archived] ${attachment.fileName}`,
            description: `Archived from CRM. Original Deal ID: ${attachment.opportunityId}`
          },
          media: {
            mimeType: attachment.fileType,
            body: stream,
          }
        });

        const driveFileId = driveRes.data.id;

        if (driveFileId) {
          // c. Update Database
          await prisma.attachment.update({
            where: { id: attachment.id },
            data: { googleDriveFileId: driveFileId }
          });

          // d. Delete from Cloudinary
          if (attachment.cloudinaryPublicId) {
            const resourceType = attachment.fileType.startsWith("image/") ? "image" : "raw";
            await cloudinary.uploader.destroy(attachment.cloudinaryPublicId, {
              resource_type: resourceType
            });
          }

          archivedCount++;
        }
      } catch (err) {
        console.error(`Failed to archive attachment ${attachment.id}:`, err);
        // Continue to the next attachment
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Archiving job completed. Successfully archived ${archivedCount}/${attachments.length} files.`,
    });

  } catch (error) {
    console.error('Error during cron archive:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
