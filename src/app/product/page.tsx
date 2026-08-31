import { PackageOpen } from "lucide-react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { getUserVisibleMenuKeys } from "@/lib/actions/permission";

export default async function ProductPage() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    redirect("/");
  }

  const { id: userId, role } = session.user as { id: string; role: string };

  if (role !== 'ADMIN') {
    const visibleKeys = await getUserVisibleMenuKeys(userId);
    if (!visibleKeys.includes('product')) {
      redirect("/");
    }
  }

  return (
    <div className="flex flex-col w-full h-full bg-black">
      <main className="flex-1 overflow-y-auto hide-scrollbar p-6 flex flex-col items-center justify-center">
        <div className="bg-[#3A3B3C] border border-[#4E4F50] rounded-[2rem] p-12 flex flex-col items-center max-w-md text-center">
          <div className="w-20 h-20 bg-black border border-[#4E4F50] rounded-full flex items-center justify-center mb-6">
            <PackageOpen className="w-10 h-10 text-slate-300" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100 mb-3">
            Under Construction
          </h1>
          <p className="text-slate-400 leading-relaxed">
            We are currently building this feature. Please check back later!
          </p>
        </div>
      </main>
    </div>
  );
}
