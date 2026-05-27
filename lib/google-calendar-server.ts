import { addHours } from "date-fns";
import type { CalendarBlock, Task } from "@/lib/types";

const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const DEADLINES_CALENDAR_NAME = "FlowState Deadlines";

interface GoogleCalendarListEntry {
  id: string;
  summary: string;
}

interface GoogleEventDate {
  date?: string;
  dateTime?: string;
}

interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  start?: GoogleEventDate;
  end?: GoogleEventDate;
}

async function googleFetch<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {}
) {
  const response = await fetch(`${GOOGLE_CALENDAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google Calendar request failed: ${response.status} ${detail}`);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

function normalizeGoogleDate(date: GoogleEventDate | undefined) {
  if (!date) {
    return new Date().toISOString();
  }

  if (date.dateTime) {
    return new Date(date.dateTime).toISOString();
  }

  return new Date(`${date.date}T00:00:00`).toISOString();
}

export function getAccessToken(request: Request, body?: { accessToken?: string }) {
  const authHeader = request.headers.get("authorization");

  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice("bearer ".length).trim();
  }

  return body?.accessToken ?? null;
}

export function taskToGoogleEvent(task: Task) {
  const dueDate = new Date(task.due_date);
  const endDate = addHours(dueDate, 1);

  return {
    summary: `FlowState: ${task.title}`,
    description: "Synced from FlowState.",
    start: {
      dateTime: dueDate.toISOString()
    },
    end: {
      dateTime: endDate.toISOString()
    }
  };
}

export function mapGoogleEventToBlock(
  event: GoogleCalendarEvent,
  calendarId: string
): CalendarBlock {
  return {
    id: `google-${calendarId}-${event.id}`,
    title: event.summary ?? "Untitled event",
    start: normalizeGoogleDate(event.start),
    end: normalizeGoogleDate(event.end),
    kind: /exam|midterm|final|quiz/i.test(event.summary ?? "")
      ? "exam"
      : "personal",
    external_id: event.id,
    calendar_id: calendarId,
    is_readonly: true
  };
}

export async function getDeadlineCalendarId(accessToken: string) {
  const calendars = await googleFetch<{ items?: GoogleCalendarListEntry[] }>(
    accessToken,
    "/users/me/calendarList"
  );
  const existing = calendars.items?.find(
    (calendar) => calendar.summary === DEADLINES_CALENDAR_NAME
  );

  if (existing) {
    return existing.id;
  }

  const created = await googleFetch<GoogleCalendarListEntry>(accessToken, "/calendars", {
    method: "POST",
    body: JSON.stringify({
      summary: DEADLINES_CALENDAR_NAME,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    })
  });

  return created.id;
}

export async function listGoogleCalendarBlocks({
  accessToken,
  timeMin,
  timeMax
}: {
  accessToken: string;
  timeMin: string;
  timeMax: string;
}) {
  const calendars = await googleFetch<{ items?: GoogleCalendarListEntry[] }>(
    accessToken,
    "/users/me/calendarList"
  );
  const readableCalendars =
    calendars.items?.filter((calendar) => calendar.summary !== DEADLINES_CALENDAR_NAME) ??
    [];
  const blocks = await Promise.all(
    readableCalendars.map(async (calendar) => {
      const params = new URLSearchParams({
        singleEvents: "true",
        orderBy: "startTime",
        timeMin,
        timeMax
      });
      const events = await googleFetch<{ items?: GoogleCalendarEvent[] }>(
        accessToken,
        `/calendars/${encodeURIComponent(calendar.id)}/events?${params.toString()}`
      );

      return (events.items ?? []).map((event) =>
        mapGoogleEventToBlock(event, calendar.id)
      );
    })
  );

  return blocks.flat();
}

export async function upsertDeadlineEvent(accessToken: string, task: Task) {
  const calendarId = await getDeadlineCalendarId(accessToken);
  const event = taskToGoogleEvent(task);

  if (task.google_event_id) {
    const updated = await googleFetch<GoogleCalendarEvent>(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(
        task.google_event_id
      )}`,
      {
        method: "PATCH",
        body: JSON.stringify(event)
      }
    );

    return { calendarId, eventId: updated.id };
  }

  const created = await googleFetch<GoogleCalendarEvent>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      body: JSON.stringify(event)
    }
  );

  return { calendarId, eventId: created.id };
}

export async function deleteDeadlineEvent(accessToken: string, task: Task) {
  if (!task.google_event_id) {
    return { deleted: false };
  }

  const calendarId = await getDeadlineCalendarId(accessToken);

  await googleFetch<null>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(
      task.google_event_id
    )}`,
    { method: "DELETE" }
  );

  return { deleted: true, calendarId };
}
