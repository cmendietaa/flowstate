import { NextResponse } from "next/server";
import type { Course, DetectedAcademicItem } from "@/lib/types";
import { academicImportResponseSchema, courseSchema } from "@/lib/schemas/task";

function unfoldIcs(text: string) {
  return text
    .replace(/\r\n[ \t]/g, "")
    .replace(/\n[ \t]/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function unescapeIcs(value: string) {
  return value
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function fieldValue(line: string) {
  const separator = line.indexOf(":");
  return separator === -1 ? "" : unescapeIcs(line.slice(separator + 1));
}

function fieldName(line: string) {
  return line.slice(0, line.indexOf(":")).split(";")[0].toUpperCase();
}

function parseIcsDate(line: string, fallback: Date) {
  const value = fieldValue(line);
  const dateOnly = /VALUE=DATE/i.test(line) || /^\d{8}$/.test(value);
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);

  if (!match) return fallback;

  const [, year, month, day, hour = "23", minute = "59", second = "00", utc] = match;
  if (dateOnly) {
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 23, 59, 0));
  }

  return utc
    ? new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)))
    : new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
}

function inferCourse(summary: string, description: string, courses: Course[]) {
  const haystack = summary + " " + description;
  return courses.find((course) => haystack.toLowerCase().includes(course.name.toLowerCase()))?.name ?? "Unsorted Inbox";
}

function inferType(title: string): DetectedAcademicItem["type"] {
  if (/quiz|test/i.test(title)) return "quiz";
  if (/exam|midterm|final/i.test(title)) return "exam";
  if (/project|paper|essay/i.test(title)) return "project";
  if (/reading|chapter|pages/i.test(title)) return "reading";
  return "assignment";
}

function inferWeight(title: string): DetectedAcademicItem["weight"] {
  return /exam|midterm|final|project|paper/i.test(title)
    ? "high"
    : /quiz|test/i.test(title)
      ? "medium"
      : "low";
}

export function parseCanvasFeedEvents(ics: string, courses: Course[]) {
  const events: Array<Record<string, string>> = [];
  let current: Record<string, string> | null = null;

  for (const line of unfoldIcs(ics)) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) events.push(current);
      current = null;
      continue;
    }
    if (current && line.includes(":")) {
      current[fieldName(line)] = fieldValue(line);
    }
  }

  return events
    .filter((event) => event.SUMMARY && event.DTSTART)
    .map((event, index) => {
      const title = event.SUMMARY;
      const dueDate = parseIcsDate(event.DTSTART, new Date());
      const type = inferType(title);

      return {
        id: "canvas-feed-" + (event.UID ?? Date.now() + "-" + index),
        source: "canvas",
        courseName: inferCourse(title, event.DESCRIPTION ?? "", courses),
        title,
        type,
        dueDate: dueDate.toISOString(),
        estimatedHours: type === "exam" || type === "project" ? 4 : type === "quiz" ? 2 : 1.5,
        weight: inferWeight(title),
        pointsPossible: null,
        gradeCategory: null,
        confidence: 0.86,
        rawSourceUrl: event.URL ?? null
      } satisfies DetectedAcademicItem;
    });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { feedUrl?: string; courses?: unknown[] };
  const courses = courseSchema.array().safeParse(body.courses ?? []);

  if (!body.feedUrl || !courses.success) {
    return NextResponse.json({ error: "Provide a Canvas Calendar Feed URL and courses." }, { status: 400 });
  }

  let feedUrl: URL;
  try {
    feedUrl = new URL(body.feedUrl);
  } catch {
    return NextResponse.json({ error: "Canvas Calendar Feed URL is not valid." }, { status: 400 });
  }

  const localDevelopmentHost =
    feedUrl.hostname === "localhost" || feedUrl.hostname === "127.0.0.1";
  if (feedUrl.protocol !== "https:" && !(feedUrl.protocol === "http:" && localDevelopmentHost)) {
    return NextResponse.json({ error: "Canvas Calendar Feed URL must use HTTPS." }, { status: 400 });
  }

  try {
    const response = await fetch(feedUrl, {
      headers: { Accept: "text/calendar,text/plain;q=0.9" },
      cache: "no-store"
    });

    if (!response.ok) throw new Error("Canvas Calendar Feed request failed: " + response.status);

    const items = parseCanvasFeedEvents(await response.text(), courses.data);
    return NextResponse.json(
      academicImportResponseSchema.parse({
        items,
        gradeCategories: [],
        confidence: "api",
        message: "Found " + items.length + " Canvas calendar item" + (items.length === 1 ? "" : "s") + ". Review them before adding them to FlowState."
      })
    );
  } catch (error) {
    return NextResponse.json(
      {
        items: [],
        gradeCategories: [],
        confidence: "failed",
        message: error instanceof Error ? error.message : "Unable to read the Canvas Calendar Feed."
      },
      { status: 502 }
    );
  }
}
