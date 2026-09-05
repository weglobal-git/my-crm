import React from 'react';
import SystemGeneralClient from '@/components/system/SystemGeneralClient';
import { getUsers, getDepartments } from "@/lib/actions/user";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function SystemGeneralPage() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "ADMIN") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="bg-[#3A3B3C] border border-[#4E4F50] p-8 rounded-[2rem] text-center">
          <h1 className="text-2xl font-bold text-red-400 mb-2">Access Denied</h1>
          <p className="text-slate-300">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  const [users, departments] = await Promise.all([
    getUsers(),
    getDepartments(),
  ]);

  return (
    <div className="flex-1 overflow-y-auto hide-scrollbar p-6 bg-[#252728]">
      <div className="max-w-[1400px] mx-auto w-full flex flex-col h-full">
        <SystemGeneralClient 
          initialUsers={users}
          initialDepartments={departments}
          currentUserRole={session.user.role as string}
        />
      </div>
    </div>
  );
}
