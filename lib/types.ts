export interface Course {
  id: string;
  name: string;
  color: string;
}

export interface Task {
  id: string;
  course_id: string | null;
  title: string;
  item_type: "task" | "assignment";
  due_date: string;
  estimated_total_hours: number;
  estimated_hours: number;
  progress_percent: number;
  remaining_hours_override: number | null;
  weight: number;
  is_completed: boolean;
  google_event_id?: string | null;
  source?: "manual" | "llm" | "calendar" | "syllabus" | "canvas" | "gradescope" | "slack";
  created_at?: string;
  updated_at?: string;
}

export interface TaskWithPriority extends Task {
  priority_score: number;
  hours_remaining: number;
  remaining_hours: number;
}

export interface CalendarBlock {
  id: string;
  title: string;
  start: string;
  end: string;
  course_id?: string | null;
  kind: "class" | "exam" | "personal" | "deadline";
  external_id?: string;
  calendar_id?: string;
  is_readonly?: boolean;
}

export interface ParsedTask {
  title: string;
  courseName: string | null;
  dueDate: string;
  weight: "low" | "medium" | "high";
  estimatedHours: number | null;
}

export type ParserConfidence = "llm" | "fallback" | "failed";

export type AcademicSource = "manual" | "llm" | "calendar" | "syllabus" | "canvas" | "gradescope" | "slack";

export interface DetectedAcademicItem {
  id: string;
  source: Extract<AcademicSource, "syllabus" | "canvas" | "gradescope" | "slack">;
  courseName: string;
  title: string;
  type: "assignment" | "quiz" | "exam" | "project" | "reading" | "task";
  dueDate: string;
  estimatedHours: number;
  weight: "low" | "medium" | "high";
  pointsPossible: number | null;
  gradeCategory: string | null;
  confidence: number;
  rawSourceUrl?: string | null;
}

export interface DetectedGradeCategory {
  id: string;
  courseName: string;
  name: string;
  weightPercent: number;
  source: Extract<AcademicSource, "syllabus" | "canvas" | "gradescope">;
  confidence: number;
}

export interface DetectedGrade {
  id: string;
  source: "canvas";
  courseName: string;
  title: string;
  earnedPoints: number;
  pointsPossible: number;
  gradeCategory: string | null;
  confidence: number;
}
