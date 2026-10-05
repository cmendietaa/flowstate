import { NextResponse } from "next/server";
import { z } from "zod";
import type { Task } from "@/lib/types";
import { calendarTaskSchema } from "@/lib/schemas/task";
import { getAccessToken, upsertDeadlineEvent } from "@/lib/google-calendar-server";

export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { synced: false, reason: "Request body must be valid JSON.", results: [] },
      { status: 400 }
    );
  }

  const body = rawBody as {
    tasks?: unknown;
  };
  const parsedTasks = z.array(calendarTaskSchema).safeParse(body.tasks);

  if (!parsedTasks.success) {
    return NextResponse.json(
      { synced: false, reason: "A valid tasks array is required.", results: [] },
      { status: 400 }
    );
  }

  const accessToken = getAccessToken(request);

  if (!accessToken) {
    return NextResponse.json(
      {
        synced: false,
        reason: "Google Calendar is not connected.",
        results: []
      },
      { status: 401 }
    );
  }

  const openTasks = parsedTasks.data.filter((task) => !task.is_completed) as Task[];
  const results = await Promise.allSettled(
    openTasks.map((task) => upsertDeadlineEvent(accessToken, task))
  );

  return NextResponse.json({
    synced: results.every((result) => result.status === "fulfilled"),
    results: results.map((result, index) => ({
      taskId: openTasks[index]?.id,
      ok: result.status === "fulfilled",
      detail:
        result.status === "fulfilled"
          ? result.value
          : result.reason instanceof Error
            ? result.reason.message
            : "Sync failed"
    }))
  });
}
