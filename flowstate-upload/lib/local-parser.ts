import { addDays, setHours, setMinutes } from "date-fns";
import type { Course, ParsedTask } from "@/lib/types";

const weekdayIndexes = [
  ["sunday", 0],
  ["sun", 0],
  ["monday", 1],
  ["mon", 1],
  ["tuesday", 2],
  ["tue", 2],
  ["wednesday", 3],
  ["wed", 3],
  ["thursday", 4],
  ["thu", 4],
  ["friday", 5],
  ["fri", 5],
  ["saturday", 6],
  ["sat", 6]
] as const;

function nextWeekday(now: Date, targetDay: number) {
  const date = new Date(now);
  const distance = (targetDay + 7 - date.getDay()) % 7 || 7;
  date.setDate(date.getDate() + distance);
  return date;
}

function applyTime(date: Date, input: string) {
  const timeMatch = input.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  const result = new Date(date);

  if (!timeMatch) {
    result.setHours(23, 59, 0, 0);
    return result;
  }

  const suffix = timeMatch[3]?.toLowerCase();
  let hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2] ?? 0);

  if (suffix === "pm" && hours < 12) {
    hours += 12;
  }

  if (suffix === "am" && hours === 12) {
    hours = 0;
  }

  if (!suffix && hours < 8) {
    hours += 12;
  }

  result.setHours(hours, minutes, 0, 0);
  return result;
}

function inferDueDate(input: string, now: Date) {
  const lowerInput = input.toLowerCase();
  let date = setMinutes(setHours(addDays(now, 1), 23), 59);

  if (/\btoday\b/.test(lowerInput)) {
    date = new Date(now);
  } else if (/\btomorrow\b/.test(lowerInput)) {
    date = addDays(now, 1);
  } else {
    for (const [weekday, index] of weekdayIndexes) {
      if (new RegExp(`\\b${weekday}\\b`, "i").test(input)) {
        date = nextWeekday(now, index);
        break;
      }
    }
  }

  return applyTime(date, input).toISOString();
}

function inferWeight(input: string): ParsedTask["weight"] {
  const lowerInput = input.toLowerCase();

  if (/\b(high|exam|midterm|final|project|paper)\b/.test(lowerInput)) {
    return "high";
  }

  if (/\b(medium|quiz|essay|lab|draft)\b/.test(lowerInput)) {
    return "medium";
  }

  return "low";
}

function cleanTitle(input: string, courseName: string | null) {
  let title = input;

  if (courseName) {
    title = title.replace(new RegExp(courseName, "i"), "");
  }

  title = title
    .replace(/\b(due|by|at)\b/gi, " ")
    .replace(/\b(today|tomorrow|sun(day)?|mon(day)?|tue(sday)?|wed(nesday)?|thu(rsday)?|fri(day)?|sat(urday)?)\b/gi, " ")
    .replace(/\b\d+(\.\d+)?\s*(hours?|hrs?|h)\b/gi, " ")
    .replace(/\b\d{1,2}(?::\d{2})?\s*(am|pm)?\b/gi, " ")
    .replace(/\b(low|medium|high)\b/gi, " ")
    .replace(/[,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return title || input.trim() || "Untitled task";
}

export function parseTaskLocally(
  input: string,
  now: Date,
  courses: Pick<Course, "name">[]
): ParsedTask {
  const courseName =
    courses.find((course) =>
      new RegExp(`\\b${course.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(input)
    )?.name ?? null;
  const hoursMatch = input.match(/\b(\d+(?:\.\d+)?)\s*(hours?|hrs?|h)\b/i);

  return {
    title: cleanTitle(input, courseName),
    courseName,
    dueDate: inferDueDate(input, now),
    weight: inferWeight(input),
    estimatedHours: hoursMatch ? Number(hoursMatch[1]) : null
  };
}
