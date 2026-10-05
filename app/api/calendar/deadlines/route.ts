import { NextResponse } from "next/server";
import type { Task } from "@/lib/types";
import { calendarTaskSchema } from "@/lib/schemas/task";
import {
  deleteDeadlineEvent,
  getAccessToken,
  upsertDeadlineEvent
} from "@/lib/google-calendar-server";

export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { synced: false, reason: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const body = rawBody as {
    task?: unknown;
    action?: "upsert" | "delete";
  };
  const parsedTask = calendarTaskSchema.safeParse(body.task);

  if (!parsedTask.success) {
    return NextResponse.json(
      { synced: false, reason: "A valid task is required." },
      { status: 400 }
    );
  }

  const task = parsedTask.data as Task;
  const accessToken = getAccessToken(request);

  if (!accessToken) {
    return NextResponse.json({
      synced: false,
      reason:
        "Google Calendar is not connected. Sign in with Supabase Google OAuth and Calendar scopes.",
      taskId: task.id
    }, { status: 401 });
  }

  try {
    if (body.action === "delete" || task.is_completed) {
      const result = await deleteDeadlineEvent(accessToken, task);

      return NextResponse.json({
        synced: true,
        action: "delete",
        taskId: task.id,
        ...result
      });
    }

    const result = await upsertDeadlineEvent(accessToken, task);

    return NextResponse.json({
      synced: true,
      action: "upsert",
      taskId: task.id,
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
        taskId: task.id
      },
      { status: 502 }
    );
  }
}
