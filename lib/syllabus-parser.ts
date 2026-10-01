import { addDays, setHours, setMinutes } from "date-fns";
import type { Course, DetectedAcademicItem, DetectedGradeCategory } from "@/lib/types";

const assessmentWords = /(assignment|homework|problem set|pset|quiz|exam|midterm|final|project|paper|essay|lab|reading)/i;
const datePattern =
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:,\s*\d{4})?/i;

function inferCourseName(text: string, courses: Pick<Course, "name">[]) {
  const matched = courses.find((course) =>
    new RegExp(`\\b${course.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)
  );

  if (matched) {
    return matched.name;
  }

  const courseLike = text.match(/\b[A-Z]{2,5}\s?\d{1,4}[A-Z]?\b/);
  return courseLike?.[0] ?? "Unsorted Inbox";
}

function parseDueDate(line: string, now: Date) {
  const match = line.match(datePattern);
  const fallback = setMinutes(setHours(addDays(now, 7), 23), 59);

  if (!match) {
    return fallback.toISOString();
  }

  const parsed = new Date(match[0]);

  if (Number.isNaN(parsed.getTime())) {
    return fallback.toISOString();
  }

  if (!/\d{4}/.test(match[0])) {
    parsed.setFullYear(now.getFullYear());
  }

  parsed.setHours(23, 59, 0, 0);
  return parsed.toISOString();
}

function inferType(title: string): DetectedAcademicItem["type"] {
  if (/quiz/i.test(title)) return "quiz";
  if (/exam|midterm|final/i.test(title)) return "exam";
  if (/project|paper|essay/i.test(title)) return "project";
  if (/reading/i.test(title)) return "reading";
  return /assignment|homework|problem set|pset|lab/i.test(title)
    ? "assignment"
    : "task";
}

function inferWeight(title: string): DetectedAcademicItem["weight"] {
  if (/exam|midterm|final|project|paper/i.test(title)) return "high";
  if (/quiz|lab|essay/i.test(title)) return "medium";
  return "low";
}

function cleanTitle(line: string) {
  return line
    .replace(datePattern, "")
    .replace(/\b(due|on|by|at)\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[-*•\d.)\s]+/, "")
    .trim()
    .slice(0, 120);
}

export function parseSyllabusHeuristically({
  text,
  now,
  courses
}: {
  text: string;
  now: Date;
  courses: Pick<Course, "name">[];
}) {
  const courseName = inferCourseName(text, courses);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const items: DetectedAcademicItem[] = lines
    .filter((line) => assessmentWords.test(line) && (datePattern.test(line) || /due/i.test(line)))
    .slice(0, 20)
    .map((line, index) => {
      const title = cleanTitle(line) || `Detected item ${index + 1}`;
      const type = inferType(title);

      return {
        id: `syllabus-${Date.now()}-${index}`,
        source: "syllabus",
        courseName,
        title,
        type,
        dueDate: parseDueDate(line, now),
        estimatedHours: type === "exam" ? 4 : type === "project" ? 5 : 1.5,
        weight: inferWeight(title),
        pointsPossible: null,
        gradeCategory:
          type === "exam"
            ? "Exams"
            : type === "quiz"
              ? "Quizzes"
              : type === "project"
                ? "Projects"
                : "Assignments",
        confidence: datePattern.test(line) ? 0.7 : 0.45,
        rawSourceUrl: null
      };
    });

  const gradeCategories = parseGradeCategories(text, courseName);

  return { items, gradeCategories };
}

function parseGradeCategories(text: string, courseName: string) {
  const categoryPattern =
    /^\s*([A-Za-z][A-Za-z\s/&-]{2,40})\s*(?:[:=-]|\s)\s*(\d{1,3})(?:\s*%|\s*percent)\s*$/gim;
  const categories: DetectedGradeCategory[] = [];
  let match: RegExpExecArray | null;

  while ((match = categoryPattern.exec(text)) !== null) {
    const weightPercent = Number(match[2]);

    if (weightPercent <= 100) {
      categories.push({
        id: `category-${Date.now()}-${categories.length}`,
        courseName,
        name: match[1].trim(),
        weightPercent,
        source: "syllabus",
        confidence: 0.7
      });
    }
  }

  return categories.slice(0, 12);
}
