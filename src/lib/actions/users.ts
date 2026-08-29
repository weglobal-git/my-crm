"use server";

import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function pingActiveStatus() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return;

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { lastActive: new Date() },
    });
  } catch (error) {
    console.error("Failed to ping active status:", error);
  }
}

export async function getActiveUsers() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return [];

  // Consider users active if they pinged within the last 1.5 minutes
  const activeThreshold = new Date(Date.now() - 90 * 1000);

  try {
    const activeUsers = await prisma.user.findMany({
      where: {
        lastActive: {
          gte: activeThreshold,
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        department: {
          select: {
            name: true,
          }
        },
        lastActive: true,
      },
      orderBy: {
        lastActive: 'desc',
      }
    });

    return activeUsers;
  } catch (error) {
    console.error("Failed to get active users:", error);
    return [];
  }
}

export async function getAllUsers() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return [];

  try {
    return await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        department: {
          select: { name: true }
        }
      },
      orderBy: { name: 'asc' }
    });
  } catch (error) {
    console.error("Failed to get all users:", error);
    return [];
  }
}
