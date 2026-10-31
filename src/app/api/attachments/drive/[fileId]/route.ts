import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getDriveService } from '@/lib/google';
import { requireOpportunityAccess } from '@/lib/pipeline-security';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;
    const cleanFileId = fileId?.trim();
    if (!cleanFileId) {
      return NextResponse.json({ error: 'Missing file ID' }, { status: 400 });
    }

    const attachment = await prisma.attachment.findFirst({
      where: { googleDriveFileId: cleanFileId },
      select: {
        id: true,
        opportunityId: true,
        fileName: true,
        fileType: true,
      },
    });

    if (!attachment) {
      return NextResponse.json({ error: 'Archived attachment not found' }, { status: 404 });
    }

    await requireOpportunityAccess(attachment.opportunityId, { capability: 'deal:view' });

    const config = await prisma.systemConfig.findUnique({
      where: { id: 'global' },
      select: { googleRefreshToken: true },
    });

    if (!config?.googleRefreshToken) {
      return NextResponse.json(
        { error: 'Google Drive archive storage is not connected' },
        { status: 503 }
      );
    }

    const drive = getDriveService(config.googleRefreshToken);
    const driveRes = await drive.files.get(
      { fileId: cleanFileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );

    const buffer = Buffer.from(driveRes.data as ArrayBuffer);
    const encodedName = encodeURIComponent(attachment.fileName || 'attachment');

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': attachment.fileType || 'application/octet-stream',
        'Content-Disposition': `inline; filename*=UTF-8''${encodedName}`,
        'Cache-Control': 'private, max-age=86400, immutable',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to stream archived file';
    if (message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (message === 'Opportunity not found.') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    console.error('[drive-attachment-proxy] Error streaming Drive file:', error);
    return NextResponse.json({ error: 'Failed to load archived file' }, { status: 500 });
  }
}

