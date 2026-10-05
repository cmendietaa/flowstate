import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("calendar sync route", () => {
  it("rejects a sync without credentials", async () => {
    const response = await POST(
      new Request("http://localhost/api/calendar/sync", {
        method: "POST",
        body: JSON.stringify({ tasks: [] })
      })
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      synced: false,
      results: []
    });
  });

  it("returns a helpful validation error for malformed tasks", async () => {
    const response = await POST(
      new Request("http://localhost/api/calendar/sync", {
        method: "POST",
        body: JSON.stringify({ tasks: [{ title: "Missing required fields" }] })
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      reason: "A valid tasks array is required."
    });
  });
});
