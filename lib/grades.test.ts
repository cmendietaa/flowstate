import { describe, expect, it } from "vitest";
import { calculateCourseGrade } from "@/lib/grades";
import type { DetectedGrade, DetectedGradeCategory } from "@/lib/types";

const category = (name: string, weightPercent: number): DetectedGradeCategory => ({
  id: name,
  courseName: "PSTAT 120A",
  name,
  weightPercent,
  source: "syllabus",
  confidence: 1
});

const grade = (
  title: string,
  earnedPoints: number,
  pointsPossible: number,
  gradeCategory: string
): DetectedGrade => ({
  id: title,
  source: "canvas",
  courseName: "PSTAT 120A",
  title,
  earnedPoints,
  pointsPossible,
  gradeCategory,
  confidence: 1
});

describe("course grade calculator", () => {
  it("applies category weights and renormalizes graded categories", () => {
    const result = calculateCourseGrade(
      [
        grade("Homework 1", 80, 100, "Homework"),
        grade("Midterm", 90, 100, "Exams")
      ],
      [category("Homework", 40), category("Exams", 60)]
    );

    expect(result).toEqual({
      percent: 86,
      mode: "weighted",
      gradedCount: 2
    });
  });

  it("falls back to points when category coverage is incomplete", () => {
    const result = calculateCourseGrade(
      [grade("Homework 1", 8, 10, "")],
      [category("Homework", 100)]
    );

    expect(result.percent).toBe(80);
    expect(result.mode).toBe("points");
  });
});
