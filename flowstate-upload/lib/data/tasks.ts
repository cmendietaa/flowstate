import { calendarBlocks, courses, initialTasks } from "@/lib/mock-data";
import type { CalendarBlock, Course, Task } from "@/lib/types";

export interface DashboardSeedData {
  courses: Course[];
  tasks: Task[];
  calendarBlocks: CalendarBlock[];
  integrationStatus: {
    supabase: "connected" | "seeded";
    googleCalendar: "connected" | "not_connected";
  };
}

export async function getDashboardSeedData(): Promise<DashboardSeedData> {
  return {
    courses,
    tasks: initialTasks,
    calendarBlocks,
    integrationStatus: {
      supabase: "seeded",
      googleCalendar: "not_connected"
    }
  };
}
