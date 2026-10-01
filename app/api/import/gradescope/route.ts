import { NextResponse } from "next/server";
import { addDays, setHours, setMinutes } from "date-fns";
import type { Course, DetectedAcademicItem } from "@/lib/types";
import { academicImportResponseSchema, courseSchema } from "@/lib/schemas/task";

function inferCourseName(text: string, courses: Pick<Course, "name">[]) {
  return (
    courses.find((course) =>
      new RegExp(`\\b${course.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)
    )?.name ?? "Unsorted Inbox"
  );
}

function parseDate(value: string, now: Date) {
  const parsed = new Date(value);

  if (!Number.isNaN(parsed.getTime())) {
    parsed.setHours(23, 59, 0, 0);
    return parsed.toISOString();
  }

  return setMinutes(setHours(addDays(now, 7), 23), 59).toISOString();
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    text?: string;
    now?: string;
    courses?: unknown[];
  };
  const text = body.text?.trim() ?? "";
  const now = body.now ? new Date(body.now) : new Date();
  const courses = courseSchema.array().safeParse(body.courses ?? []);

  if (!text || !courses.success) {
    return NextResponse.json(
      { error: "Paste Gradescope assignment/export text and courses." },
      { status: 400 }
    );
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const items: DetectedAcademicItem[] = lines
    .filter((line) => /assignment|homework|project|quiz|exam|due/i.test(line))
    .slice(0, 30)
    .map((line, index) => {
      const columns = line.split(/,|\t/).map((column) => column.trim());
      const title =
        columns.find((column) => /assignment|homework|project|quiz|exam/i.test(column)) ??
        columns[0] ??
        `Gradescope item ${index + 1}`;
      const dateColumn =
        columns.find((column) => /\d{4}-\d{1,2}-\d{1,2}/.test(column)) ??
        columns.find((column) => /due/i.test(column)) ??
        line;

      return {
        id: `gradescope-${Date.now()}-${index}`,
        source: "gradescope",
        courseName: inferCourseName(line, courses.data),
        title: title.replace(/^[-*•\d.)\s]+/, "").slice(0, 120),
        type: /quiz/i.test(title)
          ? "quiz"
          : /exam|midterm|final/i.test(title)
            ? "exam"
            : /project/i.test(title)
              ? "project"
              : "assignment",
        dueDate: parseDate(dateColumn, now),
        estimatedHours: /exam|project/i.test(title) ? 4 : 1.5,
        weight: /exam|project|final|midterm/i.test(title) ? "high" : "medium",
        pointsPossible: null,
        gradeCategory: "Gradescope",
        confidence: /\d/.test(dateColumn) ? 0.65 : 0.35,
        rawSourceUrl: null
      };
    });

  return NextResponse.json(
    academicImportResponseSchema.parse({
      items,
      gradeCategories: [],
      confidence: "heuristic",
      message:
        "Imported from pasted Gradescope text. Direct Gradescope account sync can be added once API credentials/coverage are confirmed."
    })
  );
}
