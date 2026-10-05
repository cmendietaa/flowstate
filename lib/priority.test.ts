import { describe, expect, it } from "vitest";
import { calculatePriorityScore, rankTasks } from "@/lib/priority";
import type { Task } from "@/lib/types";

const now = new Date("2026-10-05T12:00:00.000Z");

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    course_id: "course-1",
    title: "Assignment",
    item_type: "assignment",
    due_date: "2026-10-06T12:00:00.000Z",
    estimated_total_hours: 4,
    estimated_hours: 4,
    progress_percent: 0,
    remaining_hours_override: null,
    weight: 0.15,
    is_completed: false,
    ...overrides
  };
}

describe("priority engine", () => {
  it("calculates the deterministic score from time, weight, and remaining work", () => {
    const result = calculatePriorityScore(task(), now);

    expect(result.hoursRemaining).toBe(24);
    expect(result.remainingWork).toBe(4);
    expect(result.score).toBeCloseTo(0.097, 3);
  });

  it("uses an explicit remaining-hours override", () => {
    const result = calculatePriorityScore(
      task({ remaining_hours_override: 1, progress_percent: 80 }),
      now
    );

    expect(result.remainingWork).toBe(1);
  });

  it("ranks open tasks by score and excludes completed tasks", () => {
    const ranked = rankTasks(
      [
        task({ id: "later", due_date: "2026-10-10T12:00:00.000Z", weight: 0.3 }),
        task({ id: "soon", due_date: "2026-10-05T13:00:00.000Z", weight: 0.05 }),
        task({ id: "done", is_completed: true })
      ],
      now
    );

    expect(ranked.map((item) => item.id)).toEqual(["soon", "later"]);
  });
});
