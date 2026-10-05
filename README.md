# FlowState

FlowState is a lightweight academic tracker with a deterministic priority engine, a keyboard-first quick-drop command bar, Supabase-backed persistence, and Google Calendar synchronization.

## Local Development

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Environment

Copy `.env.example` to `.env.local` when enabling live integrations:

```bash
cp .env.example .env.local
```

Then fill in the values in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is still accepted locally for older projects, but new Supabase projects should use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The Google client variables are reserved for future server-side OAuth flows; the current calendar connection uses the provider token returned by Supabase Auth.

For Google Calendar sync, enable the Google provider in Supabase Auth and request:

```text
openid email profile https://www.googleapis.com/auth/calendar
```

Add your local and deployed site URLs to the Supabase redirect allow-list.

### Live integration checklist

1. Run the SQL in `supabase/schema.sql` in the Supabase SQL Editor.
2. In Supabase, enable Google under Authentication > Sign In / Providers.
3. In Google Cloud, enable the Google Calendar API for the OAuth client used by that provider.
4. Request the Calendar scope shown above and add `http://localhost:3000/` to the Supabase redirect allow-list.
5. Restart `npm run dev` after changing `.env.local`.
6. Open Settings, choose **Connect Google Calendar**, then approve calendar access.
7. Confirm that Calendar shows external events, create a FlowState task, and check for a `FlowState Deadlines` calendar in Google Calendar.

If credentials are missing, FlowState intentionally stays usable in seeded demo mode. A failed calendar request does not discard the local task change; Settings reports the sync issue so it can be retried.

## Data

The initial Supabase schema lives in `supabase/schema.sql`. It models `courses` and `tasks`, enables row level security, and intentionally does not persist `priority_score`; scores are calculated from current task state at read time.

## Current Integration Boundaries

- `/api/parse-task` calls OpenAI structured outputs when `OPENAI_API_KEY` is present.
- `/api/calendar/events`, `/api/calendar/deadlines`, and `/api/calendar/sync` use the Supabase Google provider token to pull events and sync FlowState deadlines.
- Authenticated users load their own courses and tasks from Supabase; users without credentials can evaluate the seeded demo immediately.
- FlowState creates or reuses a secondary `FlowState Deadlines` calendar and removes completed task deadlines from it.
