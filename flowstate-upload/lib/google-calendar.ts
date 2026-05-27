import type { Task } from "@/lib/types";

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
}

export async function upsertDeadlineEvent(task: Task) {
  const response = await fetch("/api/calendar/deadlines", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task })
  });

  if (!response.ok) {
    throw new Error("Unable to sync deadline to Google Calendar.");
  }

  return response.json();
}
