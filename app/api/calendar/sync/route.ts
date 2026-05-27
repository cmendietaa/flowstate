import { NextResponse } from "next/server";
import type { Task } from "@/lib/types";
import { getAccessToken, upsertDeadlineEvent } from "@/lib/google-calendar-server";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    tasks: Task[];
    accessToken?: string;
  };
  const accessToken = getAccessToken(request, body);

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

  const openTasks = body.tasks.filter((task) => !task.is_completed);
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
