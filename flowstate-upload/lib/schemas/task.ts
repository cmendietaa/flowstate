import { z } from "zod";

export const courseSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  color: z.string().min(1)
});

export const parsedTaskSchema = z.object({
  title: z.string().min(1),
  courseName: z.string().nullable(),
  dueDate: z.string().datetime(),
  weight: z.enum(["low", "medium", "high"]),
  estimatedHours: z.number().positive().nullable()
});

export const parseTaskRequestSchema = z.object({
  text: z.string().min(1),
  now: z.string().datetime(),
  courses: z.array(courseSchema)
});

export const parseTaskResponseSchema = z.object({
  parsed: parsedTaskSchema,
  confidence: z.enum(["llm", "fallback", "failed"])
});
