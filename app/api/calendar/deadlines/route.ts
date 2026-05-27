import { NextResponse } from "next/server";
import type { Task } from "@/lib/types";
import {
  deleteDeadlineEvent,
  getAccessToken,
  upsertDeadlineEvent
} from "@/lib/google-calendar-server";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    task: Task;
    accessToken?: string;
    action?: "upsert" | "delete";
  };
  const accessToken = getAccessToken(request, body);

  if (!accessToken) {
    return NextResponse.json({
      synced: false,
      reason:
        "Google Calendar is not connected. Sign in with Supabase Google OAuth and Calendar scopes.",
      taskId: body.task.id
    }, { status: 401 });
  }

  try {
    if (body.action === "delete" || body.task.is_completed) {
      const result = await deleteDeadlineEvent(accessToken, body.task);

      return NextResponse.json({
        synced: true,
        action: "delete",
        taskId: body.task.id,
        ...result
      });
    }

    const result = await upsertDeadlineEvent(accessToken, body.task);

    return NextResponse.json({
      synced: true,
      action: "upsert",
      taskId: body.task.id,
      googleEventId: result.eventId,
      calendarId: result.calendarId
    });
  } catch (error) {
    return NextResponse.json(
      {
        synced: false,
        reason:
          error instanceof Error
            ? error.message
            : "Unable to sync deadline to Google Calendar.",
        taskId: body.task.id
      },
      { status: 502 }
    );
  }
}
