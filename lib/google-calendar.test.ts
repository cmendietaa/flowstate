import { describe, expect, it } from "vitest";
import {
  getAccessToken,
  listGoogleCalendarBlocks,
  mapGoogleEventToBlock,
  taskToGoogleEvent
} from "@/lib/google-calendar-server";
import type { Task } from "@/lib/types";

const task: Task = {
  id: "task-1",
  course_id: "course-1",
  title: "Midterm review",
  item_type: "assignment",
  due_date: "2026-10-08T18:00:00.000Z",
  estimated_total_hours: 4,
  estimated_hours: 4,
  progress_percent: 0,
  remaining_hours_override: null,
  weight: 0.25,
  is_completed: false,
  google_event_id: null
};

describe("Google Calendar integration helpers", () => {
  it("creates a one-hour deadline event from a FlowState task", () => {
    expect(taskToGoogleEvent(task)).toEqual({
      summary: "FlowState: Midterm review",
      description: "Synced from FlowState.",
      start: { dateTime: "2026-10-08T18:00:00.000Z" },
      end: { dateTime: "2026-10-08T19:00:00.000Z" }
    });
  });

  it("normalizes external events and identifies academic exams", () => {
    expect(
      mapGoogleEventToBlock(
        {
          id: "event-1",
          summary: "CHEM 1A Final Exam",
          start: { dateTime: "2026-10-09T20:00:00-07:00" },
          end: { dateTime: "2026-10-09T22:00:00-07:00" }
        },
        "calendar-1"
      )
    ).toMatchObject({
      id: "google-calendar-1-event-1",
      title: "CHEM 1A Final Exam",
      kind: "exam",
      external_id: "event-1",
      calendar_id: "calendar-1",
      is_readonly: true,
      start: "2026-10-10T03:00:00.000Z",
      end: "2026-10-10T05:00:00.000Z"
    });
  });

  it("only accepts bearer tokens from API request headers", () => {
    const request = new Request("http://localhost/api/calendar/events", {
      headers: { Authorization: "Bearer session-token" }
    });

    expect(getAccessToken(request)).toBe("session-token");
    expect(getAccessToken(new Request("http://localhost/api/calendar/events"))).toBe(
      null
    );
  });

  it("follows calendar and event pagination while excluding deadlines", async () => {
    const originalFetch = globalThis.fetch;
    const requests: string[] = [];
    globalThis.fetch = async (input) => {
      const url = String(input);
      requests.push(url);

      if (url.endsWith("/users/me/calendarList")) {
        return Response.json({
          items: [{ id: "calendar-1", summary: "Classes" }],
          nextPageToken: "calendar-page-2"
        });
      }

      if (url.includes("calendarList?pageToken=calendar-page-2")) {
        return Response.json({
          items: [{ id: "deadlines", summary: "FlowState Deadlines" }]
        });
      }

      if (url.includes("/calendars/calendar-1/events?") && !url.includes("pageToken=")) {
        return Response.json({
          items: [
            {
              id: "class-1",
              summary: "PSTAT lecture",
              start: { dateTime: "2026-10-06T17:00:00Z" },
              end: { dateTime: "2026-10-06T18:00:00Z" }
            }
          ],
          nextPageToken: "event-page-2"
        });
      }

      return Response.json({
        items: [
          {
            id: "class-2",
            summary: "CHEM lab",
            start: { dateTime: "2026-10-07T17:00:00Z" },
            end: { dateTime: "2026-10-07T19:00:00Z" }
          }
        ]
      });
    };

    try {
      const blocks = await listGoogleCalendarBlocks({
        accessToken: "token",
        timeMin: "2026-10-06T00:00:00.000Z",
        timeMax: "2026-10-08T00:00:00.000Z"
      });

      expect(blocks.map((block) => block.external_id)).toEqual(["class-1", "class-2"]);
      expect(requests).toHaveLength(4);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
