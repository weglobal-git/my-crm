import { getPermissionMatrix } from "@/lib/actions/permission";
import { MenuStructureBuilder } from "@/components/system/MenuStructureBuilder";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";

export default async function StructurePage() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "ADMIN") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="bg-white p-8 rounded-[2rem] text-center">
          <h1 className="text-2xl font-bold text-red-500 mb-2">Access Denied</h1>
          <p className="text-slate-500">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  const { menus } = await getPermissionMatrix();

  return (
    <div className="flex flex-col w-full h-full bg-[#f4f5f7]">
      {/* 2. WORK SPACE */}
      <main className="flex-1 overflow-y-auto hide-scrollbar p-6">
        <div className="max-w-[1400px] mx-auto w-full flex flex-col h-full">
          <MenuStructureBuilder menus={menus} />
        </div>
      </main>
    </div>
  );
}
