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
  source?: "manual" | "llm" | "calendar";
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
}

export interface ParsedTask {
  title: string;
  courseName: string | null;
  dueDate: string;
  weight: "low" | "medium" | "high";
  estimatedHours: number | null;
}

export type ParserConfidence = "llm" | "fallback" | "failed";
