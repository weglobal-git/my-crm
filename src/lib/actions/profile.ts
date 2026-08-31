"use server";

import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function updateProfileImage(imageUrl: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: { image: imageUrl },
    });

    return { success: true, image: updatedUser.image };
  } catch (error) {
    console.error("Error updating profile image:", error);
    throw new Error("Failed to update profile image");
  }
}

export async function updateProfileName(name: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: { name },
    });

    return { success: true, name: updatedUser.name };
  } catch (error) {
    console.error("Error updating profile name:", error);
    throw new Error("Failed to update profile name");
  }
}
