import { addDays, addHours, setHours, setMinutes } from "date-fns";
import type { CalendarBlock, Course, Task } from "@/lib/types";

const now = new Date();

export const courses: Course[] = [
  { id: "pstat-120a", name: "PSTAT 120A", color: "#5e8fbf" },
  { id: "hist-17b", name: "HIST 17B", color: "#d66f5f" },
  { id: "chem-1a", name: "CHEM 1A", color: "#567568" },
  { id: "inbox", name: "Unsorted Inbox", color: "#c99a2e" }
];

export const initialTasks: Task[] = [
  {
    id: "task-midterm",
    course_id: "pstat-120a",
    title: "Midterm exam review set",
    item_type: "assignment",
    due_date: addHours(now, 30).toISOString(),
    estimated_total_hours: 7,
    estimated_hours: 7,
    progress_percent: 35,
    remaining_hours_override: null,
    weight: 0.25,
    is_completed: false,
    source: "manual"
  },
  {
    id: "task-essay",
    course_id: "hist-17b",
    title: "Primary source essay draft",
    item_type: "assignment",
    due_date: addDays(now, 4).toISOString(),
    estimated_total_hours: 5,
    estimated_hours: 5,
    progress_percent: 10,
    remaining_hours_override: null,
    weight: 0.15,
    is_completed: false,
    source: "manual"
  },
  {
    id: "task-lab",
    course_id: "chem-1a",
    title: "Lab report: calorimetry",
    item_type: "assignment",
    due_date: addDays(now, 2).toISOString(),
    estimated_total_hours: 3,
    estimated_hours: 3,
    progress_percent: 60,
    remaining_hours_override: null,
    weight: 0.08,
    is_completed: false,
    source: "manual"
  }
];

export const calendarBlocks: CalendarBlock[] = [
  {
    id: "class-pstat",
    title: "PSTAT lecture",
    start: setMinutes(setHours(now, 10), 0).toISOString(),
    end: setMinutes(setHours(now, 11), 15).toISOString(),
    course_id: "pstat-120a",
    kind: "class"
  },
  {
    id: "personal-work",
    title: "Work block",
    start: setMinutes(setHours(now, 14), 0).toISOString(),
    end: setMinutes(setHours(now, 16), 0).toISOString(),
    kind: "personal"
  },
  {
    id: "exam-slot",
    title: "CHEM 1A quiz",
    start: setMinutes(setHours(addDays(now, 1), 9), 30).toISOString(),
    end: setMinutes(setHours(addDays(now, 1), 10), 20).toISOString(),
    course_id: "chem-1a",
    kind: "exam"
  }
];
