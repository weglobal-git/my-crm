"use server";

import prisma from "@/lib/prisma";
import { notifyPrivatePipelineUpdate, requireOpportunityAccess } from "@/lib/pipeline-security";

export async function getNotes(opportunityId: string) {
  try {
    const [, notes] = await Promise.all([
      requireOpportunityAccess(opportunityId, { capability: 'deal:view' }),
      prisma.note.findMany({
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
    }),
  ]);

    return notes;
  } catch (error) {
    console.error("Failed to fetch notes:", error);
    throw new Error("Failed to fetch notes");
  }
}

export async function createNote(opportunityId: string, content: string, color?: string) {
  try {
    const { actor } = await requireOpportunityAccess(opportunityId, { capability: 'deal:interact' });

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
    const { actor } = await requireOpportunityAccess(note.opportunityId, { capability: 'deal:interact' });

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
    await requireOpportunityAccess(existingNote.opportunityId, { capability: 'deal:interact' });

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

export async function toggleCompleteNote(noteId: string, isCompleted: boolean) {
  try {
    const existingNote = await prisma.note.findUnique({ where: { id: noteId } });
    if (!existingNote) throw new Error("Note not found");
    await requireOpportunityAccess(existingNote.opportunityId, { capability: 'deal:interact' });

    const note = await prisma.note.update({
      where: { id: noteId },
      data: { isCompleted },
      include: { author: { select: { name: true, image: true, email: true } } },
    });

    await notifyPrivatePipelineUpdate(existingNote.opportunityId, { action: 'NOTE_UPDATED', dealId: existingNote.opportunityId, noteId, note });

    return note;
  } catch (error) {
    console.error("Failed to toggle complete note:", error);
    throw new Error("Failed to update note completion status");
  }
}

export async function togglePriorityNote(noteId: string, isPinned: boolean) {
  return togglePinNote(noteId, isPinned);
}

export interface DealTodoItem {
  id: string;
  content: string;
  isPinned: boolean;
  isCompleted?: boolean;
}

export async function getPendingTodosMap(
  dealIds: string[]
): Promise<Record<string, DealTodoItem[]>> {
  if (!dealIds || dealIds.length === 0) return {};

  try {
    const notes = await prisma.note.findMany({
      where: {
        opportunityId: { in: dealIds },
        isCompleted: false,
      },
      select: {
        id: true,
        content: true,
        isPinned: true,
        opportunityId: true,
      },
      orderBy: [
        { isPinned: "desc" },
        { createdAt: "desc" },
      ],
    });

    const map: Record<string, DealTodoItem[]> = {};
    for (const note of notes) {
      if (!map[note.opportunityId]) {
        map[note.opportunityId] = [];
      }
      map[note.opportunityId].push({
        id: note.id,
        content: note.content,
        isPinned: note.isPinned,
        isCompleted: false,
      });
    }

    return map;
  } catch (error) {
    console.error("Failed to fetch pending todos map:", error);
    return {};
  }
}
