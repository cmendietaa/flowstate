import type { Task, TaskWithPriority } from "@/lib/types";

const MS_PER_HOUR = 1000 * 60 * 60;

export function clampProgress(progress: number) {
  return Math.min(100, Math.max(0, Math.round(progress)));
}

export function getTaskTotalHours(task: Pick<Task, "estimated_total_hours" | "estimated_hours">) {
  return Math.max(0, task.estimated_total_hours ?? task.estimated_hours ?? 0);
}

export function getTaskRemainingHours(
  task: Pick<
    Task,
    | "estimated_total_hours"
    | "estimated_hours"
    | "progress_percent"
    | "remaining_hours_override"
  >
) {
  if (typeof task.remaining_hours_override === "number") {
    return Math.max(0, task.remaining_hours_override);
  }

  const totalHours = getTaskTotalHours(task);
  const remainingRatio = (100 - clampProgress(task.progress_percent ?? 0)) / 100;

  return Number((totalHours * remainingRatio).toFixed(1));
}

export function calculatePriorityScore(
  task: Pick<
    Task,
    | "due_date"
    | "estimated_hours"
    | "estimated_total_hours"
    | "progress_percent"
    | "remaining_hours_override"
    | "weight"
  >,
  now = new Date()
) {
  const due = new Date(task.due_date);
  const rawHoursRemaining = (due.getTime() - now.getTime()) / MS_PER_HOUR;
  const hoursRemaining = Math.max(0, rawHoursRemaining);
  const denominator = hoursRemaining + 1;
  const remainingWork = getTaskRemainingHours(task);

  return {
    hoursRemaining,
    remainingWork,
    score:
      (1 / denominator) * 0.5 +
      task.weight * 0.3 +
      (remainingWork / denominator) * 0.2
  };
}

export function scoreTasks(tasks: Task[], now = new Date()): TaskWithPriority[] {
  return tasks
    .map((task) => {
      const priority = calculatePriorityScore(task, now);

      return {
        ...task,
        priority_score: priority.score,
        hours_remaining: priority.hoursRemaining,
        remaining_hours: priority.remainingWork
      };
    })
    .sort((a, b) => {
      if (b.priority_score !== a.priority_score) {
        return b.priority_score - a.priority_score;
      }

      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });
}

export function rankTasks(tasks: Task[], now = new Date()): TaskWithPriority[] {
  return scoreTasks(
    tasks.filter((task) => !task.is_completed),
    now
  );
}

export function weightLabelToValue(weight: "low" | "medium" | "high") {
  const weights = {
    low: 0.05,
    medium: 0.15,
    high: 0.3
  };

  return weights[weight];
}
