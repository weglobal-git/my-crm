import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authorizePusherRequest } from "@/lib/pusher-auth-authorizer";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    console.warn("[PUSHER-AUTH] 401 Unauthorized - No session user");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.text();
  const params = new URLSearchParams(body);
  const socketId = params.get("socket_id");
  const channelName = params.get("channel_name");

  if (!socketId || !channelName) {
    console.warn("[PUSHER-AUTH] 400 Missing params:", { socketId, channelName });
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  const result = await authorizePusherRequest(socketId, channelName, session.user as {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: string;
  });

  return NextResponse.json(result.body, { status: result.status });
}

