import type { Metadata } from "next";
import "./globals.css";
import NextTopLoader from "nextjs-toploader";

export const metadata: Metadata = {
  title: "SB Interlab CRM",
  description: "Internal CRM Platform",
};

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserVisibleMenuKeys, getDbMenus } from "@/lib/actions/permission";
import { MENU_REGISTRY, MenuDefinition } from "@/lib/menu-registry";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { ClientShell } from "@/components/layout/ClientShell";

import { DialogProvider } from "@/providers/DialogProvider";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  let initialVisibleKeys: string[] = [];
  let initialDbMenus: MenuDefinition[] = MENU_REGISTRY;

  if (session?.user) {
    try {
      const [rawMenus, visibleKeys] = await Promise.all([
        getDbMenus(),
        session.user.role === "ADMIN"
          ? Promise.resolve(MENU_REGISTRY.map((m) => m.key))
          : (session.user.id ? getUserVisibleMenuKeys(session.user.id) : Promise.resolve([])),
      ]);

      if (rawMenus && rawMenus.length > 0) {
        initialDbMenus = rawMenus.map((m: { key: string; label: string; level: number; parentKey: string | null; icon: string | null; href: string | null; sortOrder: number }) => ({
          key: m.key,
          label: m.label,
          level: m.level as 1 | 2 | 3,
          parentKey: m.parentKey || undefined,
          iconName: m.icon || undefined,
          href: m.href || undefined,
          sortOrder: m.sortOrder,
        }));
      }
      initialVisibleKeys = visibleKeys || [];
    } catch {
      initialVisibleKeys = [];
    }
  }

  return (
    <html
      lang="en"
      className={`h-full antialiased`}
    >
      <body className="min-h-full flex h-screen overflow-hidden text-slate-900 bg-[#252728]">
        <NextTopLoader
          color="#C7F33C"
          initialPosition={0.12}
          crawlSpeed={200}
          height={3}
          crawl={true}
          showSpinner={false}
          easing="ease"
          speed={200}
          shadow="0 0 12px #C7F33C, 0 0 4px #C7F33C"
          zIndex={99999}
        />
        <SessionProvider session={session}>
          <DialogProvider>
            <ClientShell 
              initialVisibleKeys={initialVisibleKeys}
              initialDbMenus={initialDbMenus}
            >
              {children}
            </ClientShell>
          </DialogProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
