import { NextRequest, NextResponse } from "next/server";
import { oauth2Client } from "@/lib/google";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/system/general?error=missing_code", request.url));
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    if (tokens.refresh_token) {
      await prisma.systemConfig.upsert({
        where: { id: "global" },
        update: { googleRefreshToken: tokens.refresh_token },
        create: { id: "global", googleRefreshToken: tokens.refresh_token }
      });
    }

    return NextResponse.redirect(new URL("/system/general?success=gdrive_connected", request.url));
  } catch (error) {
    console.error("Error exchanging token:", error);
    return NextResponse.redirect(new URL("/system/general?error=token_exchange_failed", request.url));
  }
}
