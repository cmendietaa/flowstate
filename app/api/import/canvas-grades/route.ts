import { NextResponse } from "next/server";
import type { Course, DetectedGrade, DetectedGradeCategory } from "@/lib/types";
import {
  courseSchema,
  gradeSnapshotResponseSchema
} from "@/lib/schemas/task";

function courseMentionedIn(line: string, courses: Course[]) {
  const normalized = line.toLowerCase();
  return courses.find((course) =>
    normalized.includes(course.name.toLowerCase())
  )?.name;
}

function cleanTitle(value: string, courseName: string) {
  return value
    .replace(new RegExp(courseName.replace(/[.*+?^_()|[\]\\]/g, "\\$&"), "ig"), "")
    .replace(/^[-*•\d.)\s]+/, "")
    .trim()
    .slice(0, 140);
}

function parseCategories(lines: string[], courses: Course[]) {
  const categories: DetectedGradeCategory[] = [];
  let activeCourse = "Unsorted Inbox";

  for (const [index, line] of lines.entries()) {
    activeCourse = courseMentionedIn(line, courses) ?? activeCourse;
    const match = line.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*%$/);
    if (!match || /current|total|grade|earned/i.test(match[1])) continue;

    const courseName = courseMentionedIn(line, courses) ?? activeCourse;
    categories.push({
      id: "canvas-grade-category-" + index + "-" + match[1].trim().toLowerCase(),
      courseName,
      name: match[1].trim(),
      weightPercent: Number(match[2]),
      source: "canvas",
      confidence: 0.72
    });
  }

  return categories;
}

function parseGrades(lines: string[], courses: Course[]) {
  const grades: DetectedGrade[] = [];
  let activeCourse = "Unsorted Inbox";

  for (const [index, line] of lines.entries()) {
    activeCourse = courseMentionedIn(line, courses) ?? activeCourse;
    const score = line.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
    if (!score || Number(score[2]) <= 0) continue;

    const columns = line.split(/\t+|\s{2,}/).map((column) => column.trim()).filter(Boolean);
    const courseName = courseMentionedIn(line, courses) ?? activeCourse;
    const title = cleanTitle(columns[0] ?? line.split(score[0])[0], courseName);
    if (!title || /total|current grade|group percentage/i.test(title)) continue;

    grades.push({
      id: "canvas-grade-" + index + "-" + title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      source: "canvas",
      courseName,
      title,
      earnedPoints: Number(score[1]),
      pointsPossible: Number(score[2]),
      gradeCategory: columns.length > 2 ? columns[1] ?? null : null,
      confidence: columns.length > 1 ? 0.78 : 0.58
    });
  }

  return grades;
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    text?: string;
    courses?: unknown[];
  };
  const text = body.text?.trim() ?? "";
  const courses = courseSchema.array().safeParse(body.courses ?? []);

  if (!text || !courses.success) {
    return NextResponse.json(
      { error: "Paste a Canvas printable Grades view and courses." },
      { status: 400 }
    );
  }

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const grades = parseGrades(lines, courses.data);
  const gradeCategories = parseCategories(lines, courses.data);

  return NextResponse.json(
    gradeSnapshotResponseSchema.parse({
      grades,
      gradeCategories,
      confidence: "heuristic",
      message:
        grades.length > 0
          ? "Parsed " + grades.length + " Canvas grade rows. Course totals are shown as a snapshot until the next import."
          : "No score rows were found. Copy the printable Grades table from Canvas and try again."
    })
  );
}
