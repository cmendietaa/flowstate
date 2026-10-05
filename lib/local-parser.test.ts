import { describe, expect, it } from "vitest";
import { parseTaskLocally } from "@/lib/local-parser";

describe("local task parser", () => {
  it("extracts a course, due date, estimate, and weight without an AI key", () => {
    const parsed = parseTaskLocally(
      "PSTAT 120A midterm tomorrow at 5pm, 3 hours",
      new Date("2026-10-05T12:00:00.000Z"),
      [{ name: "PSTAT 120A" }]
    );

    expect(parsed.courseName).toBe("PSTAT 120A");
    expect(parsed.title).toContain("midterm");
    expect(parsed.estimatedHours).toBe(3);
    expect(parsed.weight).toBe("high");
    const dueDate = new Date(parsed.dueDate);
    expect(dueDate.getDate()).toBe(6);
    expect(dueDate.getHours()).toBe(17);
  });
});
