"use server";

import prisma from "@/lib/prisma";
import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";

async function checkAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    throw new Error("Unauthorized. Only ADMIN can perform this action.");
  }
}

export async function getUsers() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    throw new Error("Unauthorized.");
  }
  return await prisma.user.findMany({
    include: { departments: true },
    orderBy: { createdAt: "desc" }
  });
}

export async function getDepartments() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new Error("Unauthorized.");
  }
  return await prisma.department.findMany({
    orderBy: { name: "asc" }
  });
}

export async function updateUserRole(userId: string, newRole: Role) {
  await checkAdmin();
  const user = await prisma.user.update({
    where: { id: userId },
    data: { role: newRole }
  });
  revalidatePath("/user");
  return user;
}

export async function updateUserDepartments(userId: string, departmentIds: string[]) {
  await checkAdmin();
  const user = await prisma.user.update({
    where: { id: userId },
    data: { 
      departments: {
        set: departmentIds.map(id => ({ id }))
      }
    }
  });
  revalidatePath("/user");
  return user;
}

export async function createDepartment(name: string) {
  await checkAdmin();
  if (!name.trim()) throw new Error("Department name cannot be empty");
  
  const dept = await prisma.department.create({
    data: { name: name.trim() }
  });
  revalidatePath("/user");
  return dept;
}

export async function deleteDepartment(id: string) {
  await checkAdmin();
  // Check if department has users
  const dept = await prisma.department.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } }
  });

  if (!dept) throw new Error("Department not found");
  if (dept._count.users > 0) {
    throw new Error("Cannot delete department because it has users assigned to it.");
  }

  await prisma.department.delete({ where: { id } });
  revalidatePath("/system");
  return true;
}

export async function createUser(data: { name: string, email: string, role: Role, departmentIds: string[] }) {
  await checkAdmin();
  if (!data.name.trim() || !data.email.trim() || !data.role) {
    throw new Error("Name, Email, and Role are required.");
  }
  
  const existingEmail = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existingEmail) {
    throw new Error("This email is already registered in the system.");
  }

  const existingName = await prisma.user.findFirst({ 
    where: { 
      name: {
        equals: data.name.trim(),
        mode: 'insensitive'
      }
    } 
  });
  if (existingName) {
    throw new Error("This name is already used by another user.");
  }

  const user = await prisma.user.create({
    data: {
      name: data.name.trim(),
      email: data.email.toLowerCase(),
      role: data.role,
      departments: {
        connect: data.departmentIds.map(id => ({ id }))
      }
    }
  });
  
  revalidatePath("/system");
  return user;
}

export async function updateUserDetails(userId: string, name: string, email: string) {
  await checkAdmin();
  if (!name.trim() || !email.trim()) throw new Error("Name and email are required");
  
  const existingEmail = await prisma.user.findFirst({ 
    where: { 
      email: email.toLowerCase(), 
      NOT: { id: userId } 
    } 
  });
  if (existingEmail) {
    throw new Error("This email is already in use by another user.");
  }

  const existingName = await prisma.user.findFirst({ 
    where: { 
      name: {
        equals: name.trim(),
        mode: 'insensitive'
      },
      NOT: { id: userId } 
    } 
  });
  if (existingName) {
    throw new Error("This name is already used by another user.");
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { 
      name: name.trim(), 
      email: email.toLowerCase() 
    }
  });
  
  
  revalidatePath("/system");
  return user;
}

export async function updateDepartmentName(id: string, name: string) {
  await checkAdmin();
  if (!name.trim()) throw new Error("Department name cannot be empty");
  
  const dept = await prisma.department.update({
    where: { id },
    data: { name: name.trim() }
  });
  
  revalidatePath("/system");
  return dept;
}

export async function deleteUser(userId: string) {
  await checkAdmin();
  const session = await getServerSession(authOptions);
  
  if (session?.user?.id === userId) {
    throw new Error("You cannot delete your own account.");
  }
  
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user?.email === "weglobal.server@gmail.com") {
    throw new Error("Cannot delete system administrator account.");
  }

  await prisma.user.delete({
    where: { id: userId }
  });
  
  revalidatePath("/system");
  return { success: true };
}
