import { getPermissionMatrix } from "@/lib/actions/permission";
import { PermissionMatrix } from "@/components/system/PermissionMatrix";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function PermissionsPage() {
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

  const { departments: permDepts, menus } = await getPermissionMatrix();

  return (
    <div className="flex flex-col w-full h-full bg-[#252728] min-h-0">
      <PermissionMatrix 
        initialDepartments={permDepts} 
        menus={menus} 
      />
    </div>
  );
}
