import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("calendar deadline route", () => {
  it("rejects malformed JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/calendar/deadlines", {
        method: "POST",
        body: "not-json"
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ synced: false });
  });

  it("rejects a missing task before checking credentials", async () => {
    const response = await POST(
      new Request("http://localhost/api/calendar/deadlines", {
        method: "POST",
        body: JSON.stringify({})
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      reason: "A valid task is required."
    });
  });
});
