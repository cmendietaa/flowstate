import { NextResponse } from "next/server";
import type { Task } from "@/lib/types";

export async function POST(request: Request) {
  const { task } = (await request.json()) as { task: Task };

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json({
      synced: false,
      reason:
        "Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and token storage before enabling live sync.",
      taskId: task.id
    });
  }

  return NextResponse.json({
    synced: false,
    reason:
      "OAuth token exchange and secondary calendar selection should be wired here after authentication is enabled.",
    taskId: task.id
  });
}
