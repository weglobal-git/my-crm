"use server";

import prisma from "@/lib/prisma";
import { notifyPrivatePipelineUpdate, requireOpportunityAccess } from "@/lib/pipeline-security";

export async function getNotes(opportunityId: string) {
  try {
    await requireOpportunityAccess(opportunityId);

    const notes = await prisma.note.findMany({
      where: { opportunityId },
      include: {
        author: {
          select: { name: true, image: true, email: true },
        },
      },
      orderBy: [
        { isPinned: "desc" },
        { createdAt: "desc" },
      ],
    });

    return notes;
  } catch (error) {
    console.error("Failed to fetch notes:", error);
    throw new Error("Failed to fetch notes");
  }
}

export async function createNote(opportunityId: string, content: string, color?: string) {
  try {
    const { actor } = await requireOpportunityAccess(opportunityId);

    const note = await prisma.note.create({
      data: {
        content,
        color,
        opportunityId,
        authorId: actor.id,
      },
      include: {
        author: {
          select: { name: true, image: true, email: true },
        },
      },
    });

    await notifyPrivatePipelineUpdate(opportunityId, { action: 'NOTE_ADDED', dealId: opportunityId, note });

    return note;
  } catch (error) {
    console.error("Failed to create note:", error);
    throw new Error("Failed to create note");
  }
}

export async function deleteNote(noteId: string) {
  try {
    const note = await prisma.note.findUnique({ where: { id: noteId } });
    if (!note) throw new Error("Note not found");
    const { actor } = await requireOpportunityAccess(note.opportunityId);

    if (note.authorId !== actor.id && actor.role !== "ADMIN") {
      throw new Error("Unauthorized to delete this note");
    }

    await prisma.note.delete({ where: { id: noteId } });
    await notifyPrivatePipelineUpdate(note.opportunityId, { action: 'NOTE_DELETED', dealId: note.opportunityId, noteId });
    
    return true;
  } catch (error) {
    console.error("Failed to delete note:", error);
    throw new Error("Failed to delete note");
  }
}

export async function togglePinNote(noteId: string, isPinned: boolean) {
  try {
    const existingNote = await prisma.note.findUnique({ where: { id: noteId } });
    if (!existingNote) throw new Error("Note not found");
    await requireOpportunityAccess(existingNote.opportunityId);

    const note = await prisma.note.update({
      where: { id: noteId },
      data: { isPinned },
      include: { author: { select: { name: true, image: true, email: true } } },
    });
    
    await notifyPrivatePipelineUpdate(existingNote.opportunityId, { action: 'NOTE_UPDATED', dealId: existingNote.opportunityId, noteId, note });
    
    return note;
  } catch (error) {
    console.error("Failed to pin note:", error);
    throw new Error("Failed to pin note");
  }
}
