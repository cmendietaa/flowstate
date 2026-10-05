import { describe, expect, it } from "vitest";
import { mergeDetectedItems, mergeGradeCategories } from "@/lib/imports";
import type { DetectedAcademicItem, DetectedGradeCategory } from "@/lib/types";

const item = (overrides: Partial<DetectedAcademicItem> = {}): DetectedAcademicItem => ({
  id: "item-1",
  source: "syllabus",
  courseName: "PSTAT 120A",
  title: "Homework 2",
  type: "assignment",
  dueDate: "2026-10-12T23:59:00.000Z",
  estimatedHours: 2,
  weight: "low",
  pointsPossible: null,
  gradeCategory: null,
  confidence: 0.9,
  ...overrides
});

describe("academic import merging", () => {
  it("deduplicates the same assignment across sources", () => {
    expect(mergeDetectedItems([item()], [item({ id: "canvas-1", source: "canvas", title: " Homework   2 ", dueDate: "2026-10-12T17:00:00.000Z" })])).toHaveLength(1);
  });

  it("keeps separate assignments on the same course and date", () => {
    expect(mergeDetectedItems([item()], [item({ id: "item-2", title: "Quiz 1" })])).toHaveLength(2);
  });

  it("deduplicates grade categories by course and name", () => {
    const category: DetectedGradeCategory = {
      id: "cat-1",
      courseName: "PSTAT 120A",
      name: "Homework",
      weightPercent: 30,
      source: "syllabus",
      confidence: 0.9
    };
    expect(mergeGradeCategories([category], [{ ...category, id: "cat-2", source: "canvas" }])).toHaveLength(1);
  });
});
