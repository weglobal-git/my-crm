import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import type { Prisma } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { getDriveService } from '@/lib/google';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const ARCHIVE_BATCH_LIMIT = 15;
const CLOSED_OPPORTUNITY_RETENTION_DAYS = 30;
const LTC_ATTACHMENT_RETENTION_DAYS = 120;

async function ensureCrmArchiveFolder(
  drive: ReturnType<typeof getDriveService>
): Promise<string | undefined> {
  const folderSearch = await drive.files.list({
    q: "mimeType = 'application/vnd.google-apps.folder' and name = 'CRM_Archive' and trashed = false",
    fields: 'files(id, name)',
    pageSize: 1,
  });

  if (folderSearch.data.files && folderSearch.data.files.length > 0) {
    return folderSearch.data.files[0].id ?? undefined;
  }

  const created = await drive.files.create({
    requestBody: {
      name: 'CRM_Archive',
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Automated Cold Storage Archive from CRM',
    },
    fields: 'id',
  });
  return created.data.id ?? undefined;
}

async function runColdStorageArchiveBatch() {
  const nowMs = Date.now();
  const closedCutoff = new Date(nowMs - CLOSED_OPPORTUNITY_RETENTION_DAYS * 86_400_000);
  const ltcCutoff = new Date(nowMs - LTC_ATTACHMENT_RETENTION_DAYS * 86_400_000);

  const eligibleWhere: Prisma.AttachmentWhereInput = {
    googleDriveFileId: null,
    cloudinaryPublicId: { not: null },
    cloudinaryUrl: { not: null },
    OR: [
      {
        opportunity: {
          status: { in: ['WON', 'LOST', 'COMPLETED', 'CANCELLED'] },
          OR: [
            { closedAt: { lt: closedCutoff } },
            { closedAt: null, updatedAt: { lt: closedCutoff } },
          ],
        },
      },
      {
        createdAt: { lt: ltcCutoff },
        opportunity: {
          pipelineStageId: null,
        },
      },
    ],
  };

  const attachments = await prisma.attachment.findMany({
    where: eligibleWhere,
    orderBy: { createdAt: 'asc' },
    take: ARCHIVE_BATCH_LIMIT,
  });

  if (attachments.length === 0) {
    return {
      success: true,
      archivedCount: 0,
      attemptedCount: 0,
      remainingCount: 0,
      freedBytes: 0,
      message: 'No eligible attachments waiting to be archived.',
    };
  }

  const config = await prisma.systemConfig.findUnique({ where: { id: 'global' } });
  if (!config?.googleRefreshToken) {
    return {
      success: false,
      status: 400,
      error: 'Google Drive not connected',
    };
  }

  const drive = getDriveService(config.googleRefreshToken);
  const archiveFolderId = await ensureCrmArchiveFolder(drive);

  let archivedCount = 0;
  let freedBytes = 0;

  for (const attachment of attachments) {
    try {
      const oldCloudinaryUrl = attachment.cloudinaryUrl;
      const oldPublicId = attachment.cloudinaryPublicId;
      if (!oldCloudinaryUrl || !oldPublicId) continue;

      // 1. Download file from Cloudinary
      const response = await fetch(oldCloudinaryUrl, {
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        throw new Error(`Cloudinary fetch failed (${response.status} ${response.statusText})`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // 2. Upload to Google Drive CRM_Archive folder
      const driveRes = await drive.files.create({
        requestBody: {
          name: `[Archived] ${attachment.fileName}`,
          description: `Archived from CRM. Opportunity ID: ${attachment.opportunityId}`,
          ...(archiveFolderId ? { parents: [archiveFolderId] } : {}),
        },
        media: {
          mimeType: attachment.fileType || 'application/octet-stream',
          body: Readable.from(buffer),
        },
        fields: 'id',
      });

      const driveFileId = driveRes.data.id;
      if (!driveFileId) {
        throw new Error('Google Drive returned empty file ID');
      }

      const proxyUrl = `/api/attachments/drive/${driveFileId}`;

      // 3. Rewrite ActivityLog comment tags so inline chat images/files never 404
      const referencingLogs = await prisma.activityLog.findMany({
        where: {
          opportunityId: attachment.opportunityId,
          content: { contains: oldCloudinaryUrl },
        },
        select: { id: true, content: true },
      });

      await prisma.$transaction([
        ...referencingLogs.map((log) => {
          const legacyBareTag = `[ATTACHMENT:${oldCloudinaryUrl}]`;
          const enrichedProxyTag = `[ATTACHMENT:${proxyUrl}|${attachment.fileName}|${attachment.fileType}]`;
          const nextContent = log.content
            .split(legacyBareTag)
            .join(enrichedProxyTag)
            .split(oldCloudinaryUrl)
            .join(proxyUrl);
          return prisma.activityLog.update({
            where: { id: log.id },
            data: { content: nextContent },
          });
        }),
        prisma.attachment.update({
          where: { id: attachment.id },
          data: {
            googleDriveFileId: driveFileId,
            cloudinaryUrl: null,
            cloudinaryPublicId: null,
          },
        }),
      ]);

      // 4. Delete from Cloudinary (handling PDFs stored under resource_type 'image' via auto-upload)
      const primaryType = oldCloudinaryUrl.includes('/raw/upload/') ? 'raw' : 'image';
      const destroyRes = await cloudinary.uploader.destroy(oldPublicId, {
        resource_type: primaryType,
        invalidate: true,
      });
      if (destroyRes?.result === 'not found' && primaryType === 'image') {
        await cloudinary.uploader.destroy(oldPublicId, {
          resource_type: 'raw',
          invalidate: true,
        });
      }

      archivedCount += 1;
      freedBytes += attachment.size || buffer.byteLength;
    } catch (err) {
      console.error(`[cron/archive] Failed to archive attachment ${attachment.id}:`, err);
    }
  }

  const remainingCount = await prisma.attachment.count({ where: eligibleWhere });

  return {
    success: true,
    archivedCount,
    attemptedCount: attachments.length,
    remainingCount,
    freedBytes,
    message: `Archived ${archivedCount}/${attachments.length} file(s) to Google Drive (${remainingCount} remaining).`,
  };
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runColdStorageArchiveBatch();
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('[cron/archive] GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  try {
    const result = await runColdStorageArchiveBatch();
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('[cron/archive] POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
