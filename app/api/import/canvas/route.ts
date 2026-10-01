import { NextResponse } from "next/server";
import type { Course, DetectedAcademicItem, DetectedGradeCategory } from "@/lib/types";
import { academicImportResponseSchema, courseSchema } from "@/lib/schemas/task";

interface CanvasCourse {
  id: number;
  name?: string;
  course_code?: string;
}

interface CanvasAssignment {
  id: number;
  name: string;
  due_at: string | null;
  points_possible: number | null;
  html_url?: string;
  assignment_group_id?: number;
  submission_types?: string[];
}

interface CanvasAssignmentGroup {
  id: number;
  name: string;
  group_weight?: number;
}

async function canvasFetch<T>(baseUrl: string, token: string, path: string) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Canvas request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

function itemType(assignment: CanvasAssignment): DetectedAcademicItem["type"] {
  const text = `${assignment.name} ${(assignment.submission_types ?? []).join(" ")}`;

  if (/quiz/i.test(text)) return "quiz";
  if (/exam|midterm|final/i.test(text)) return "exam";
  if (/project|paper|essay/i.test(text)) return "project";
  return "assignment";
}

function weightFor(pointsPossible: number | null): DetectedAcademicItem["weight"] {
  if ((pointsPossible ?? 0) >= 100) return "high";
  if ((pointsPossible ?? 0) >= 30) return "medium";
  return "low";
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    canvasBaseUrl?: string;
    accessToken?: string;
    courses?: unknown[];
  };
  const courses = courseSchema.array().safeParse(body.courses ?? []);

  if (!body.canvasBaseUrl || !body.accessToken || !courses.success) {
    return NextResponse.json(
      { error: "Provide Canvas base URL, access token, and courses." },
      { status: 400 }
    );
  }

  try {
    const canvasCourses = await canvasFetch<CanvasCourse[]>(
      body.canvasBaseUrl,
      body.accessToken,
      "/api/v1/courses?enrollment_state=active&per_page=100"
    );

    const imports = await Promise.all(
      canvasCourses.slice(0, 12).map(async (canvasCourse) => {
        const [assignments, groups] = await Promise.all([
          canvasFetch<CanvasAssignment[]>(
            body.canvasBaseUrl!,
            body.accessToken!,
            `/api/v1/courses/${canvasCourse.id}/assignments?bucket=upcoming&per_page=100`
          ),
          canvasFetch<CanvasAssignmentGroup[]>(
            body.canvasBaseUrl!,
            body.accessToken!,
            `/api/v1/courses/${canvasCourse.id}/assignment_groups?per_page=100`
          ).catch(() => [])
        ]);
        const courseName =
          matchCourseName(canvasCourse, courses.data) ??
          canvasCourse.name ??
          canvasCourse.course_code ??
          "Unsorted Inbox";

        return {
          items: assignments
            .filter((assignment) => assignment.due_at)
            .map((assignment) => {
              const group = groups.find(
                (candidate) => candidate.id === assignment.assignment_group_id
              );

              return {
                id: `canvas-${canvasCourse.id}-${assignment.id}`,
                source: "canvas",
                courseName,
                title: assignment.name,
                type: itemType(assignment),
                dueDate: new Date(assignment.due_at!).toISOString(),
                estimatedHours: itemType(assignment) === "exam" ? 4 : 1.5,
                weight: weightFor(assignment.points_possible),
                pointsPossible: assignment.points_possible,
                gradeCategory: group?.name ?? null,
                confidence: 0.92,
                rawSourceUrl: assignment.html_url ?? null
              } satisfies DetectedAcademicItem;
            }),
          gradeCategories: groups
            .filter((group) => typeof group.group_weight === "number")
            .map((group) => ({
              id: `canvas-category-${canvasCourse.id}-${group.id}`,
              courseName,
              name: group.name,
              weightPercent: group.group_weight ?? 0,
              source: "canvas",
              confidence: 0.9
            } satisfies DetectedGradeCategory))
        };
      })
    );

    return NextResponse.json(
      academicImportResponseSchema.parse({
        items: imports.flatMap((result) => result.items),
        gradeCategories: imports.flatMap((result) => result.gradeCategories),
        confidence: "api",
        message: "Imported upcoming assignments from Canvas."
      })
    );
  } catch (error) {
    return NextResponse.json(
      {
        items: [],
        gradeCategories: [],
        confidence: "failed",
        message:
          error instanceof Error ? error.message : "Unable to import from Canvas."
      },
      { status: 502 }
    );
  }
}

function matchCourseName(canvasCourse: CanvasCourse, courses: Course[]) {
  const canvasNames = [canvasCourse.name, canvasCourse.course_code]
    .filter(Boolean)
    .map((name) => name!.toLowerCase());

  return courses.find((course) =>
    canvasNames.some((name) => name.includes(course.name.toLowerCase()))
  )?.name;
}
