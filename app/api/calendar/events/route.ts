import { addDays } from "date-fns";
import { NextResponse } from "next/server";
import {
  getAccessToken,
  listGoogleCalendarBlocks
} from "@/lib/google-calendar-server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const accessToken = getAccessToken(request);
  const timeMin =
    url.searchParams.get("timeMin") ?? addDays(new Date(), -1).toISOString();
  const timeMax =
    url.searchParams.get("timeMax") ?? addDays(new Date(), 14).toISOString();

  if (!accessToken) {
    return NextResponse.json(
      {
        blocks: [],
        connected: false,
        reason: "Google Calendar is not connected."
      },
      { status: 401 }
    );
  }

  try {
    const blocks = await listGoogleCalendarBlocks({
      accessToken,
      timeMin,
      timeMax
    });

    return NextResponse.json({ blocks, connected: true });
  } catch (error) {
    return NextResponse.json(
      {
        blocks: [],
        connected: false,
        reason:
          error instanceof Error
            ? error.message
            : "Unable to fetch Google Calendar events."
      },
      { status: 502 }
    );
  }
}
