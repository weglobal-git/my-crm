import type { Metadata } from "next";
import "./globals.css";
import NextTopLoader from "nextjs-toploader";

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
