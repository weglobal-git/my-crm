import { getUsers, getDepartments } from "@/lib/actions/user";
import { UserManagementClient } from "@/components/user/UserManagementClient";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";

export default async function UserManagementPage() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    redirect("/login");
  }

  // Only ADMIN can view this page
  if (session.user.role !== "ADMIN") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="bg-white p-8 rounded-[2rem] shadow-sm text-center">
          <h1 className="text-2xl font-bold text-red-500 mb-2">Access Denied</h1>
          <p className="text-slate-500">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  const users = await getUsers();
  const departments = await getDepartments();

  return (
    <div className="w-full h-full flex flex-col max-w-[1600px] mx-auto overflow-y-auto custom-scrollbar">
      <div className="flex flex-col gap-8 mb-10">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">
          User Management
        </h1>
        <p className="text-slate-500 max-w-2xl">
          Manage roles and department access for all team members. 
          Only Administrators can modify user roles and create new departments.
        </p>
      </div>

      <UserManagementClient 
        initialUsers={users} 
        initialDepartments={departments} 
        currentUserRole={session.user.role} 
        currentUserId={session.user.id}
      />
    </div>
  );
}
