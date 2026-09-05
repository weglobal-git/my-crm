import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pusherServer } from "@/lib/pusher";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.text();
  const params = new URLSearchParams(body);
  const socketId = params.get("socket_id");
  const channelName = params.get("channel_name");

  if (!socketId || !channelName) {
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
    return NextResponse.json(authResponse);
  }

  // Private channel auth
  if (channelName.startsWith("private-")) {
    const allowedPrivateChannels = new Set([
      `private-user-${session.user.id}`,
      `private-pipeline-${session.user.id}`,
    ]);
    if (!allowedPrivateChannels.has(channelName)) {
      return NextResponse.json({ error: "Forbidden channel" }, { status: 403 });
    }
    const authResponse = pusherServer.authorizeChannel(socketId, channelName);
    return NextResponse.json(authResponse);
  }

  return NextResponse.json({ error: "Channel type not supported" }, { status: 403 });
}
