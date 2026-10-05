import type { DetectedAcademicItem, DetectedGradeCategory } from "@/lib/types";

export function mergeDetectedItems(
  current: DetectedAcademicItem[],
  incoming: DetectedAcademicItem[]
) {
  const getKey = (item: DetectedAcademicItem) =>
    [
      item.courseName.trim().toLowerCase(),
      item.title.trim().toLowerCase().replace(/\s+/g, " "),
      item.dueDate.slice(0, 10)
    ].join(":");
  const existing = new Set(current.map(getKey));
  const additions = incoming.filter((item) => {
    const key = getKey(item);
    if (existing.has(key)) return false;
    existing.add(key);
    return true;
  });
  return [...additions, ...current];
}

export function mergeGradeCategories(
  current: DetectedGradeCategory[],
  incoming: DetectedGradeCategory[]
) {
  const existing = new Set(
    current.map((category) => `${category.courseName}:${category.name}`)
  );
  const additions = incoming.filter((category) => {
    const key = `${category.courseName}:${category.name}`;
    if (existing.has(key)) return false;
    existing.add(key);
    return true;
  });
  return [...current, ...additions];
}
