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

export const detectedAcademicItemSchema = z.object({
  id: z.string(),
  source: z.enum(["syllabus", "canvas", "gradescope", "slack"]),
  courseName: z.string().min(1),
  title: z.string().min(1),
  type: z.enum(["assignment", "quiz", "exam", "project", "reading", "task"]),
  dueDate: z.string().datetime(),
  estimatedHours: z.number().positive(),
  weight: z.enum(["low", "medium", "high"]),
  pointsPossible: z.number().positive().nullable(),
  gradeCategory: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  rawSourceUrl: z.string().nullable().optional()
});

export const detectedGradeCategorySchema = z.object({
  id: z.string(),
  courseName: z.string().min(1),
  name: z.string().min(1),
  weightPercent: z.number().min(0).max(100),
  source: z.enum(["syllabus", "canvas", "gradescope"]),
  confidence: z.number().min(0).max(1)
});

export const academicImportResponseSchema = z.object({
  items: z.array(detectedAcademicItemSchema),
  gradeCategories: z.array(detectedGradeCategorySchema),
  confidence: z.enum(["llm", "heuristic", "api", "failed"]),
  message: z.string()
});
