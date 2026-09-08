"use client";

import { useSession, signOut } from "next-auth/react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { ReactNode, useEffect } from "react";
import { PermissionProvider } from "@/providers/PermissionProvider";
import { SidebarProvider } from "./SidebarContext";

import { initPusherConnectionHygiene } from "@/lib/pusher-connection-manager";

export function ClientShell({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (session?.user) {
      initPusherConnectionHygiene();
    }
  }, [session?.user]);

  useEffect(() => {
    if (session && (session as unknown as Record<string, unknown>).error === "SessionInvalidated") {
      signOut({ callbackUrl: "/" });
    }
  }, [session]);

  // Only show the full-screen loading state on initial mount when there is no session yet.
  // Avoid tearing down the UI during background session revalidation if session already exists.
  const isInitialLoading = status === "loading" && !session;
  if (isInitialLoading || (session && (session as unknown as Record<string, unknown>).error === "SessionInvalidated")) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-[#252728]">
        <svg className="animate-spin h-8 w-8 text-[#C7F33C]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  return (
    <PermissionProvider>
      <SidebarProvider>
        {session && session.user && <Sidebar />}
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          {session && session.user && <Header />}
          <main className="flex-1 flex flex-col h-full overflow-hidden">
            {children}
          </main>
        </div>
      </SidebarProvider>
    </PermissionProvider>
  );
}
