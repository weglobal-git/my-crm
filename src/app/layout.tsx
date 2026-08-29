import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SB Interlab CRM",
  description: "Internal CRM Platform",
};

import { SessionProvider } from "@/components/providers/SessionProvider";
import { ClientShell } from "@/components/layout/ClientShell";

import { DialogProvider } from "@/providers/DialogProvider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`h-full antialiased`}
    >
      <body className="min-h-full flex h-screen overflow-hidden text-slate-900 bg-[var(--background)]">
        <SessionProvider>
          <DialogProvider>
            <ClientShell>
              {children}
            </ClientShell>
          </DialogProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
