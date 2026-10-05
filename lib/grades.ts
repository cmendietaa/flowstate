import type { DetectedGrade, DetectedGradeCategory } from "@/lib/types";

export interface CourseGradeResult {
  percent: number | null;
  mode: "weighted" | "points" | "unavailable";
  gradedCount: number;
}

function sameName(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function calculateCourseGrade(
  grades: DetectedGrade[],
  categories: DetectedGradeCategory[]
): CourseGradeResult {
  if (grades.length === 0) {
    return { percent: null, mode: "unavailable", gradedCount: 0 };
  }

  const pointsPossible = grades.reduce(
    (sum, grade) => sum + grade.pointsPossible,
    0
  );
  const earnedPoints = grades.reduce(
    (sum, grade) => sum + grade.earnedPoints,
    0
  );

  const weightedGroups = categories
    .map((category) => {
      const groupGrades = grades.filter(
        (grade) =>
          grade.gradeCategory &&
          sameName(grade.gradeCategory, category.name)
      );
      const groupPossible = groupGrades.reduce(
        (sum, grade) => sum + grade.pointsPossible,
        0
      );
      const groupEarned = groupGrades.reduce(
        (sum, grade) => sum + grade.earnedPoints,
        0
      );

      return {
        weight: category.weightPercent,
        percent: groupPossible > 0 ? (groupEarned / groupPossible) * 100 : null
      };
    })
    .filter(
      (group): group is { weight: number; percent: number } =>
        group.percent !== null && group.weight > 0
    );

  const hasCategoryCoverage =
    weightedGroups.length > 0 &&
    weightedGroups.reduce((sum, group) => sum + group.weight, 0) > 0 &&
    grades.every((grade) => grade.gradeCategory);

  if (hasCategoryCoverage) {
    const totalWeight = weightedGroups.reduce(
      (sum, group) => sum + group.weight,
      0
    );
    const weightedPercent = weightedGroups.reduce(
      (sum, group) => sum + group.percent * group.weight,
      0
    );

    return {
      percent: Math.round((weightedPercent / totalWeight) * 10) / 10,
      mode: "weighted",
      gradedCount: grades.length
    };
  }

  return {
    percent:
      pointsPossible > 0
        ? Math.round((earnedPoints / pointsPossible) * 1000) / 10
        : null,
    mode: pointsPossible > 0 ? "points" : "unavailable",
    gradedCount: grades.length
  };
}
