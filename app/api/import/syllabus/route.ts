import { NextResponse } from "next/server";
import OpenAI from "openai";
import { parseSyllabusHeuristically } from "@/lib/syllabus-parser";
import { academicImportResponseSchema, courseSchema } from "@/lib/schemas/task";

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
      { error: "Provide syllabus text and courses." },
      { status: 400 }
    );
  }

  const heuristic = parseSyllabusHeuristically({
    text,
    now,
    courses: courses.data
  });

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      academicImportResponseSchema.parse({
        ...heuristic,
        confidence: "heuristic",
        message: "Imported with local syllabus heuristics."
      })
    );
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Extract academic assignments, quizzes, exams, projects, readings, and grade category weights from syllabus text. Return strict JSON only. Put uncertain items in the result with lower confidence instead of inventing dates."
        },
        {
          role: "user",
          content: JSON.stringify({
            now: now.toISOString(),
            courses: courses.data.map((course) => course.name),
            syllabusText: text.slice(0, 24000)
          })
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "academic_import",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    id: { type: "string" },
                    source: { enum: ["syllabus"] },
                    courseName: { type: "string" },
                    title: { type: "string" },
                    type: { enum: ["assignment", "quiz", "exam", "project", "reading", "task"] },
                    dueDate: { type: "string" },
                    estimatedHours: { type: "number" },
                    weight: { enum: ["low", "medium", "high"] },
                    pointsPossible: { type: ["number", "null"] },
                    gradeCategory: { type: ["string", "null"] },
                    confidence: { type: "number" },
                    rawSourceUrl: { type: ["string", "null"] }
                  },
                  required: [
                    "id",
                    "source",
                    "courseName",
                    "title",
                    "type",
                    "dueDate",
                    "estimatedHours",
                    "weight",
                    "pointsPossible",
                    "gradeCategory",
                    "confidence",
                    "rawSourceUrl"
                  ]
                }
              },
              gradeCategories: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    id: { type: "string" },
                    courseName: { type: "string" },
                    name: { type: "string" },
                    weightPercent: { type: "number" },
                    source: { enum: ["syllabus"] },
                    confidence: { type: "number" }
                  },
                  required: ["id", "courseName", "name", "weightPercent", "source", "confidence"]
                }
              }
            },
            required: ["items", "gradeCategories"]
          }
        }
      }
    });

    const parsed = academicImportResponseSchema.parse({
      ...JSON.parse(completion.choices[0]?.message.content || "{}"),
      confidence: "llm",
      message: "Imported with AI syllabus extraction."
    });

    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json(
      academicImportResponseSchema.parse({
        ...heuristic,
        confidence: "heuristic",
        message: "AI extraction failed, so FlowState used local syllabus heuristics."
      })
    );
  }
}
