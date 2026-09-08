import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pusherServer } from "@/lib/pusher";

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

  console.log(`[PUSHER-AUTH] Request from user "${session.user.name}" (${session.user.email}, id=${session.user.id}) for channel="${channelName}" socketId="${socketId}"`);

  if (!socketId || !channelName) {
    console.warn("[PUSHER-AUTH] 400 Missing params:", { socketId, channelName });
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  // Presence channel auth
  if (channelName.startsWith("presence-")) {
    const presenceData = {
      user_id: session.user.id,
      user_info: {
        name: session.user.name,
        image: session.user.image,
        role: session.user.role,
        email: session.user.email,
        departments: session.user.departments,
      },
    };
    const authResponse = pusherServer.authorizeChannel(socketId, channelName, presenceData);
    console.log(`[PUSHER-AUTH] 200 Authorized presence channel "${channelName}"`);
    return NextResponse.json(authResponse);
  }

  // Private channel auth
  if (channelName.startsWith("private-")) {
    const allowedPrivateChannels = new Set([
      `private-user-${session.user.id}`,
      `private-pipeline-${session.user.id}`,
    ]);
    if (!allowedPrivateChannels.has(channelName)) {
      console.error(`[PUSHER-AUTH] 403 Forbidden channel "${channelName}" for user "${session.user.id}". Allowed:`, [...allowedPrivateChannels]);
      return NextResponse.json({ error: "Forbidden channel" }, { status: 403 });
    }
    const authResponse = pusherServer.authorizeChannel(socketId, channelName);
    console.log(`[PUSHER-AUTH] 200 Authorized private channel "${channelName}" for user "${session.user.name}"`);
    return NextResponse.json(authResponse);
  }

  console.warn(`[PUSHER-AUTH] 403 Channel type not supported: "${channelName}"`);
  return NextResponse.json({ error: "Channel type not supported" }, { status: 403 });
}
