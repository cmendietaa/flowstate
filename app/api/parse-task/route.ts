import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { Course, ParsedTask } from "@/lib/types";
import { parseTaskLocally } from "@/lib/local-parser";
import {
  parsedTaskSchema,
  parseTaskRequestSchema,
  parseTaskResponseSchema
} from "@/lib/schemas/task";

function fallbackParsedTask(input: string, now: string, courses: Course[]): ParsedTask {
  return parseTaskLocally(input, new Date(now), courses);
}

export async function POST(request: Request) {
  const payload = parseTaskRequestSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json(
      { error: "Invalid task parser request." },
      { status: 400 }
    );
  }

  const { text, now, courses } = payload.data;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(parseTaskResponseSchema.parse({
      parsed: fallbackParsedTask(text, now, courses),
      confidence: "fallback"
    }));
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Parse academic task input into strict JSON. Match courseName only to provided course names. If uncertain, use null for courseName, tomorrow at 23:59 local time for dueDate, low for weight, and null for estimatedHours."
        },
        {
          role: "user",
          content: JSON.stringify({
            input: text,
            currentDatetime: now,
            courses: courses.map((course) => course.name)
          })
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "parsed_task",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              courseName: { type: ["string", "null"] },
              dueDate: { type: "string" },
              weight: { enum: ["low", "medium", "high"] },
              estimatedHours: { type: ["number", "null"] }
            },
            required: [
              "title",
              "courseName",
              "dueDate",
              "weight",
              "estimatedHours"
            ]
          },
          strict: true
        }
      }
    });

    const parsed = parsedTaskSchema.parse(JSON.parse(
      completion.choices[0]?.message.content || "{}"
    ));

    return NextResponse.json(parseTaskResponseSchema.parse({ parsed, confidence: "llm" }));
  } catch {
    return NextResponse.json(parseTaskResponseSchema.parse({
      parsed: fallbackParsedTask(text, now, courses),
      confidence: "fallback"
    }));
  }
}
