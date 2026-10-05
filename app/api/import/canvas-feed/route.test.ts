import { describe, expect, it } from "vitest";
import { parseCanvasFeedEvents } from "./route";

describe("Canvas calendar feed parser", () => {
  it("normalizes events and matches course metadata", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:assignment-1",
      "DTSTART;VALUE=DATE:20261012",
      "SUMMARY:PSTAT 120A: Homework 2",
      "DESCRIPTION:Submit\\, online",
      "URL:https://canvas.example/assignments/1",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:exam-1",
      "DTSTART:20261015T210000Z",
      "SUMMARY:CHEM 1A Midterm Exam",
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n");

    const items = parseCanvasFeedEvents(ics, [
      { id: "pstat", name: "PSTAT 120A", color: "#5e8fbf" },
      { id: "chem", name: "CHEM 1A", color: "#d88b6a" }
    ]);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: "canvas-feed-assignment-1",
      courseName: "PSTAT 120A",
      title: "PSTAT 120A: Homework 2",
      type: "assignment",
      rawSourceUrl: "https://canvas.example/assignments/1"
    });
    expect(items[1]).toMatchObject({
      courseName: "CHEM 1A",
      type: "exam"
    });
  });
});
