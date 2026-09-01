"use server";

import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function getNotes(opportunityId: string) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw new Error("Unauthorized");

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
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) throw new Error("Unauthorized");

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) throw new Error("User not found");

    const note = await prisma.note.create({
      data: {
        content,
        color,
        opportunityId,
        authorId: user.id,
      },
      include: {
        author: {
          select: { name: true, image: true, email: true },
        },
      },
    });

    return note;
  } catch (error) {
    console.error("Failed to create note:", error);
    throw new Error("Failed to create note");
  }
}

export async function deleteNote(noteId: string) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) throw new Error("Unauthorized");

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) throw new Error("User not found");

    const note = await prisma.note.findUnique({ where: { id: noteId } });
    if (!note) throw new Error("Note not found");

    if (note.authorId !== user.id && user.role !== "ADMIN") {
      throw new Error("Unauthorized to delete this note");
    }

    await prisma.note.delete({ where: { id: noteId } });
    return true;
  } catch (error) {
    console.error("Failed to delete note:", error);
    throw new Error("Failed to delete note");
  }
}

export async function togglePinNote(noteId: string, isPinned: boolean) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) throw new Error("Unauthorized");

    const note = await prisma.note.update({
      where: { id: noteId },
      data: { isPinned },
    });
    return note;
  } catch (error) {
    console.error("Failed to pin note:", error);
    throw new Error("Failed to pin note");
  }
}
